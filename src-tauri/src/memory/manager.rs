use std::path::Path;
use tauri::AppHandle;
use rusqlite::params;
use crate::memory::models::HunkSelection;

pub fn initialize_project(app: &AppHandle, project_path: &str) -> Result<String, String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    super::git_provider::validate_git_version(&git_path)?;

    let _ = super::backup_service::get_or_create_project_id(app, project_path);

    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    if !git_dir.exists() {
        super::git_provider::init_repo(&git_path, &git_dir, work_tree)?;
    }

    let conn = super::database::open_memory_db(project_path)?;
    super::database::initialize_db_schema(&conn)?;

    let has_git_history = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "--is-inside-work-tree"]).is_ok()
        && super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"]).is_ok();

    if has_git_history {
        let db_commits_count: i64 = conn.query_row("SELECT COUNT(*) FROM commits", [], |r| r.get(0)).unwrap_or(0);
        if db_commits_count == 0 {
            let log_stdout = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["log", "--reverse", "--format=%H"])?;
            for hash in log_stdout.lines() {
                let hash = hash.trim();
                if hash.is_empty() { continue; }

                let subject = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["log", "-1", "--format=%s", hash]).unwrap_or_else(|_| "Imported state".to_string());
                let author_time = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["log", "-1", "--format=%aI", hash]).unwrap_or_default();
                let source = if subject.contains("AI") || subject.contains("Agent") { "agent" } else if subject.contains("Baseline") || subject.contains("system") { "system" } else { "user" };

                let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO commits (id, git_commit_hash, type, source, description, status, timestamp) VALUES (?1,?2,'snapshot',?3,?4,'approved',?5)",
                    params![commit_id, hash, source, subject, author_time]
                );

                let diff_stdout = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &[
                    "diff-tree", "--no-commit-id", "--name-status", "-r", "--root", hash
                ]).unwrap_or_default();

                for line in diff_stdout.lines() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let status = parts[0];
                        let file_path = parts[1];
                        let mut operation_type = "created";
                        let mut old_path: Option<&str> = None;

                        if status.starts_with('M') {
                            operation_type = "modified";
                        } else if status.starts_with('D') {
                            operation_type = "deleted";
                        } else if status.starts_with('R') {
                            operation_type = "renamed";
                            if parts.len() >= 3 {
                                old_path = Some(parts[1]);
                            }
                        }

                        let op_id = format!("op-{}", uuid::Uuid::new_v4());
                        let _ = conn.execute(
                            "INSERT INTO operations (id, commit_id, file_path, operation_type, old_path) VALUES (?1,?2,?3,?4,?5)",
                            params![op_id, commit_id, file_path, operation_type, old_path]
                        );
                    }
                }
            }
        }
        let head_hash = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;
        let _ = conn.execute(
            "INSERT OR REPLACE INTO refs (name, commit_hash) VALUES ('nexora/main', ?1)",
            params![head_hash]
        );

        let app_clone = app.clone();
        let path_clone = project_path.to_string();
        tauri::async_runtime::spawn(async move {
            let _ = super::backup_service::backup_project(&app_clone, &path_clone);
        });

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

    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;
    
    let commit_hash = match super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["commit", "-m", "Initial Baseline"]) {
        Ok(_) => {
            super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?
        }
        Err(_) => {
            super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", "Initial Baseline"])?;
            super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?
        }
    };

    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT OR IGNORE INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'snapshot','system','Initial Baseline','approved')",
        params![commit_id, commit_hash]
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO refs (name, commit_hash) VALUES ('nexora/main', ?1)",
        params![commit_hash]
    ).map_err(|e| e.to_string())?;

    let diff_stdout = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &[
        "diff-tree", "--no-commit-id", "--name-status", "-r", "--root", &commit_hash
    ]).unwrap_or_default();

    for line in diff_stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let status = parts[0];
            let file_path = parts[1];
            let mut operation_type = "created";
            let mut old_path: Option<&str> = None;

            if status.starts_with('M') {
                operation_type = "modified";
            } else if status.starts_with('D') {
                operation_type = "deleted";
            } else if status.starts_with('R') {
                operation_type = "renamed";
                if parts.len() >= 3 {
                    old_path = Some(parts[1]);
                }
            }

            let op_id = format!("op-{}", uuid::Uuid::new_v4());
            conn.execute(
                "INSERT INTO operations (id, commit_id, file_path, operation_type, old_path) VALUES (?1,?2,?3,?4,?5)",
                params![op_id, commit_id, file_path, operation_type, old_path]
            ).map_err(|e| e.to_string())?;
        }
    }

    let app_clone = app.clone();
    let path_clone = project_path.to_string();
    tauri::async_runtime::spawn(async move {
        let _ = super::backup_service::backup_project(&app_clone, &path_clone);
    });

    Ok(commit_hash)
}

