use crate::swarm_db::DbState;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize, Deserialize)]
pub struct GitValidationResult {
    pub is_valid: bool,
    pub has_warnings: bool,
    pub errors: Vec<GitError>,
    pub warnings: Vec<GitWarning>,
}

#[derive(Serialize, Deserialize)]
pub struct GitError {
    pub code: String,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct GitWarning {
    pub code: String,
    pub message: String,
}

#[tauri::command]
pub fn validate_git_repository(root_path: String) -> Result<GitValidationResult, String> {
    let mut result = GitValidationResult {
        is_valid: true,
        has_warnings: false,
        errors: vec![],
        warnings: vec![],
    };

    // 1. Check if git is installed
    let git_check = Command::new("git").arg("--version").output();

    if git_check.is_err() {
        result.is_valid = false;
        result.errors.push(GitError {
            code: "GIT_NOT_INSTALLED".to_string(),
            message: "Git is not installed or not in PATH.".to_string(),
        });
        return Ok(result); // Fatal, return early
    }

    let root = Path::new(&root_path);

    // 2. Check if repository exists
    if !root.exists() || !root.is_dir() {
        result.is_valid = false;
        result.errors.push(GitError {
            code: "REPO_NOT_FOUND".to_string(),
            message: "The provided repository path does not exist.".to_string(),
        });
        return Ok(result);
    }

    let git_dir = root.join(".git");
    if !git_dir.exists() {
        result.is_valid = false;
        result.errors.push(GitError {
            code: "NOT_A_GIT_REPO".to_string(),
            message: "The directory is not a valid git repository.".to_string(),
        });
        return Ok(result);
    }

    // 3. Check for at least one commit
    let commit_check = Command::new("git")
        .current_dir(root)
        .arg("rev-parse")
        .arg("HEAD")
        .output();

    match commit_check {
        Ok(output) => {
            if !output.status.success() {
                result.is_valid = false;
                result.errors.push(GitError {
                    code: "NO_INITIAL_COMMIT".to_string(),
                    message:
                        "Repository must contain at least one commit before creating worktrees."
                            .to_string(),
                });
            }
        }
        Err(_) => {
            result.is_valid = false;
            result.errors.push(GitError {
                code: "GIT_CMD_FAILED".to_string(),
                message: "Failed to run git rev-parse.".to_string(),
            });
        }
    }

    // 4. Check for uncommitted changes (Warning only)
    let status_check = Command::new("git")
        .current_dir(root)
        .arg("status")
        .arg("--porcelain")
        .output();

    if let Ok(output) = status_check {
        if !output.stdout.is_empty() {
            result.has_warnings = true;
            result.warnings.push(GitWarning {
                code: "UNCOMMITTED_CHANGES".to_string(),
                message: "Repository has uncommitted changes. These will not be reflected in new worktrees until committed.".to_string(),
            });
        }
    }

    // 5. Check if worktrees parent directory is writable
    // We'll put worktrees in `.nexora-worktrees` at the same level as the repo, or inside `.git/worktrees` natively.
    // Let's use standard native `git worktree add`, so we just need the parent of where we'll put them to be writable.
    // A good place is root_path/../.nexora-worktrees/
    let parent = root.parent().unwrap_or(root);
    let worktrees_dir = parent.join(".nexora-worktrees");

    if !worktrees_dir.exists() {
        if let Err(e) = fs::create_dir_all(&worktrees_dir) {
            result.is_valid = false;
            result.errors.push(GitError {
                code: "WORKTREE_DIR_UNWRITABLE".to_string(),
                message: format!("Failed to create worktrees directory: {}", e),
            });
        }
    } else {
        // Quick writability check by creating and removing a temp file
        let temp_file = worktrees_dir.join(".nexora-write-test");
        if fs::write(&temp_file, b"test").is_err() || fs::remove_file(&temp_file).is_err() {
            result.is_valid = false;
            result.errors.push(GitError {
                code: "WORKTREE_DIR_UNWRITABLE".to_string(),
                message: "Worktrees directory is not writable.".to_string(),
            });
        }
    }

    Ok(result)
}

#[derive(Serialize, Deserialize)]
pub struct WorktreeResult {
    pub success: bool,
    pub path: String,
    pub branch_name: String,
    pub error: Option<String>,
}

#[tauri::command]
pub fn create_worktree(
    project_root: String,
    task_id: String,
    execution_id: String,
    task_title: String,
    task_description: String,
    allowed_patterns: Vec<String>,
) -> Result<WorktreeResult, String> {
    let root = Path::new(&project_root);
    let worktrees_dir = root.join(".nexora").join("worktrees");

    if !worktrees_dir.exists() {
        if let Err(e) = fs::create_dir_all(&worktrees_dir) {
            return Err(format!("Failed to create base worktrees directory: {}", e));
        }
    }

    let branch_name = format!("task-{}-exec-{}", task_id, execution_id);
    let worktree_path = worktrees_dir.join(format!("task_{}", task_id));

    // If a worktree already exists here (from a previous aborted run), we should remove it first, but for safety let git handle it.
    // 1. Run git worktree add
    let output = Command::new("git")
        .current_dir(root)
        .arg("worktree")
        .arg("add")
        .arg(&worktree_path)
        .arg("-b")
        .arg(&branch_name)
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Ok(WorktreeResult {
            success: false,
            path: "".to_string(),
            branch_name: "".to_string(),
            error: Some(format!("Git worktree creation failed: {}", err_msg)),
        });
    }

