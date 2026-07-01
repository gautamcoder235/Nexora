
use rusqlite::Connection;
use crate::team::task_distributor::{get_tasks, update_task_state};
use crate::team::messages::log_system_message;
use crate::team::workspace_analyzer::analyze_workspace;
use crate::team::agent_metrics::{increment_validation_count, increment_failure_count};
use crate::team::failure_kb::record_failure;

use std::path::Path;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use serde_json::Value;

use crate::team::task_types::{
    TaskSpec, TaskState, VerificationResult,
    read_task_state, update_task_state as update_fs_task_state, get_task_dir
};
use crate::team::bus::{EventBus, SwarmEvent};

pub fn run_validation(
    conn: &Connection,
    execution_id: &str,
    project_dir: &str,
) -> Result<bool, String> {
    let tasks = get_tasks(conn)?;
    let task = tasks
        .iter()
        .find(|t| t.execution_id == execution_id)
        .ok_or_else(|| format!("Task with execution_id {} not found", execution_id))?;

    let assignee = task.assignee_id.as_deref().unwrap_or("be");

    let _ = increment_validation_count(conn, "qa");
    let _ = log_system_message(
        conn,
        "qa",
        Some("coord"),
        Some(&task.id),
        "validation",
        &format!("Starting validation run for task '{}'", task.title),
    );

    // Analyze workspace to select compiler/linter configurations
    let configs = analyze_workspace(project_dir);
    let mut validation_passed = true;
    let mut failure_message = String::new();

    if configs.is_empty() {
        // Fallback: simple git status check or always pass if no config files found
        let _ = log_system_message(
            conn,
            "qa",
            Some("coord"),
            Some(&task.id),
            "validation",
            "No project configuration files found (Cargo.toml, package.json, etc.). Custom checks skipped.",
        );
    }

    for config in configs {
        let _ = log_system_message(
            conn,
            "qa",
            Some("coord"),
            Some(&task.id),
            "validation",
            &format!("Running check: {} {}", config.command, config.args.join(" ")),
        );

        let output = if cfg!(target_os = "windows") {
            crate::hidden_command::new_command("cmd")
                .args(&["/C", &format!("{} {}", config.command, config.args.join(" "))])
                .current_dir(project_dir)
                .output()
        } else {
            crate::hidden_command::new_command(&config.command)
                .args(&config.args)
                .current_dir(project_dir)
                .output()
        };

        match output {
            Ok(out) => {
                if !out.status.success() {
                    validation_passed = false;
                    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                    failure_message = format!(
                        "Validation step failed (exit code: {}).\nCommand: {}\nStdout: {}\nStderr: {}",
                        out.status.code().unwrap_or(-1),
                        config.command,
                        stdout,
                        stderr
                    );
                    break;
                }
            }
            Err(e) => {
                validation_passed = false;
                failure_message = format!("Failed to spawn command '{}': {}", config.command, e);
                break;
            }
        }
    }

    if validation_passed {
        // Mark task as done
        update_task_state(conn, &task.id, "done")?;

        // Reset assignee / agent status to idle
        if let Some(ref agent_id) = task.assignee_id {
            conn.execute(
                "UPDATE team_agents SET status = 'idle', active_task_id = NULL, execution_id = NULL WHERE id = ?1",
                [agent_id],
            )
            .map_err(|e| format!("Failed to reset agent to idle: {}", e))?;
        }

        let _ = log_system_message(
            conn,
            "qa",
            Some("coord"),
            Some(&task.id),
            "validation",
            &format!("Validation SUCCESS for task '{}'. Task marked as done.", task.title),
        );
        Ok(true)
    } else {
        // Validation failed! Record metrics
        let _ = increment_failure_count(conn, assignee);
        let _ = increment_failure_count(conn, "qa");

        // Record failure in local Knowledge Base (team_kb.json)
        let _ = record_failure(
            project_dir,
            &task.id,
            execution_id,
            &failure_message,
        );

        let _ = log_system_message(
            conn,
            "qa",
            task.assignee_id.as_deref(),
            Some(&task.id),
            "warning",
            &format!("Validation FAILED for task '{}': {}", task.title, failure_message),
        );

        // Put task into quarantined / blocked state for coordinator intervention or retry
        update_task_state(conn, &task.id, "quarantined")?;

        Ok(false)
    }
}

