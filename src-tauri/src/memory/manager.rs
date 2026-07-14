use std::path::Path;
use std::sync::mpsc::channel;
use tauri::{AppHandle, Manager};
use crate::memory::models::HunkSelection;
use crate::memory::database_worker::{DB_WORKER_SENDER, DatabaseTask, CommitImport, FileOpImport};
use crate::memory::scheduler::{SCHEDULER_SENDER, SchedulerTask};
use crate::memory::locks::ProjectLock;
use crate::memory::journal::ActiveJournal;

// --- High-Level Non-Blocking Tauri Commands (Delegates to Scheduler Queue) ---

pub fn initialize_project(app: &AppHandle, project_path: &str) -> Result<String, String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let project_id = super::backup_service::get_or_create_project_id(app, project_path)?;

    let (resp_tx, resp_rx) = channel();
    let sender = SCHEDULER_SENDER.get().ok_or("Scheduler worker not started")?;
    sender.send(SchedulerTask::Initialize {
        git_path,
        app_data_dir,
        project_id,
        project_path: project_path.to_string(),
        resp_tx,
    }).map_err(|e| e.to_string())?;
    resp_rx.recv().map_err(|e| e.to_string())?
}

pub fn create_checkpoint(app: &AppHandle, project_path: &str, name: &str) -> Result<String, String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let project_id = super::backup_service::get_or_create_project_id(app, project_path)?;

    let (resp_tx, resp_rx) = channel();
    let sender = SCHEDULER_SENDER.get().ok_or("Scheduler worker not started")?;
    sender.send(SchedulerTask::CreateCheckpoint {
        git_path,
        app_data_dir,
        project_id,
        project_path: project_path.to_string(),
        name: name.to_string(),
        resp_tx,
    }).map_err(|e| e.to_string())?;
    resp_rx.recv().map_err(|e| e.to_string())?
}

pub fn create_snapshot(
    app: &AppHandle,
    project_path: &str,
    source: &str,
    description: Option<String>,
    session_id: Option<String>,
) -> Result<String, String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;

    let (resp_tx, resp_rx) = channel();
    let sender = SCHEDULER_SENDER.get().ok_or("Scheduler worker not started")?;
    sender.send(SchedulerTask::CreateSnapshot {
        git_path,
        project_path: project_path.to_string(),
        source: source.to_string(),
        description,
        session_id,
        resp_tx,
    }).map_err(|e| e.to_string())?;
    resp_rx.recv().map_err(|e| e.to_string())?
}

pub fn restore_commit(
    app: &AppHandle,
    project_path: &str,
    commit_hash: &str,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let project_id = super::backup_service::get_or_create_project_id(app, project_path)?;

    let (resp_tx, resp_rx) = channel();
    let sender = SCHEDULER_SENDER.get().ok_or("Scheduler worker not started")?;
    sender.send(SchedulerTask::Restore {
        git_path,
        app_data_dir,
        project_id,
        project_path: project_path.to_string(),
        commit_hash: commit_hash.to_string(),
        files,
        resp_tx,
    }).map_err(|e| e.to_string())?;
    resp_rx.recv().map_err(|e| e.to_string())?
}

// --- High-Level Command API Functions (Passthrough) ---

pub fn review_change(
    project_path: &str,
    commit_hash: &str,
    status: &str,
) -> Result<(), String> {
    let (resp_tx, resp_rx) = channel();
    let sender = DB_WORKER_SENDER.get().ok_or("Database worker not started")?;
    sender.send(DatabaseTask::UpdateReview {
        project_path: project_path.to_string(),
        commit_hash: commit_hash.to_string(),
        status: status.to_string(),
        resp_tx,
    }).map_err(|e| e.to_string())?;
    resp_rx.recv().map_err(|e| e.to_string())?
}

pub fn apply_hunks(
    app: &AppHandle,
    project_path: &str,
    commit_hash: &str,
    approved_hunks: Vec<HunkSelection>,
) -> Result<(), String> {
    let _lock = ProjectLock::acquire(project_path, "restore")?;
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    for hunk in approved_hunks {
        if hunk.approved {
            let _ = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["checkout", commit_hash, "--", &hunk.file_path]);
        }
    }
    Ok(())
}

pub fn read_commit_version(
    app: &AppHandle,
    project_path: &str,
    commit_hash: &str,
    file_path: &str,
) -> Result<String, String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    let show_spec = format!("{}:{}", commit_hash, file_path);
    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["show", &show_spec])
}

