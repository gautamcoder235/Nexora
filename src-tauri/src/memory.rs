// ╔══════════════════════════════════════════════════════════════╗
// ║  Nexora Memory Core — Git-backed Version Control Layer     ║
// ║  Completely offline. No system Git dependencies.           ║
// ║  Uses isolated private Git repo under `.nexora/repo`.      ║
// ╚══════════════════════════════════════════════════════════════╝

use rusqlite::{Connection, params};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{command, AppHandle, Manager};

// ── Structs & Data Types ──

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TimelineEntry {
    pub id: String,
    pub session_id: Option<String>,
    pub git_commit_hash: String,
    pub r#type: String,         // snapshot | checkpoint | ai | restore
    pub source: String,       // user | agent | terminal | external
    pub description: Option<String>,
    pub timestamp: String,
    pub status: String,        // pending | approved | rejected
    pub files: Vec<FileOperation>,
    pub session_source: Option<String>,
    pub session_desc: Option<String>,
    pub project_path: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct FileOperation {
    pub id: String,
    pub file_path: String,
    pub operation_type: String, // created | modified | deleted | renamed
    pub old_path: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct MemorySession {
    pub id: String,
    pub source: String,
    pub description: Option<String>,
    pub started: String,
    pub ended: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct HunkSelection {
    pub file_path: String,
    pub approved: bool,
}

// ── Git Resolution & Execution ──

pub(crate) fn resolve_git_binary(app_handle: &AppHandle) -> Result<PathBuf, String> {
    // 1. Production Mode check (Strictly bundled resources only)
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let prod_git = resource_dir.join("resources").join("git").join("bin").join("git.exe");
        if prod_git.exists() {
            return Ok(prod_git);
        }
        let up_git = resource_dir.join("_up_").join("resources").join("git").join("bin").join("git.exe");
        if up_git.exists() {
            return Ok(up_git);
        }
    }

    // 2. Development Mode fallback
    #[cfg(debug_assertions)]
    {
        // Try local workspace root /resources/git/bin/git.exe
        let dev_git = std::env::current_dir()
            .unwrap_or_default()
            .join("resources")
            .join("git")
            .join("bin")
            .join("git.exe");
        if dev_git.exists() {
            return Ok(dev_git);
        }
        // Fallback to system Git during local development only
        return Ok(PathBuf::from("git"));
    }

    #[cfg(not(debug_assertions))]
    Err("Portable Git binary not found in bundled resources".to_string())
}

pub(crate) fn execute_git(git_path: &Path, git_dir: &Path, work_tree: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new(git_path);
    cmd.arg(format!("--git-dir={}", git_dir.to_string_lossy()));
    cmd.arg(format!("--work-tree={}", work_tree.to_string_lossy()));
    cmd.args(args);

    // Environment Isolation: strictly prevent loading system/user global configs
    #[cfg(target_os = "windows")]
    {
        cmd.env("GIT_CONFIG_NOSYSTEM", "1");
        cmd.env("GIT_CONFIG_GLOBAL", "NUL");
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd.env("GIT_CONFIG_NOSYSTEM", "1");
        cmd.env("GIT_CONFIG_GLOBAL", "/dev/null");
    }

    // Standard author variables for clean commits
    cmd.env("GIT_AUTHOR_NAME", "Nexora Memory");
    cmd.env("GIT_AUTHOR_EMAIL", "memory@nexora.ai");
    cmd.env("GIT_COMMITTER_NAME", "Nexora Memory");
    cmd.env("GIT_COMMITTER_EMAIL", "memory@nexora.ai");

    let output = cmd.output().map_err(|e| format!("Failed to execute Git command: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if err_msg.is_empty() {
            "Unknown Git error".to_string()
        } else {
            err_msg
        })
    }
}

// Check Git version is >= 2.40.0
pub(crate) fn validate_git_version(git_path: &Path) -> Result<(), String> {
    let mut cmd = Command::new(git_path);
    cmd.arg("--version");
    let output = cmd.output().map_err(|e| format!("Failed to get Git version: {}", e))?;
    let version_str = String::from_utf8_lossy(&output.stdout);
    
    // Parse version e.g. "git version 2.45.0"
    let parts: Vec<&str> = version_str.split_whitespace().collect();
    let version_num = parts.iter().find(|&&p| p.chars().next().unwrap_or(' ').is_numeric());
    
    if let Some(ver) = version_num {
        let clean_ver: String = ver.chars().take_while(|&c| c.is_numeric() || c == '.').collect();
        let semver: Vec<&str> = clean_ver.split('.').collect();
        if semver.len() >= 2 {
            let major: u32 = semver[0].parse().unwrap_or(0);
            let minor: u32 = semver[1].parse().unwrap_or(0);
            if major > 2 || (major == 2 && minor >= 40) {
                return Ok(());
            }
        }
    }
    
    // If fallback is successful for system git but we couldn't parse it, check if code succeeds
    if output.status.success() {
        return Ok(());
    }
    
    Err(format!("Unsupported Git version: {}. Minimum required is 2.40.0", version_str.trim()))
}

// ── Database Setup ──

fn open_memory_db(project_path: &str) -> Result<Connection, String> {
    let db_dir = Path::new(project_path).join(".nexora");
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(db_dir.join("memory.db")).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn initialize_db_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            source      TEXT NOT NULL,
            description TEXT,
            started     DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended       DATETIME
        );

        CREATE TABLE IF NOT EXISTS commits (
            id              TEXT PRIMARY KEY,
            session_id      TEXT,
            git_commit_hash TEXT NOT NULL UNIQUE,
            type            TEXT NOT NULL,
            source          TEXT NOT NULL,
            description     TEXT,
            timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP,
            status          TEXT DEFAULT 'pending',
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS operations (
            id             TEXT PRIMARY KEY,
            commit_id      TEXT NOT NULL,
            file_path      TEXT NOT NULL,
            operation_type TEXT NOT NULL,
            old_path       TEXT,
            FOREIGN KEY(commit_id) REFERENCES commits(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS refs (
            name           TEXT PRIMARY KEY,
            commit_hash    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id             TEXT PRIMARY KEY,
            commit_hash    TEXT NOT NULL UNIQUE,
            status         TEXT NOT NULL,
            reviewed_by    TEXT NOT NULL,
            review_time    DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_commits_sess ON commits(session_id);
        CREATE INDEX IF NOT EXISTS idx_ops_commit ON operations(commit_id);
    ").map_err(|e| format!("Failed to create Memory Core schema: {}", e))?;
    Ok(())
}

// ── Private Exclusions ──

fn setup_private_exclude(git_dir: &Path) -> Result<(), String> {
    let info_dir = git_dir.join("info");
    std::fs::create_dir_all(&info_dir).map_err(|e| e.to_string())?;
    let exclude_file = info_dir.join("exclude");
    
    // Add default ignore entries specifically for the isolated repo
    let content = "\
.nexora/
node_modules/
target/
dist/
build/
.next/
__pycache__/
*.exe
*.dll
*.so
*.dylib
";
    std::fs::write(exclude_file, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn populate_commit_operations(
    conn: &rusqlite::Connection,
    git_path: &Path,
    git_dir: &Path,
    work_tree: &Path,
    commit_hash: &str,
    commit_id: &str,
) -> Result<(), String> {
    let diff_stdout = execute_git(git_path, git_dir, work_tree, &[
        "diff-tree", "--no-commit-id", "--name-status", "-r", "--root", commit_hash
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
            let _ = conn.execute(
                "INSERT INTO operations (id, commit_id, file_path, operation_type, old_path) VALUES (?1,?2,?3,?4,?5)",
                params![op_id, commit_id, file_path, operation_type, old_path]
            );
        }
    }
    Ok(())
}

// ── Command Implementation ──

#[command]
pub fn memory_initialize(app: AppHandle, project_path: String) -> Result<String, String> {
    let git_path = resolve_git_binary(&app)?;
    validate_git_version(&git_path)?;

    // Ensure project UUID exists
    let _ = crate::vault::get_or_create_project_id(&app, &project_path);

    let git_dir = Path::new(&project_path).join(".nexora").join("repo");
    let work_tree = Path::new(&project_path);

    // 1. Initialize Git Repo under .nexora/repo
    if !git_dir.exists() {
        std::fs::create_dir_all(&git_dir).map_err(|e| e.to_string())?;
        execute_git(&git_path, &git_dir, work_tree, &["init"])?;
        setup_private_exclude(&git_dir)?;
        
        // Disable global attributes/config reads
        execute_git(&git_path, &git_dir, work_tree, &["config", "core.autocrlf", "false"])?;
        execute_git(&git_path, &git_dir, work_tree, &["config", "core.quotepath", "false"])?;
    }

    // 2. Setup SQLite DB
    let conn = open_memory_db(&project_path)?;
    initialize_db_schema(&conn)?;

    // 2.5 Rebuild SQLite metadata DB from Git history if repository exists but DB is empty
    let has_git_history = execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "--is-inside-work-tree"]).is_ok()
        && execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"]).is_ok();

    if has_git_history {
        let db_commits_count: i64 = conn.query_row("SELECT COUNT(*) FROM commits", [], |r| r.get(0)).unwrap_or(0);
        if db_commits_count == 0 {
            let log_stdout = execute_git(&git_path, &git_dir, work_tree, &["log", "--reverse", "--format=%H"])?;
            for hash in log_stdout.lines() {
                let hash = hash.trim();
                if hash.is_empty() { continue; }

                let subject = execute_git(&git_path, &git_dir, work_tree, &["log", "-1", "--format=%s", hash]).unwrap_or_else(|_| "Imported state".to_string());
                let author_time = execute_git(&git_path, &git_dir, work_tree, &["log", "-1", "--format=%aI", hash]).unwrap_or_default();
                let source = if subject.contains("AI") || subject.contains("Agent") { "agent" } else if subject.contains("Baseline") || subject.contains("system") { "system" } else { "user" };

                let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO commits (id, git_commit_hash, type, source, description, status, timestamp) VALUES (?1,?2,'snapshot',?3,?4,'approved',?5)",
                    params![commit_id, hash, source, subject, author_time]
                );

                let diff_stdout = execute_git(&git_path, &git_dir, work_tree, &[
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
        let head_hash = execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;
        let _ = conn.execute(
            "INSERT OR REPLACE INTO refs (name, commit_hash) VALUES ('nexora/main', ?1)",
            params![head_hash]
        );

        // Run recovery vault backup in background
        let app_clone = app.clone();
        let path_clone = project_path.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = crate::vault::backup_project(&app_clone, &path_clone) {
                eprintln!("[RecoveryVault] Automatic backup failed: {}", e);
            }
        });

        return Ok(head_hash);
    }

    // 3. Stage & commit baseline files (excluding large ones)
    // Walk directory and check for >50MB files to ignore
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
                        if meta.len() >= 50_000_000 { // >= 50MB
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

    // Initial stage
    execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;
    
    // Commit if clean or dirty
    let commit_hash = match execute_git(&git_path, &git_dir, work_tree, &["commit", "-m", "Initial Baseline"]) {
        Ok(_) => {
            execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?
        }
        Err(_) => {
            // Already clean or empty
            // Create an empty commit to initialize HEAD
            execute_git(&git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", "Initial Baseline"])?;
            execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?
        }
    };

    // Save initial commit entry in SQLite
    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT OR IGNORE INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'snapshot','system','Initial Baseline','approved')",
        params![commit_id, commit_hash]
    ).map_err(|e| e.to_string())?;

    // Create main ref
    conn.execute(
        "INSERT OR REPLACE INTO refs (name, commit_hash) VALUES ('nexora/main', ?1)",
        params![commit_hash]
    ).map_err(|e| e.to_string())?;

    // Populate operations table for initial baseline commit using diff-tree --root
    let diff_stdout = execute_git(&git_path, &git_dir, work_tree, &[
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

    // Run recovery vault backup in background
    let app_clone = app.clone();
    let path_clone = project_path.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::vault::backup_project(&app_clone, &path_clone) {
            eprintln!("[RecoveryVault] Automatic backup failed: {}", e);
        }
    });

    Ok(commit_hash)
}

#[command]
pub fn memory_snapshot(
    app: AppHandle,
    project_path: String,
    source: String,
    description: Option<String>,
    session_id: Option<String>,
) -> Result<String, String> {
    let git_path = resolve_git_binary(&app)?;
    let git_dir = Path::new(&project_path).join(".nexora").join("repo");
    let work_tree = Path::new(&project_path);

    // 1. Git add
    execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;

    // 2. Check if clean
    let status_str = execute_git(&git_path, &git_dir, work_tree, &["status", "--porcelain"])?;
    if status_str.is_empty() {
        // Return current HEAD commit hash
        let head = execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;
        return Ok(head);
    }

    // 3. Commit
    let commit_desc = description.clone().unwrap_or_else(|| format!("Automatic snapshot - {}", chrono::Local::now().format("%H:%M:%S")));
    execute_git(&git_path, &git_dir, work_tree, &["commit", "-m", &commit_desc])?;
    let commit_hash = execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;

    // 4. Save metadata in database
    let conn = open_memory_db(&project_path)?;
    
    // Group commits under session if provided
    let mut active_sess_id = session_id;
    if active_sess_id.is_none() {
        // Auto-create a session for this snapshot
        let new_sess_id = format!("sess-{}", uuid::Uuid::new_v4());
        conn.execute(
            "INSERT INTO sessions (id, source, description) VALUES (?1, ?2, ?3)",
            params![new_sess_id, source, commit_desc],
        ).map_err(|e| e.to_string())?;
        active_sess_id = Some(new_sess_id);
    }

    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO commits (id, session_id, git_commit_hash, type, source, description, status) VALUES (?1,?2,?3,'snapshot',?4,?5,'pending')",
        params![commit_id, active_sess_id, commit_hash, source, commit_desc]
    ).map_err(|e| e.to_string())?;

    // Add review entry
    let rev_id = format!("rev-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO reviews (id, commit_hash, status, reviewed_by) VALUES (?1,?2,'pending','auto')",
        params![rev_id, commit_hash]
    ).map_err(|e| e.to_string())?;

    // 5. Parse commit diff changes using diff-tree
    let diff_stdout = execute_git(&git_path, &git_dir, work_tree, &[
        "diff-tree", "--no-commit-id", "--name-status", "-r", "--root", &commit_hash
    ])?;

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

    // Update main branch ref
    conn.execute(
        "INSERT OR REPLACE INTO refs (name, commit_hash) VALUES ('nexora/main', ?1)",
        params![commit_hash]
    ).map_err(|e| e.to_string())?;

    Ok(commit_hash)
}

#[command]
pub fn memory_create_checkpoint(
    app: AppHandle,
    project_path: String,
    name: String,
) -> Result<String, String> {
    let git_path = resolve_git_binary(&app)?;
    let git_dir = Path::new(&project_path).join(".nexora").join("repo");
    let work_tree = Path::new(&project_path);

    // 1. Stage and commit current state (empty allowed to guarantee a commit is created)
    execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;
    execute_git(&git_path, &git_dir, work_tree, &["commit", "--allow-empty", "-m", &format!("Checkpoint: {}", name)])?;
    let commit_hash = execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;

    // 2. Setup SQLite DB connection
    let conn = open_memory_db(&project_path)?;

    // 3. Register commit in commits table
    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'checkpoint','user',?3,'approved')",
        params![commit_id, commit_hash, name]
    ).map_err(|e| e.to_string())?;

    // 4. Populate operations using diff-tree
    let diff_stdout = execute_git(&git_path, &git_dir, work_tree, &[
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

    // 5. Update checkpoints and refs
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

    // Approve any outstanding commits prior to the checkpoint
    conn.execute("UPDATE commits SET status = 'approved' WHERE status = 'pending'", []).map_err(|e| e.to_string())?;
    conn.execute("UPDATE reviews SET status = 'approved', review_time = CURRENT_TIMESTAMP WHERE status = 'pending'", []).map_err(|e| e.to_string())?;

    // Run recovery vault backup in background
    let app_clone = app.clone();
    let path_clone = project_path.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::vault::backup_project(&app_clone, &path_clone) {
            eprintln!("[RecoveryVault] Automatic backup failed: {}", e);
        }
    });

    Ok(commit_hash)
}

#[command]
pub fn memory_get_history(project_path: String) -> Result<Vec<TimelineEntry>, String> {
    let conn = open_memory_db(&project_path)?;
    initialize_db_schema(&conn)?;

    let mut stmt = conn.prepare(
        "SELECT c.id, c.session_id, c.git_commit_hash, c.type, c.source, c.description, c.timestamp, c.status,
                s.source, s.description
         FROM commits c
         LEFT JOIN sessions s ON s.id = c.session_id
         ORDER BY c.timestamp DESC"
    ).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let commit_id: String = row.get(0).map_err(|e| e.to_string())?;
        
        // Fetch operations for this commit
        let mut op_stmt = conn.prepare(
            "SELECT id, file_path, operation_type, old_path FROM operations WHERE commit_id = ?1"
        ).map_err(|e| e.to_string())?;
        
        let mut ops = Vec::new();
        let mut op_rows = op_stmt.query(params![commit_id]).map_err(|e| e.to_string())?;
        while let Some(op_row) = op_rows.next().map_err(|e| e.to_string())? {
            ops.push(FileOperation {
                id: op_row.get(0).map_err(|e| e.to_string())?,
                file_path: op_row.get(1).map_err(|e| e.to_string())?,
                operation_type: op_row.get(2).map_err(|e| e.to_string())?,
                old_path: op_row.get(3).map_err(|e| e.to_string())?,
            });
        }

        result.push(TimelineEntry {
            id: commit_id,
            session_id: row.get(1).map_err(|e| e.to_string())?,
            git_commit_hash: row.get(2).map_err(|e| e.to_string())?,
            r#type: row.get(3).map_err(|e| e.to_string())?,
            source: row.get(4).map_err(|e| e.to_string())?,
            description: row.get(5).map_err(|e| e.to_string())?,
            timestamp: row.get(6).map_err(|e| e.to_string())?,
            status: row.get(7).map_err(|e| e.to_string())?,
            files: ops,
            session_source: row.get(8).map_err(|e| e.to_string())?,
            session_desc: row.get(9).map_err(|e| e.to_string())?,
            project_path: project_path.clone(),
        });
    }
    Ok(result)
}

#[command]
pub fn memory_get_diff(
    app: AppHandle,
    project_path: String,
    from_commit: String,
    to_commit: String,
) -> Result<String, String> {
    let git_path = resolve_git_binary(&app)?;
    let git_dir = Path::new(&project_path).join(".nexora").join("repo");
    let work_tree = Path::new(&project_path);

    // Git diff command
    execute_git(&git_path, &git_dir, work_tree, &["diff", &from_commit, &to_commit])
}

#[command]
pub fn memory_restore(
    app: AppHandle,
    project_path: String,
    commit_hash: String,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    let git_path = resolve_git_binary(&app)?;
    let git_dir = Path::new(&project_path).join(".nexora").join("repo");
    let work_tree = Path::new(&project_path);

    if let Some(target_files) = files {
        for file in target_files {
            execute_git(&git_path, &git_dir, work_tree, &["checkout", &commit_hash, "--", &file])?;
        }
    } else {
        // Checkout whole repo state
        execute_git(&git_path, &git_dir, work_tree, &["checkout", &commit_hash, "."])?;
    }

    // Commit the restored state to maintain clean history
    execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;
    execute_git(&git_path, &git_dir, work_tree, &["commit", "-m", &format!("Restored project state to {}", commit_hash)])?;

    let new_hash = execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;
    
    // Log restoration in database
    let conn = open_memory_db(&project_path)?;
    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'restore','system',?3,'approved')",
        params![commit_id, new_hash, format!("Restored state to {}", commit_hash)]
    ).map_err(|e| e.to_string())?;

    let _ = populate_commit_operations(&conn, &git_path, &git_dir, work_tree, &new_hash, &commit_id);

    Ok(())
}