fn append_to_builder_log(task_dir: &Path, message: &str) {
    let log_path = task_dir.join("logs").join("builder.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = writeln!(file, "[{}] [VALIDATOR] {}", timestamp, message);
    }
}

pub fn run_task_validation(
    app_handle: &AppHandle,
    project_path: &str,
    task_id: &str,
) -> Result<bool, String> {
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

    // Load state.json
    let mut state = read_task_state(project_path, task_id)?;

    // Transition to VALIDATING
    update_fs_task_state(project_path, task_id, TaskState::Validating)?;
    let event_bus = app_handle.state::<EventBus>();
    let _ = event_bus.dispatch(
        project_path,
        SwarmEvent::TaskStatusChanged {
            task_id: task_id.to_string(),
            status: "VALIDATING".to_string(),
        },
        app_handle,
    );

    append_to_builder_log(&task_dir, "=== Starting Validation Pipeline ===");

    let worktree_path = Path::new(project_path)
        .join(".nexora")
        .join("worktrees")
        .join(format!("task_{}", task_id));

    if !worktree_path.exists() {
        let err = format!("Worktree directory not found at: {:?}", worktree_path);
        append_to_builder_log(&task_dir, &err);
        update_fs_task_state(project_path, task_id, TaskState::Failed)?;
        return Err(err);
    }

    let mut validation_passed = true;
    let mut output_summary = String::new();
    let mut tests_total = 0;
    let mut tests_failed = 0;

    // 1. Gate A: Snapshot Check
    tests_total += 1;
    append_to_builder_log(&task_dir, "Running Gate A: Snapshot check...");
    let git_head = crate::hidden_command::new_command("git")
        .current_dir(&worktree_path)
        .args(&["rev-parse", "HEAD"])
        .output();

    match git_head {
        Ok(out) if out.status.success() => {
            let commit = String::from_utf8_lossy(&out.stdout).trim().to_string();
            append_to_builder_log(&task_dir, &format!("Gate A passed. HEAD commit: {}", commit));
        }
        _ => {
            validation_passed = false;
            tests_failed += 1;
            let err = "Gate A failed: Unable to parse HEAD commit".to_string();
            append_to_builder_log(&task_dir, &err);
            output_summary.push_str(&err);
            output_summary.push('\n');
        }
    }

    // 2. Gate B: Ownership Check & Hash Drift Check
    if validation_passed {
        tests_total += 1;
        append_to_builder_log(&task_dir, "Running Gate B: Ownership Check & Hash Drift...");
        let ownership_file_path = worktree_path.join(".nexora").join("ownership.json");
        let ownership_hash_path = worktree_path.join(".nexora").join("ownership.hash");

        if ownership_file_path.exists() && ownership_hash_path.exists() {
            let ow_content = fs::read_to_string(&ownership_file_path).unwrap_or_default();
            let disk_hash = fs::read_to_string(&ownership_hash_path).unwrap_or_default();

            if let Ok(ow_val) = serde_json::from_str::<Value>(&ow_content) {
                if let Some(owned_files_val) = ow_val.get("owned_files") {
                    if let Ok(allowed_patterns) = serde_json::from_value::<Vec<String>>(owned_files_val.clone()) {
                        // Check hash drift
                        use std::collections::hash_map::DefaultHasher;
                        use std::hash::{Hash, Hasher};
                        let mut hasher = DefaultHasher::new();
                        allowed_patterns.hash(&mut hasher);
                        let expected_hash = format!("{:x}", hasher.finish());

                        if disk_hash.trim() != expected_hash {
                            validation_passed = false;
                            tests_failed += 1;
                            let err = format!("Gate B failed: Ownership contract hash drift. Expected: {}, Disk: {}", expected_hash, disk_hash);
                            append_to_builder_log(&task_dir, &err);
                            output_summary.push_str(&err);
                            output_summary.push('\n');
                        } else {
                            // Run validate_ownership
                            match crate::swarm_ownership::validate_ownership(
                                worktree_path.to_string_lossy().to_string(),
                                allowed_patterns
                            ) {
                                Ok(res) if res.is_valid => {
                                    append_to_builder_log(&task_dir, "Gate B passed. All changes are inside the allowed patterns.");
                                }
                                Ok(res) => {
                                    validation_passed = false;
                                    tests_failed += 1;
                                    let err = format!("Gate B failed: Violations found: {:?}", res.violated_files);
                                    append_to_builder_log(&task_dir, &err);
                                    output_summary.push_str(&err);
                                    output_summary.push('\n');
                                }
                                Err(e) => {
                                    validation_passed = false;
                                    tests_failed += 1;
                                    let err = format!("Gate B failed: validate_ownership error: {}", e);
                                    append_to_builder_log(&task_dir, &err);
                                    output_summary.push_str(&err);
                                    output_summary.push('\n');
                                }
                            }
                        }
                    }
                }
            }
        } else {
            append_to_builder_log(&task_dir, "Gate B skipped: ownership metadata missing.");
        }
    }

    // 3. Gate C: Git Integrity Check
    if validation_passed {
        tests_total += 1;
        append_to_builder_log(&task_dir, "Running Gate C: Git Integrity...");
        let status_out = crate::hidden_command::new_command("git")
            .current_dir(&worktree_path)
            .args(&["status", "--porcelain"])
            .output();

        match status_out {
            Ok(out) if out.status.success() => {
                append_to_builder_log(&task_dir, "Gate C passed. Git status porcelain checks completed.");
            }
            _ => {
                validation_passed = false;
                tests_failed += 1;
                let err = "Gate C failed: git status command execution failed".to_string();
                append_to_builder_log(&task_dir, &err);
                output_summary.push_str(&err);
                output_summary.push('\n');
            }
        }
    }

    // 4. Gate D, E, F: Compilation, Lints, and Tests (Workspace Analyzer)
    if validation_passed {
        append_to_builder_log(&task_dir, "Running Workspace Analyzer checks...");
        let configs = analyze_workspace(&worktree_path.to_string_lossy());

        if configs.is_empty() {
            append_to_builder_log(&task_dir, "No workspace build/linter configs found. Skipping Gates D, E, F.");
        }

        for config in configs {
            tests_total += 1;
            append_to_builder_log(&task_dir, &format!("Running check: {} {}", config.command, config.args.join(" ")));

            let output = if cfg!(target_os = "windows") {
                crate::hidden_command::new_command("cmd")
                    .args(&["/C", &format!("{} {}", config.command, config.args.join(" "))])
                    .current_dir(&worktree_path)
                    .output()
            } else {
                crate::hidden_command::new_command(&config.command)
                    .args(&config.args)
                    .current_dir(&worktree_path)
                    .output()
            };

            match output {
                Ok(out) => {
                    if out.status.success() {
                        append_to_builder_log(&task_dir, &format!("Step passed: {}", config.name));
                    } else {
                        validation_passed = false;
                        tests_failed += 1;
                        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                        let err = format!(
                            "Step failed: {}.\nCommand: {}\nStdout: {}\nStderr: {}",
                            config.name, config.command, stdout, stderr
                        );
                        append_to_builder_log(&task_dir, &err);
                        output_summary.push_str(&err);
                        output_summary.push('\n');
                        break; // Stop at first compilation failure
                    }
                }
                Err(e) => {
                    validation_passed = false;
                    tests_failed += 1;
                    let err = format!("Failed to spawn validation command '{}': {}", config.command, e);
                    append_to_builder_log(&task_dir, &err);
                    output_summary.push_str(&err);
                    output_summary.push('\n');
                    break;
                }
            }
        }
    }

    // 5. Gate G: Patch Generation & Draft Artifact Promotion
    if validation_passed {
        append_to_builder_log(&task_dir, "Generating workspace diff patch...");
        let patch_out = crate::hidden_command::new_command("git")
            .current_dir(&worktree_path)
            .args(&["diff", "HEAD~1"]) // Or diff against main/branch if HEAD~1 is not present
            .output();

        let patch_content = match patch_out {
            Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
            _ => {
                // Try diffing against HEAD
                let fallback_diff = crate::hidden_command::new_command("git")
                    .current_dir(&worktree_path)
                    .args(&["diff", "HEAD"])
                    .output();
                if let Ok(out) = fallback_diff {
                    String::from_utf8_lossy(&out.stdout).to_string()
                } else {
                    "".to_string()
                }
            }
        };

        let patch_path = task_dir.join("workspace.patch");
        if let Err(e) = fs::write(&patch_path, &patch_content) {
            append_to_builder_log(&task_dir, &format!("Warning: failed to write workspace.patch: {}", e));
        } else {
            append_to_builder_log(&task_dir, "Successfully generated workspace.patch");
        }
    }

    // Write validation results
    let result = VerificationResult {
        schema_version: 1,
        passed: validation_passed,
        tests_total,
        tests_failed,
        output_summary: if validation_passed {
            "All validation checks passed successfully.".to_string()
        } else {
            output_summary.clone()
        },
    };

    let verification_json = serde_json::to_string_pretty(&result).unwrap_or_default();
    let _ = fs::write(task_dir.join("verification.json"), verification_json);

    // Save final report to builder.log
    append_to_builder_log(
        &task_dir,
        &format!(
            "=== Validation Finished: Passed = {}, Total steps = {}, Failed steps = {} ===",
            validation_passed, tests_total, tests_failed
        ),
    );

    if validation_passed {
        // Transition to REVIEWING
        update_fs_task_state(project_path, task_id, TaskState::Reviewing)?;
        let _ = event_bus.dispatch(
            project_path,
            SwarmEvent::TaskStatusChanged {
                task_id: task_id.to_string(),
                status: "REVIEWING".to_string(),
            },
            app_handle,
        );
        Ok(true)
    } else {
        // Increment attempts count
        state.attempts += 1;
        let _ = fs::write(
            task_dir.join("state.json"),
            serde_json::to_string_pretty(&state).unwrap_or_default(),
        );

        let retry_limit = spec.worker.retry_limit;
        if state.attempts < retry_limit {
            let msg = format!(
                "Validation failed (Attempt {}/{}). Retrying task execution...",
                state.attempts, retry_limit
            );
            append_to_builder_log(&task_dir, &msg);

            // Move back to EXECUTING for auto-retry
            update_fs_task_state(project_path, task_id, TaskState::Executing)?;
            let _ = event_bus.dispatch(
                project_path,
                SwarmEvent::TaskStatusChanged {
                    task_id: task_id.to_string(),
                    status: "EXECUTING".to_string(),
                },
                app_handle,
            );
        } else {
            let msg = format!(
                "Validation failed (Attempt {}/{}). Retry limit reached. Transitioning to WAITING_HUMAN.",
                state.attempts, retry_limit
            );
            append_to_builder_log(&task_dir, &msg);

            // Move to WAITING_HUMAN so human operator can intervene
            update_fs_task_state(project_path, task_id, TaskState::WaitingHuman)?;
            let _ = event_bus.dispatch(
                project_path,
                SwarmEvent::TaskStatusChanged {
                    task_id: task_id.to_string(),
                    status: "WAITING_HUMAN".to_string(),
                },
                app_handle,
            );
        }

        Ok(false)
    }
}