pub fn get_diff(
    app: &AppHandle,
    project_path: &str,
    from_commit: &str,
    to_commit: &str,
) -> Result<String, String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["diff", from_commit, to_commit])
}

// --- Serialized Queue Execution Logic (Runs on Worker Threads) ---

pub fn initialize_project_sync(
    git_path: &Path,
    app_data_dir: &Path,
    project_id: &str,
    project_path: &str,
) -> Result<String, String> {
    let _lock = ProjectLock::acquire(project_path, "initialize")?;

    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    if !git_dir.exists() {
        super::git_provider::init_repo(git_path, &git_dir, work_tree)?;
    }

    // Call DB Worker to initialize schema
    let (db_tx, db_rx) = channel();
    let db_sender = DB_WORKER_SENDER.get().ok_or("DB Worker not active")?;
    db_sender.send(DatabaseTask::InitializeSchema {
        project_path: project_path.to_string(),
        resp_tx: db_tx,
    }).map_err(|e| e.to_string())?;
    db_rx.recv().map_err(|e| e.to_string())??;

    let has_git_history = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["rev-parse", "--is-inside-work-tree"]).is_ok()
        && super::git_provider::execute_git(git_path, &git_dir, work_tree, &["rev-parse", "HEAD"]).is_ok();

    if has_git_history {
        // Query DB count via DB Worker
        let (count_tx, count_rx) = channel();
        db_sender.send(DatabaseTask::GetDbCommitsCount {
            project_path: project_path.to_string(),
            resp_tx: count_tx,
        }).map_err(|e| e.to_string())?;
        let db_commits_count = count_rx.recv().map_err(|e| e.to_string())??;

        if db_commits_count == 0 {
            let log_stdout = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["log", "--reverse", "--format=%H"])?;
            let mut commits = Vec::new();
            for hash in log_stdout.lines() {
                let hash = hash.trim();
                if hash.is_empty() { continue; }

                let subject = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["log", "-1", "--format=%s", hash]).unwrap_or_else(|_| "Imported state".to_string());
                let author_time = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["log", "-1", "--format=%aI", hash]).unwrap_or_default();
                let source = if subject.contains("AI") || subject.contains("Agent") { "agent" } else if subject.contains("Baseline") || subject.contains("system") { "system" } else { "user" };

                commits.push(CommitImport {
                    hash: hash.to_string(),
                    source: source.to_string(),
                    description: subject,
                    timestamp: author_time,
                });
            }

            if !commits.is_empty() {
                let (imp_tx, imp_rx) = channel();
                db_sender.send(DatabaseTask::ImportGitCommits {
                    project_path: project_path.to_string(),
                    commits,
                    resp_tx: imp_tx,
                }).map_err(|e| e.to_string())?;
                imp_rx.recv().map_err(|e| e.to_string())??;
            }
        }
        
        let head_hash = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;
        
        // Triggers incremental vault backup sync
        let _ = super::backup_service::backup_project(git_path, app_data_dir, project_id, project_path);

        return Ok(head_hash);
    }

    let exclude_path = git_dir.join("info").join("exclude");
    let mut exclude_content = std::fs::read_to_string(&exclude_path).unwrap_or_default();
    
    fn scan_large_files(dir: &Path, root: &Path, exclude_str: &mut String) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') && name != ".env" { continue; }
                if path.is_dir() {
                    if name == "node_modules" || name == "target" || name == "dist" || name == "build" || name == ".nexora" {
                        continue;
                    }
                    scan_large_files(&path, root, exclude_str);
                } else {
                    if let Ok(meta) = entry.metadata() {
                        if meta.len() >= 50_000_000 {
                            let rel = path.strip_prefix(root).unwrap().to_string_lossy().replace("\\", "/");
                            exclude_str.push_str(&format!("{}\n", rel));
                        }
                    }
                }
            }
        }
    }
    
    scan_large_files(work_tree, work_tree, &mut exclude_content);
    let _ = std::fs::write(&exclude_path, exclude_content);

    super::git_provider::execute_git(git_path, &git_dir, work_tree, &["add", "-A"])?;
    
    let commit_hash = match super::git_provider::execute_git(git_path, &git_dir, work_tree, &["commit", "-m", "Initial Baseline"]) {
        Ok(_) => {
            super::git_provider::execute_git(git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?
        }
        Err(_) => {
            super::git_provider::execute_git(git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", "Initial Baseline"])?;
            super::git_provider::execute_git(git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?
        }
    };

    // Parse diff changes using safe null-terminated format
    let diff_stdout = super::git_provider::execute_git(git_path, &git_dir, work_tree, &[
        "diff-tree", "-z", "--no-commit-id", "--name-status", "-r", "--root", "--no-renames", &commit_hash
    ]).unwrap_or_default();

    let operations = parse_null_separated_diff(&diff_stdout);

    // Call DB Worker to commit baseline
    let (chk_tx, chk_rx) = channel();
    db_sender.send(DatabaseTask::InsertCheckpoint {
        project_path: project_path.to_string(),
        commit_hash: commit_hash.clone(),
        name: "Initial Baseline".to_string(),
        operations,
        resp_tx: chk_tx,
    }).map_err(|e| e.to_string())?;
    chk_rx.recv().map_err(|e| e.to_string())??;

    let _ = super::backup_service::backup_project(git_path, app_data_dir, project_id, project_path);

    Ok(commit_hash)
}

pub fn create_checkpoint_sync(
    git_path: &Path,
    app_data_dir: &Path,
    project_id: &str,
    project_path: &str,
    name: &str,
) -> Result<String, String> {
    let _lock = ProjectLock::acquire(project_path, "checkpoint")?;
    
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    // Check porcelain and diff cached to prevent staging leaks / empty checkpoint commits
    let has_untracked = has_unstaged_changes(git_path, &git_dir, work_tree);
    let has_staged = has_staged_changes(git_path, &git_dir, work_tree);

    if !has_untracked && !has_staged {
        // No changes — return early without inserting a DB entry
        return Ok("no-changes".to_string());
    }

    super::git_provider::execute_git(git_path, &git_dir, work_tree, &["add", "-A"])?;
    super::git_provider::execute_git(git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", &format!("Checkpoint: {}", name)])?;
    let commit_hash = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;

    // Parse diff using safe null-terminated format (parent-relative, not --root)
    let diff_stdout = super::git_provider::execute_git(git_path, &git_dir, work_tree, &[
        "diff-tree", "-z", "--no-commit-id", "--name-status", "-r", "--no-renames", &commit_hash
    ]).unwrap_or_default();

    let operations = parse_null_separated_diff(&diff_stdout);

    // Submit transactions strictly to DB Worker
    let (db_tx, db_rx) = channel();
    let db_sender = DB_WORKER_SENDER.get().ok_or("DB Worker not active")?;
    db_sender.send(DatabaseTask::InsertCheckpoint {
        project_path: project_path.to_string(),
        commit_hash: commit_hash.clone(),
        name: name.to_string(),
        operations,
        resp_tx: db_tx,
    }).map_err(|e| e.to_string())?;
    db_rx.recv().map_err(|e| e.to_string())??;

    let _ = super::backup_service::backup_project(git_path, app_data_dir, project_id, project_path);

    Ok(commit_hash)
}

pub fn create_snapshot_sync(
    git_path: &Path,
    project_path: &str,
    source: &str,
    description: Option<String>,
    session_id: Option<String>,
) -> Result<String, String> {
    let _lock = ProjectLock::acquire(project_path, "snapshot")?;
    
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    let has_untracked = has_unstaged_changes(git_path, &git_dir, work_tree);
    let has_staged = has_staged_changes(git_path, &git_dir, work_tree);

    if !has_untracked && !has_staged {
        return Ok("no-changes".to_string());
    }

    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;

    let desc_str = description.clone().unwrap_or_else(|| "Automated snapshot".to_string());
    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", &desc_str])?;
    let commit_hash = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;

    // Parse diff changes using safe null-terminated format (parent-relative, not --root)
    let diff_stdout = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &[
        "diff-tree", "-z", "--no-commit-id", "--name-status", "-r", "--no-renames", &commit_hash
    ]).unwrap_or_default();

    let operations = parse_null_separated_diff(&diff_stdout);

    // Call DB Worker
    let (db_tx, db_rx) = channel();
    let db_sender = DB_WORKER_SENDER.get().ok_or("DB Worker not active")?;
    db_sender.send(DatabaseTask::InsertSnapshot {
        project_path: project_path.to_string(),
        commit_hash: commit_hash.clone(),
        source: source.to_string(),
        description,
        session_id,
        operations,
        resp_tx: db_tx,
    }).map_err(|e| e.to_string())?;
    db_rx.recv().map_err(|e| e.to_string())??;

    Ok(commit_hash)
}

pub fn restore_commit_sync(
    git_path: &Path,
    app_data_dir: &Path,
    project_id: &str,
    project_path: &str,
    commit_hash: &str,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    // Guard: reject invalid "no-changes" pseudo-hashes that were never real git commits
    if commit_hash == "no-changes" || commit_hash.is_empty() {
        return Err("Cannot restore to a snapshot with no changes recorded".to_string());
    }

    let _lock = ProjectLock::acquire(project_path, "restore")?;
    
    let journal = ActiveJournal::create(project_path, "restore", Some(commit_hash.to_string()))?;
    journal.update("restore", "PREPARED", Some(commit_hash.to_string()))?;

    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    // Verify the commit hash actually exists in the repo before proceeding
    super::git_provider::execute_git(git_path, &git_dir, work_tree, &["cat-file", "-t", commit_hash])
        .map_err(|_| format!("Commit {} does not exist in the repository", commit_hash))?;

    // 1. Spawns an emergency safety checkpoint before destructive restores
    journal.update("restore", "BACKUP_CREATED", Some(commit_hash.to_string()))?;
    let _ = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["add", "-A"]);
    let _ = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", "Emergency Pre-Restore Safety Checkpoint"]);

    journal.update("restore", "FILES_MODIFIED", Some(commit_hash.to_string()))?;

    if let Some(file_list) = files {
        for f in file_list {
            super::git_provider::execute_git(git_path, &git_dir, work_tree, &["checkout", commit_hash, "--", &f])
                .map_err(|e| format!("Failed to restore file {}: {}", f, e))?;
        }
    } else {
        // Factory Restore: clean working directories but PROTECT .nexora (contains DB + repo)
        // Use -fd (not -fdx) plus explicit -e .nexora to preserve the memory database
        let _ = super::git_provider::execute_git(git_path, &git_dir, work_tree, &["clean", "-fd", "-e", ".nexora"]);
        super::git_provider::execute_git(git_path, &git_dir, work_tree, &["checkout", commit_hash, "--", "."])?;
    }

    journal.update("restore", "VERIFICATION_RUNNING", Some(commit_hash.to_string()))?;
    
    // Scan integrity on restored project
    let scan = super::integrity::run_integrity_scan(git_path, app_data_dir, project_id, project_path)?;
    if !scan.issues.is_empty() {
        journal.update("restore", "FAILED", Some(commit_hash.to_string()))?;
        return Err(format!("Restore verification failed: {:?}", scan.issues));
    }

    journal.update("restore", "COMPLETED", Some(commit_hash.to_string()))?;
    journal.clear();
    Ok(())
}

// --- Helpers ---

fn has_unstaged_changes(git_path: &Path, git_dir: &Path, work_tree: &Path) -> bool {
    let status_stdout = super::git_provider::execute_git(git_path, git_dir, work_tree, &["status", "--porcelain", "-z"]).unwrap_or_default();
    !status_stdout.trim().is_empty()
}

fn has_staged_changes(git_path: &Path, git_dir: &Path, work_tree: &Path) -> bool {
    let diff_stdout = super::git_provider::execute_git(git_path, git_dir, work_tree, &["diff", "--cached", "--name-only", "-z"]).unwrap_or_default();
    !diff_stdout.trim().is_empty()
}

fn parse_null_separated_diff(diff_stdout: &str) -> Vec<FileOpImport> {
    let mut operations = Vec::new();
    let parts: Vec<&str> = diff_stdout.split('\0').filter(|s| !s.trim().is_empty()).collect();
    
    let mut i = 0;
    while i + 1 < parts.len() {
        let status = parts[i].trim();
        let file_path = parts[i + 1].trim();
        
        let operation_type = if status.starts_with('A') {
            "created"
        } else if status.starts_with('D') {
            "deleted"
        } else {
            "modified"
        };
        
        operations.push(FileOpImport {
            file_path: file_path.to_string(),
            operation_type: operation_type.to_string(),
            old_path: None,
        });
        i += 2;
    }
    operations
}

pub fn run_git_maintenance(app: &AppHandle, project_path: &str) -> Result<(), String> {
    let _lock = ProjectLock::acquire(project_path, "maintenance")?;
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    super::git_provider::run_gc_auto(&git_path, &git_dir)
}