pub fn create_checkpoint(app: &AppHandle, project_path: &str, name: &str) -> Result<String, String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;
    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", &format!("Checkpoint: {}", name)])?;
    let commit_hash = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;

    let conn = super::database::open_memory_db(project_path)?;
    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'checkpoint','user',?3,'approved')",
        params![commit_id, commit_hash, name]
    ).map_err(|e| e.to_string())?;

    let diff_stdout = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &[
        "diff-tree", "--no-commit-id", "--name-status", "-r", "--root", &commit_hash
    ]).unwrap_or_default();

    for line in diff_stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let status = parts[0];
            let file_path = parts[1];
            let mut operation_type = "modified";
            let mut old_path: Option<&str> = None;

            if status.starts_with('A') {
                operation_type = "created";
            } else if status.starts_with('D') {
                operation_type = "deleted";
            } else if status.starts_with('R') {
                operation_type = "renamed";
                if parts.len() >= 3 {
                    old_path = Some(parts[1]);
                }
            }

            let op_id = format!("op-{}", uuid::Uuid::new_v4());
            conn.execute(
                "INSERT INTO operations (id, commit_id, file_path, operation_type, old_path) VALUES (?1,?2,?3,?4,?5)",
                params![op_id, commit_id, file_path, operation_type, old_path]
            ).map_err(|e| e.to_string())?;
        }
    }

    let ref_name = format!("nexora/checkpoints/{}", name.replace(" ", "-"));
    conn.execute(
        "INSERT OR REPLACE INTO refs (name, commit_hash) VALUES (?1, ?2)",
        params![ref_name, commit_hash]
    ).map_err(|e| e.to_string())?;

    let cp_id = format!("cp-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO checkpoints (id, commit_id, name) VALUES (?1, ?2, ?3)",
        params![cp_id, commit_hash, name]
    ).map_err(|e| e.to_string())?;

    conn.execute("UPDATE commits SET status = 'approved' WHERE status = 'pending'", []).map_err(|e| e.to_string())?;
    conn.execute("UPDATE reviews SET status = 'approved', review_time = CURRENT_TIMESTAMP WHERE status = 'pending'", []).map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let path_clone = project_path.to_string();
    tauri::async_runtime::spawn(async move {
        let _ = super::backup_service::backup_project(&app_clone, &path_clone);
    });

    Ok(commit_hash)
}

pub fn create_snapshot(
    app: &AppHandle,
    project_path: &str,
    source: &str,
    description: Option<String>,
    session_id: Option<String>,
) -> Result<String, String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;

    let desc_str = description.clone().unwrap_or_else(|| "Automated snapshot".to_string());
    super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", &desc_str])?;
    let commit_hash = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;

    let conn = super::database::open_memory_db(project_path)?;
    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO commits (id, session_id, git_commit_hash, type, source, description, status) VALUES (?1,?2,?3,'snapshot',?4,?5,'pending')",
        params![commit_id, session_id, commit_hash, source, description]
    ).map_err(|e| e.to_string())?;

    let diff_stdout = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &[
        "diff-tree", "--no-commit-id", "--name-status", "-r", "--root", &commit_hash
    ]).unwrap_or_default();

    for line in diff_stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let status = parts[0];
            let file_path = parts[1];
            let mut operation_type = "modified";
            let mut old_path: Option<&str> = None;

            if status.starts_with('A') {
                operation_type = "created";
            } else if status.starts_with('D') {
                operation_type = "deleted";
            } else if status.starts_with('R') {
                operation_type = "renamed";
                if parts.len() >= 3 {
                    old_path = Some(parts[1]);
                }
            }

            let op_id = format!("op-{}", uuid::Uuid::new_v4());
            conn.execute(
                "INSERT INTO operations (id, commit_id, file_path, operation_type, old_path) VALUES (?1,?2,?3,?4,?5)",
                params![op_id, commit_id, file_path, operation_type, old_path]
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok(commit_hash)
}

pub fn restore_commit(
    app: &AppHandle,
    project_path: &str,
    commit_hash: &str,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    let git_path = super::git_provider::resolve_git_binary(app)?;
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    if let Some(file_list) = files {
        for f in file_list {
            let _ = super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["checkout", commit_hash, "--", &f]);
        }
    } else {
        super::git_provider::execute_git(&git_path, &git_dir, work_tree, &["checkout", commit_hash, "--", "."])?;
    }
    Ok(())
}

pub fn review_change(
    project_path: &str,
    commit_hash: &str,
    status: &str,
) -> Result<(), String> {
    let conn = super::database::open_memory_db(project_path)?;
    
    conn.execute(
        "UPDATE commits SET status = ?1 WHERE git_commit_hash = ?2",
        params![status, commit_hash]
    ).map_err(|e| e.to_string())?;

    let review_id = format!("rev-{}", uuid::Uuid::new_v4());
    let _ = conn.execute(
        "INSERT OR REPLACE INTO reviews (id, commit_hash, status, reviewed_by, review_time) VALUES (?1, ?2, ?3, 'user', CURRENT_TIMESTAMP)",
        params![review_id, commit_hash, status]
    );

    Ok(())
}

pub fn apply_hunks(
    app: &AppHandle,
    project_path: &str,
    commit_hash: &str,
    approved_hunks: Vec<HunkSelection>,
) -> Result<(), String> {
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