    // 2. Generate `.nexora` contract directory
    let contract_dir = worktree_path.join(".nexora");
    if let Err(e) = fs::create_dir_all(&contract_dir) {
        // Cleanup worktree if we fail to create the contract
        let _ = Command::new("git")
            .current_dir(root)
            .arg("worktree")
            .arg("remove")
            .arg(&worktree_path)
            .arg("--force")
            .output();
        return Ok(WorktreeResult {
            success: false,
            path: "".to_string(),
            branch_name: "".to_string(),
            error: Some(format!("Failed to create .nexora directory: {}", e)),
        });
    }

    // 3. Write contract files
    let task_json = serde_json::json!({
        "task_id": task_id,
        "execution_id": execution_id,
        "title": task_title,
        "description": task_description,
        "status": "pending"
    });

    let ownership_json = serde_json::json!({
        "task_id": task_id,
        "execution_id": execution_id,
        "owned_files": allowed_patterns
    });

    let status_json = serde_json::json!({
        "status": "active"
    });

    use std::time::{SystemTime, UNIX_EPOCH};

    // Additional Context Injection (Phase 2.5)
    let execution_json = serde_json::json!({
        "execution_id": execution_id,
        "task_id": task_id,
        "created_at": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
    });

    let mut hasher = DefaultHasher::new();
    allowed_patterns.hash(&mut hasher);
    let ownership_hash_str = format!("{:x}", hasher.finish());

    fs::write(
        contract_dir.join("task.json"),
        serde_json::to_string_pretty(&task_json).unwrap(),
    )
    .map_err(|e| format!("Failed to write task.json: {}", e))?;
    fs::write(
        contract_dir.join("ownership.json"),
        serde_json::to_string_pretty(&ownership_json).unwrap(),
    )
    .map_err(|e| format!("Failed to write ownership.json: {}", e))?;
    fs::write(
        contract_dir.join("status.json"),
        serde_json::to_string_pretty(&status_json).unwrap(),
    )
    .map_err(|e| format!("Failed to write status.json: {}", e))?;
    fs::write(
        contract_dir.join("execution.json"),
        serde_json::to_string_pretty(&execution_json).unwrap(),
    )
    .map_err(|e| format!("Failed to write execution.json: {}", e))?;
    fs::write(contract_dir.join("ownership.hash"), ownership_hash_str)
        .map_err(|e| format!("Failed to write ownership.hash: {}", e))?;
    let _ = fs::write(
        contract_dir.join("execution.log"),
        "[Nexora] Worktree and contract initialized.\n",
    );

