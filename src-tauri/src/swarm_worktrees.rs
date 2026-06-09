use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::Path;
use std::fs;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

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
    let git_check = Command::new("git")
        .arg("--version")
        .output();
        
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
                    message: "Repository must contain at least one commit before creating worktrees.".to_string(),
                });
            }
        },
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
    // We'll put worktrees in `.multi-vibe-worktrees` at the same level as the repo, or inside `.git/worktrees` natively.
    // Let's use standard native `git worktree add`, so we just need the parent of where we'll put them to be writable.
    // A good place is root_path/../.multi-vibe-worktrees/
    let parent = root.parent().unwrap_or(root);
    let worktrees_dir = parent.join(".multi-vibe-worktrees");
    
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
        let temp_file = worktrees_dir.join(".multi-vibe-write-test");
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
    allowed_patterns: Vec<String>
) -> Result<WorktreeResult, String> {
    let root = Path::new(&project_root);
    let parent = root.parent().unwrap_or(root);
    let worktrees_dir = parent.join(".multi-vibe-worktrees");
    
    if !worktrees_dir.exists() {
        if let Err(e) = fs::create_dir_all(&worktrees_dir) {
            return Err(format!("Failed to create base worktrees directory: {}", e));
        }
    }

    let branch_name = format!("task-{}-exec-{}", task_id, execution_id);
    let worktree_path = worktrees_dir.join(&branch_name);

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

    // 2. Generate `.multivibe` contract directory
    let contract_dir = worktree_path.join(".multivibe");
    if let Err(e) = fs::create_dir_all(&contract_dir) {
        // Cleanup worktree if we fail to create the contract
        let _ = Command::new("git").current_dir(root).arg("worktree").arg("remove").arg(&worktree_path).arg("--force").output();
        return Ok(WorktreeResult {
            success: false,
            path: "".to_string(),
            branch_name: "".to_string(),
            error: Some(format!("Failed to create .multivibe directory: {}", e)),
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

    fs::write(contract_dir.join("task.json"), serde_json::to_string_pretty(&task_json).unwrap())
        .map_err(|e| format!("Failed to write task.json: {}", e))?;
    fs::write(contract_dir.join("ownership.json"), serde_json::to_string_pretty(&ownership_json).unwrap())
        .map_err(|e| format!("Failed to write ownership.json: {}", e))?;
    fs::write(contract_dir.join("status.json"), serde_json::to_string_pretty(&status_json).unwrap())
        .map_err(|e| format!("Failed to write status.json: {}", e))?;
    fs::write(contract_dir.join("execution.json"), serde_json::to_string_pretty(&execution_json).unwrap())
        .map_err(|e| format!("Failed to write execution.json: {}", e))?;
    fs::write(contract_dir.join("ownership.hash"), ownership_hash_str)
        .map_err(|e| format!("Failed to write ownership.hash: {}", e))?;
    let _ = fs::write(contract_dir.join("execution.log"), "[Multi-Vibe] Worktree and contract initialized.\n");

    Ok(WorktreeResult {
        success: true,
        path: worktree_path.to_string_lossy().to_string(),
        branch_name,
        error: None,
    })
}

#[tauri::command]
pub fn remove_worktree(project_root: String, worktree_path: String, branch_name: String) -> Result<bool, String> {
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
            eprintln!("Warning: git worktree remove failed: {}", String::from_utf8_lossy(&out.stderr));
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
            eprintln!("Warning: git branch -D failed: {}", String::from_utf8_lossy(&out.stderr));
        }
    }

    Ok(true)
}

#[tauri::command]
pub fn cleanup_worktrees(project_root: String) -> Result<Vec<String>, String> {
    let root = Path::new(&project_root);
    let parent = root.parent().unwrap_or(root);
    let worktrees_dir = parent.join(".multi-vibe-worktrees");
    
    let mut cleaned = Vec::new();
    
    if worktrees_dir.exists() && worktrees_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&worktrees_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    if dir_name.starts_with("task-") {
                        // Attempt to run git worktree remove on it
                        let _ = Command::new("git")
                            .current_dir(root)
                            .arg("worktree")
                            .arg("remove")
                            .arg(&path)
                            .arg("--force")
                            .output();
                            
                        // Delete the branch if possible
                        let _ = Command::new("git")
                            .current_dir(root)
                            .arg("branch")
                            .arg("-D")
                            .arg(&dir_name)
                            .output();
                            
                        cleaned.push(dir_name);
                    }
                }
            }
        }
    }
    
    Ok(cleaned)
}

