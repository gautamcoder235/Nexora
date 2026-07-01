
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

use crate::team::task_types::{
    TaskSpec, TaskState, read_task_state, update_task_state as update_fs_task_state, get_task_dir
};
use crate::team::bus::{EventBus, SwarmEvent};

pub fn merge_task_changes(
    app_handle: &AppHandle,
    project_path: &str,
    task_id: &str,
) -> Result<(), String> {
    let task_dir = get_task_dir(project_path, task_id);
    if !task_dir.exists() {
        return Err(format!("Task directory not found: {}", task_id));
    }

    // Load spec.json
    let spec_path = task_dir.join("spec.json");
    if !spec_path.exists() {
        return Err(format!("Task spec.json not found for task: {}", task_id));
    }
    let spec_content = fs::read_to_string(&spec_path).map_err(|e| e.to_string())?;
    let spec: TaskSpec = serde_json::from_str(&spec_content).map_err(|e| e.to_string())?;

    let _state = read_task_state(project_path, task_id)?;

    // 1. Check cleanliness of the main project root
    let status_out = crate::hidden_command::new_command("git")
        .current_dir(project_path)
        .args(&["status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !status_out.status.success() {
        return Err(format!("git status failed: {}", String::from_utf8_lossy(&status_out.stderr)));
    }

    let status_str = String::from_utf8_lossy(&status_out.stdout);
    if !status_str.trim().is_empty() {
        return Err("Main project directory has uncommitted changes. Please stash or commit them before merging.".to_string());
    }

    // 2. Identify the task branch name.
    // In swarm_worktrees.rs: branch_name = format!("task-{}-exec-{}", task_id, execution_id);
    // Let's list git branches to find any branch starting with task-{task_id}
    let branch_list_out = crate::hidden_command::new_command("git")
        .current_dir(project_path)
        .args(&["branch", "--list", &format!("task-{}*", task_id)])
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    let branch_str = String::from_utf8_lossy(&branch_list_out.stdout);
    let branch_name = branch_str.lines().next().map(|line| line.replace('*', "").trim().to_string());

    let mut merged = false;
    let mut merge_error = String::new();

    if let Some(ref b_name) = branch_name {
        if !b_name.is_empty() {
            // Squash merge the branch
            let merge_out = crate::hidden_command::new_command("git")
                .current_dir(project_path)
                .args(&["merge", "--squash", b_name])
                .output();

            match merge_out {
                Ok(out) if out.status.success() => {
                    merged = true;
                }
                Ok(out) => {
                    merge_error = String::from_utf8_lossy(&out.stderr).to_string();
                    // Abort merge if it failed
                    let _ = crate::hidden_command::new_command("git")
                        .current_dir(project_path)
                        .args(&["merge", "--abort"])
                        .output();
                }
                Err(e) => {
                    merge_error = e.to_string();
                }
            }
        }
    }

    // 3. Fallback to applying workspace.patch if branch squash merge failed or branch wasn't found
    if !merged {
        let patch_path = task_dir.join("workspace.patch");
        if patch_path.exists() {
            let patch_content = fs::read_to_string(&patch_path).unwrap_or_default();
            if !patch_content.trim().is_empty() {
                let apply_out = crate::hidden_command::new_command("git")
                    .current_dir(project_path)
                    .args(&["apply", &patch_path.to_string_lossy()])
                    .output();

                match apply_out {
                    Ok(out) if out.status.success() => {
                        // Stage applied changes
                        let _ = crate::hidden_command::new_command("git")
                            .current_dir(project_path)
                            .args(&["add", "."])
                            .output();
                    }
                    Ok(out) => {
                        let err = String::from_utf8_lossy(&out.stderr).to_string();
                        return Err(format!("Squash merge failed and fallback patch application failed: {}\nApply error: {}", merge_error, err));
                    }
                    Err(e) => {
                        return Err(format!("Squash merge failed and fallback patch application failed to spawn: {}\nApply error: {}", merge_error, e));
                    }
                }
            } else {
                return Err(format!("Squash merge failed (branch not found or failed: {}) and workspace.patch is empty.", merge_error));
            }
        } else {
            return Err(format!("Squash merge failed (branch not found or failed: {}) and workspace.patch does not exist.", merge_error));
        }
    }

    // 4. Commit changes
    let commit_msg = format!("Squash Merge: task_{} - {}", task_id, spec.title);
    let commit_out = crate::hidden_command::new_command("git")
        .current_dir(project_path)
        .args(&["commit", "-m", &commit_msg])
        .output()
        .map_err(|e| format!("Failed to commit changes: {}", e))?;

    if !commit_out.status.success() {
        // Rollback commit attempt by resetting
        let _ = crate::hidden_command::new_command("git")
            .current_dir(project_path)
            .args(&["reset", "--hard", "HEAD"])
            .output();
        return Err(format!("Git commit failed: {}", String::from_utf8_lossy(&commit_out.stderr)));
    }

    // 5. Cleanup the task worktree and branch
    let worktree_path = Path::new(project_path)
        .join(".nexora")
        .join("worktrees")
        .join(format!("task_{}", task_id));

    if worktree_path.exists() {
        if let Some(ref b_name) = branch_name {
            let _ = crate::swarm_worktrees::remove_worktree(
                project_path.to_string(),
                worktree_path.to_string_lossy().to_string(),
                b_name.clone()
            );
        }
    }

    // 6. Transition state to COMPLETED
    update_fs_task_state(project_path, task_id, TaskState::Completed)?;
    
    // Dispatch event
    let event_bus = app_handle.state::<EventBus>();
    let _ = event_bus.dispatch(
        project_path,
        SwarmEvent::TaskStatusChanged {
            task_id: task_id.to_string(),
            status: "COMPLETED".to_string(),
        },
        app_handle,
    )?;

    Ok(())
}
