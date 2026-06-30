use rusqlite::Connection;
use crate::team::task_distributor::get_tasks;
use crate::team::messages::log_system_message;
use crate::team::checkpoint_manager::restore_checkpoint;

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::team::bus::{EventBus, SwarmEvent};

pub fn rollback_and_retry(
    conn: &Connection,
    execution_id: &str,
    project_dir: &str,
) -> Result<(), String> {
    let tasks = get_tasks(conn)?;
    let task = tasks
        .iter()
        .find(|t| t.execution_id == execution_id)
        .ok_or_else(|| format!("Task with execution_id {} not found", execution_id))?;

    // Log recovery start
    let _ = log_system_message(
        conn,
        "coord",
        None,
        Some(&task.id),
        "warning",
        &format!("Initiating recovery for task '{}'. Restoring code checkpoint...", task.title),
    );

    // Revert git changes using checkpoint manager
    restore_checkpoint(project_dir, execution_id)?;

    // Increment attempts and update state
    conn.execute(
        "UPDATE team_tasks SET state = 'backlog', assignee_id = NULL, attempts = attempts + 1 WHERE id = ?1",
        [&task.id],
    )
    .map_err(|e| format!("Failed to update task state during rollback: {}", e))?;

    // Reset agent status
    if let Some(ref assignee) = task.assignee_id {
        conn.execute(
            "UPDATE team_agents SET status = 'idle', active_task_id = NULL, execution_id = NULL WHERE id = ?1",
            [assignee],
        )
        .map_err(|e| format!("Failed to reset agent status: {}", e))?;
    }

    let _ = log_system_message(
        conn,
        "coord",
        None,
        Some(&task.id),
        "response",
        &format!("Recovery completed for task '{}'. Re-added to backlog.", task.title),
    );

    Ok(())
}

pub fn run_startup_recovery(app_handle: &AppHandle, project_path: &str) -> Result<(), String> {
    let tasks_dir = Path::new(project_path).join(".nexora").join("tasks");
    if !tasks_dir.exists() || !tasks_dir.is_dir() {
        return Ok(());
    }

    let entries = fs::read_dir(&tasks_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let task_id = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            
            // Try reading state.json
            if let Ok(state) = crate::team::task_types::read_task_state(project_path, &task_id) {
                let status_str = state.status.clone();
                if status_str == "EXECUTING" || status_str == "VALIDATING" || status_str == "REVIEWING" {
                    // Orphaned/stale task on boot
                    crate::team::task_types::update_task_state(project_path, &task_id, crate::team::task_types::TaskState::Staled)?;
                    
                    let log_path = path.join("logs").join("builder.log");
                    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
                        let timestamp = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        let _ = writeln!(file, "[{}] [RECOVERY] Startup recovery detected transient task in state '{}' but no active PTY exists. Marked as STALED.", timestamp, status_str);
                    }

                    // Dispatch event
                    let event_bus = app_handle.state::<EventBus>();
                    let _ = event_bus.dispatch(
                        project_path,
                        SwarmEvent::TaskStatusChanged {
                            task_id: task_id.clone(),
                            status: "STALED".to_string(),
                        },
                        app_handle,
                    );
                }
            }
        }
    }

    Ok(())
}

