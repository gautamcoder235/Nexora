use std::process::Command;
use std::fs;
use std::path::Path;

pub fn create_checkpoint(project_dir: &str, execution_id: &str) -> Result<String, String> {
    // 1. Get current HEAD commit hash
    let output = Command::new("git")
        .args(&["rev-parse", "HEAD"])
        .current_dir(project_dir)
        .output()
        .map_err(|e| format!("Failed to run git rev-parse: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Git rev-parse failed: {}", err));
    }

    let head_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // 2. We can create a temporary git stash to hold any uncommitted work if needed
    // or a temporary git branch/tag for the checkpoint.
    let stash_msg = format!("checkpoint-{}", execution_id);
    let stash_output = Command::new("git")
        .args(&["stash", "push", "-u", "-m", &stash_msg])
        .current_dir(project_dir)
        .output()
        .map_err(|e| format!("Failed to run git stash push: {}", e))?;

    if !stash_output.status.success() {
        // If it failed because there's nothing to stash, that's fine.
        // We'll proceed.
    }

    Ok(head_hash)
}

pub fn restore_checkpoint(project_dir: &str, execution_id: &str) -> Result<(), String> {
    // 1. Discard current modifications
    let reset_output = Command::new("git")
        .args(&["reset", "--hard", "HEAD"])
        .current_dir(project_dir)
        .output()
        .map_err(|e| format!("Failed to run git reset: {}", e))?;

    if !reset_output.status.success() {
        let err = String::from_utf8_lossy(&reset_output.stderr).to_string();
        return Err(format!("Git reset hard failed: {}", err));
    }

    let clean_output = Command::new("git")
        .args(&["clean", "-fd"])
        .current_dir(project_dir)
        .output()
        .map_err(|e| format!("Failed to run git clean: {}", e))?;

    if !clean_output.status.success() {
        let err = String::from_utf8_lossy(&clean_output.stderr).to_string();
        return Err(format!("Git clean failed: {}", err));
    }

    // 2. See if there is a stash created for this execution and pop/apply it
    // First, list stashes and find if any message matches checkpoint-<execution_id>
    let list_output = Command::new("git")
        .args(&["stash", "list"])
        .current_dir(project_dir)
        .output()
        .map_err(|e| format!("Failed to list git stashes: {}", e))?;

    if list_output.status.success() {
        let stashes = String::from_utf8_lossy(&list_output.stdout);
        let target_msg = format!("checkpoint-{}", execution_id);
        
        for (i, line) in stashes.lines().enumerate() {
            if line.contains(&target_msg) {
                // Found it! Let's pop it
                let stash_ref = format!("stash@{{{}}}", i);
                let pop_output = Command::new("git")
                    .args(&["stash", "pop", &stash_ref])
                    .current_dir(project_dir)
                    .output()
                    .map_err(|e| format!("Failed to pop git stash: {}", e))?;

                if !pop_output.status.success() {
                    let err = String::from_utf8_lossy(&pop_output.stderr).to_string();
                    return Err(format!("Failed to pop stash {}: {}", stash_ref, err));
                }
                break;
            }
        }
    }

    Ok(())
}

pub fn create_task_checkpoint(project_path: &str, task_id: &str, transition_name: &str) -> Result<String, String> {
    let task_dir = crate::team::task_types::get_task_dir(project_path, task_id);
    if !task_dir.exists() {
        return Err(format!("Task directory not found: {}", task_id));
    }

    let checkpoint_dir = Path::new(project_path)
        .join(".nexora")
        .join("checkpoints")
        .join(format!("task_{}_{}", task_id, transition_name));
    
    // Create checkpoint directory
    fs::create_dir_all(&checkpoint_dir).map_err(|e| e.to_string())?;

    // Copy task files
    for filename in &["state.json", "spec.json", "verification.json", "workspace.patch"] {
        let src = task_dir.join(filename);
        if src.exists() {
            let dest = checkpoint_dir.join(filename);
            fs::copy(&src, &dest).map_err(|e| format!("Failed to copy {}: {}", filename, e))?;
        }
    }

    // Get current HEAD commit hash in worktree
    let worktree_path = Path::new(project_path)
        .join(".nexora")
        .join("worktrees")
        .join(format!("task_{}", task_id));

    let mut head_hash = String::new();
    if worktree_path.exists() {
        let output = Command::new("git")
            .args(&["rev-parse", "HEAD"])
            .current_dir(&worktree_path)
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                head_hash = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let _ = fs::write(checkpoint_dir.join("head_commit.txt"), &head_hash);
            }
        }
    }

    // Save project.json
    let project_json_src = Path::new(project_path).join(".nexora").join("project.json");
    if project_json_src.exists() {
        let _ = fs::copy(&project_json_src, checkpoint_dir.join("project.json"));
    }

    Ok(head_hash)
}

pub fn restore_task_checkpoint(project_path: &str, task_id: &str, transition_name: &str) -> Result<(), String> {
    let checkpoint_dir = Path::new(project_path)
        .join(".nexora")
        .join("checkpoints")
        .join(format!("task_{}_{}", task_id, transition_name));

    if !checkpoint_dir.exists() {
        return Err(format!("Checkpoint task_{}_{} not found", task_id, transition_name));
    }

    let task_dir = crate::team::task_types::get_task_dir(project_path, task_id);
    fs::create_dir_all(&task_dir).map_err(|e| e.to_string())?;

    // Copy task files back
    for filename in &["state.json", "spec.json", "verification.json", "workspace.patch"] {
        let src = checkpoint_dir.join(filename);
        if src.exists() {
            let dest = task_dir.join(filename);
            fs::copy(&src, &dest).map_err(|e| format!("Failed to restore {}: {}", filename, e))?;
        }
    }

    // Restore HEAD commit hash in worktree
    let worktree_path = Path::new(project_path)
        .join(".nexora")
        .join("worktrees")
        .join(format!("task_{}", task_id));

    let commit_hash_path = checkpoint_dir.join("head_commit.txt");
    if worktree_path.exists() && commit_hash_path.exists() {
        let commit_hash = fs::read_to_string(&commit_hash_path).unwrap_or_default().trim().to_string();
        if !commit_hash.is_empty() {
            let output = Command::new("git")
                .args(&["reset", "--hard", &commit_hash])
                .current_dir(&worktree_path)
                .output();
            if let Ok(out) = output {
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr).to_string();
                    eprintln!("Failed to reset worktree HEAD: {}", err);
                }
            }
        }
    }

    // Restore project.json
    let project_json_dest = Path::new(project_path).join(".nexora").join("project.json");
    let project_json_src = checkpoint_dir.join("project.json");
    if project_json_src.exists() {
        let _ = fs::copy(&project_json_src, &project_json_dest);
    }

    Ok(())
}