    Ok(WorktreeResult {
        success: true,
        path: worktree_path.to_string_lossy().to_string(),
        branch_name,
        error: None,
    })
}

#[tauri::command]
pub fn remove_worktree(
    project_root: String,
    worktree_path: String,
    branch_name: String,
) -> Result<bool, String> {
    let root = Path::new(&project_root);

    // 1. Remove the worktree
    let output = Command::new("git")
        .current_dir(root)
        .arg("worktree")
        .arg("remove")
        .arg(&worktree_path)
        .arg("--force")
        .output();

    if let Ok(out) = output {
        if !out.status.success() {
            eprintln!(
                "Warning: git worktree remove failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        }
    }

    // 2. Delete the branch
    let output = Command::new("git")
        .current_dir(root)
        .arg("branch")
        .arg("-D")
        .arg(&branch_name)
        .output();

    if let Ok(out) = output {
        if !out.status.success() {
            eprintln!(
                "Warning: git branch -D failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        }
    }

    Ok(true)
}

#[tauri::command]
pub fn cleanup_worktrees(project_root: String) -> Result<Vec<String>, String> {
    let root = Path::new(&project_root);
    let worktrees_dir = root.join(".nexora").join("worktrees");

    let mut cleaned = Vec::new();

    if worktrees_dir.exists() && worktrees_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&worktrees_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let dir_name = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    if dir_name.starts_with("task_") {
                        // Attempt to run git worktree remove on it
                        let _ = Command::new("git")
                            .current_dir(root)
                            .arg("worktree")
                            .arg("remove")
                            .arg(&path)
                            .arg("--force")
                            .output();

                        // Delete the branch if possible
                        let task_id_extracted = dir_name.trim_start_matches("task_");
                        let branch_prefix = format!("task-{}", task_id_extracted);

                        let branches_output = Command::new("git")
                            .current_dir(root)
                            .arg("branch")
                            .arg("--list")
                            .arg(format!("{}*", branch_prefix))
                            .output();

                        if let Ok(out) = branches_output {
                            let branches_str = String::from_utf8_lossy(&out.stdout);
                            for branch in branches_str.lines() {
                                let clean_branch = branch.replace('*', "").trim().to_string();
                                if !clean_branch.is_empty() {
                                    let _ = Command::new("git")
                                        .current_dir(root)
                                        .arg("branch")
                                        .arg("-D")
                                        .arg(&clean_branch)
                                        .output();
                                }
                            }
                        }

                        cleaned.push(dir_name);
                    }
                }
            }
        }
    }

    Ok(cleaned)
}

#[tauri::command]
pub fn revert_execution_snapshot(
    app_handle: AppHandle,
    execution_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state
        .0
        .lock()
        .map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // 1. Fetch worktree path
    let (worktree_path, _repo_path): (String, String) = conn
        .query_row(
            "SELECT w.path, r.path 
         FROM executions e 
         JOIN worktrees w ON e.worktree_id = w.id 
         JOIN repositories r ON w.repository_id = r.id
         WHERE e.id = ?1",
            [&execution_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Failed to find worktree for execution: {}", e))?;

    // 2. Fetch snapshot commit hash
    let commit_hash: String = conn
        .query_row(
            "SELECT head_commit FROM execution_snapshots WHERE id = ?1 AND execution_id = ?2",
            [snapshot_id, execution_id.clone()],
            |row| row.get(0),
        )
        .map_err(|e| format!("Snapshot not found: {}", e))?;

    // Drop lock before running git command to prevent holding lock during disk I/O
    drop(conn_guard);

    // 3. Execute git reset --hard
    let output = std::process::Command::new("git")
        .current_dir(&worktree_path)
        .arg("reset")
        .arg("--hard")
        .arg(&commit_hash)
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git reset hard failed: {}", err_msg));
    }

    // 4. Emit event to event bus to notify UI/system
    let _ = crate::swarm_events::emit_event(&app_handle, "worktree:reverted", &execution_id);

    Ok(())
}