#[command]
pub fn memory_review_change(
    app: AppHandle,
    project_path: String,
    commit_hash: String,
    status: String, // approved | rejected
) -> Result<(), String> {
    let conn = open_memory_db(&project_path)?;
    ensure_schema(&conn)?;

    if status == "rejected" {
        let git_path = resolve_git_binary(&app)?;
        let git_dir = Path::new(&project_path).join(".nexora").join("repo");
        let work_tree = Path::new(&project_path);

        // 1. Calculate and apply reverse patch (revert commit) preserving downstream changes
        execute_git(&git_path, &git_dir, work_tree, &["revert", "--no-commit", &commit_hash])?;

        // 2. Commit the reversion
        execute_git(&git_path, &git_dir, work_tree, &["commit", "-m", &format!("Reverted change {}", commit_hash)])?;
        let new_hash = execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;

        // 3. Log revert in database
        let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
        conn.execute(
            "INSERT INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'restore','system',?3,'approved')",
            params![commit_id, new_hash, format!("Reverted change {}", commit_hash)]
        ).map_err(|e| e.to_string())?;

        let _ = populate_commit_operations(&conn, &git_path, &git_dir, work_tree, &new_hash, &commit_id);
    }

    // Update reviews metadata
    conn.execute(
        "INSERT OR REPLACE INTO reviews (id, commit_hash, status, reviewed_by, review_time) VALUES (?1,?2,?3,'user',CURRENT_TIMESTAMP)",
        params![format!("rev-{}", uuid::Uuid::new_v4()), commit_hash, status]
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE commits SET status = ?1 WHERE git_commit_hash = ?2",
        params![status, commit_hash]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn memory_apply_hunks(
    app: AppHandle,
    project_path: String,
    commit_hash: String,
    approved_hunks: Vec<HunkSelection>,
) -> Result<(), String> {
    let git_path = resolve_git_binary(&app)?;
    let git_dir = Path::new(&project_path).join(".nexora").join("repo");
    let work_tree = Path::new(&project_path);

    // Filter hunks: for any unapproved/rejected file, revert it
    for hunk in approved_hunks {
        if !hunk.approved {
            // Revert just this file's changes from the commit hash
            let file_diff = execute_git(&git_path, &git_dir, work_tree, &["diff", &format!("{}~1", commit_hash), &commit_hash, "--", &hunk.file_path])?;
            if !file_diff.is_empty() {
                // Apply reverse patch for this specific file
                let mut cmd = Command::new(&git_path);
                cmd.arg(format!("--git-dir={}", git_dir.to_string_lossy()));
                cmd.arg(format!("--work-tree={}", work_tree.to_string_lossy()));
                cmd.args(&["apply", "--reverse", "-"]);
                
                let mut child = cmd.stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to spawn git apply: {}", e))?;

                {
                    use std::io::Write;
                    let stdin = child.stdin.as_mut().ok_or("Failed to open stdin")?;
                    stdin.write_all(file_diff.as_bytes()).map_err(|e| e.to_string())?;
                }

                let output = child.wait_with_output().map_err(|e| e.to_string())?;
                if !output.status.success() {
                    return Err(format!("Failed to revert hunk: {}", String::from_utf8_lossy(&output.stderr)));
                }
            }
        }
    }

    // Commit the resulting work tree state
    execute_git(&git_path, &git_dir, work_tree, &["add", "-A"])?;
    execute_git(&git_path, &git_dir, work_tree, &["commit", "-m", &format!("Partially applied changes from {}", commit_hash)])?;
    
    let new_hash = execute_git(&git_path, &git_dir, work_tree, &["rev-parse", "HEAD"])?;

    // Record review update
    let conn = open_memory_db(&project_path)?;
    conn.execute(
        "UPDATE commits SET status = 'approved' WHERE git_commit_hash = ?1",
        params![commit_hash]
    ).map_err(|e| e.to_string())?;

    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'restore','system',?3,'approved')",
        params![commit_id, new_hash, format!("Partially applied changes from {}", commit_hash)]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// Read file content from a specific commit version
#[command]
pub fn memory_read_version(
    app: AppHandle,
    project_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<String, String> {
    let git_path = resolve_git_binary(&app)?;
    let git_dir = Path::new(&project_path).join(".nexora").join("repo");
    let work_tree = Path::new(&project_path);

    execute_git(&git_path, &git_dir, work_tree, &["show", &format!("{}:{}", commit_hash, file_path)])
}

#[command]
pub fn memory_is_initialized(project_path: String) -> Result<bool, String> {
    let git_dir = Path::new(&project_path).join(".nexora").join("repo");
    Ok(git_dir.exists())
}

// ── Private schema helper to run V3 migration ──
fn ensure_schema(conn: &Connection) -> Result<(), String> {
    initialize_db_schema(conn)
}
