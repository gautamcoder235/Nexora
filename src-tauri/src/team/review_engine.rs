use rusqlite::Connection;
use crate::team::task_distributor::get_tasks;
use crate::team::messages::log_system_message;

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::team::task_types::{
    TaskSpec, TaskState, read_task_state, update_task_state as update_fs_task_state, get_task_dir
};
use crate::team::bus::{EventBus, SwarmEvent};

pub fn submit_for_review(conn: &Connection, execution_id: &str) -> Result<(), String> {
    let tasks = get_tasks(conn)?;
    let task = tasks.iter().find(|t| t.execution_id == execution_id)
        .ok_or_else(|| format!("Task with execution_id {} not found", execution_id))?;

    conn.execute(
        "UPDATE team_tasks SET state = 'review' WHERE id = ?1",
        [&task.id],
    )
    .map_err(|e| format!("Submit for review failed: {}", e))?;

    if let Some(ref assignee) = task.assignee_id {
        let _ = log_system_message(
            conn,
            assignee,
            Some("rev"),
            Some(&task.id),
            "request",
            &format!("Submitted task '{}' for code review. Please verify changes.", task.title),
        );
    }

    Ok(())
}

pub fn approve_changes(
    conn: &Connection,
    execution_id: &str,
    reviewer_id: &str,
    comment: &str,
) -> Result<(), String> {
    let tasks = get_tasks(conn)?;
    let task = tasks.iter().find(|t| t.execution_id == execution_id)
        .ok_or_else(|| format!("Task with execution_id {} not found", execution_id))?;

    conn.execute(
        "UPDATE team_tasks SET state = 'validation' WHERE id = ?1",
        [&task.id],
    )
    .map_err(|e| format!("Approve changes failed: {}", e))?;

    let _ = log_system_message(
        conn,
        reviewer_id,
        task.assignee_id.as_deref(),
        Some(&task.id),
        "review",
        &format!("APPROVED task '{}': {}", task.title, comment),
    );

    // Prompt coordinator to trigger validation
    let _ = log_system_message(
        conn,
        reviewer_id,
        Some("coord"),
        Some(&task.id),
        "response",
        &format!("Task '{}' has been approved. Moving to validation.", task.title),
    );

    Ok(())
}

pub fn request_changes(
    conn: &Connection,
    execution_id: &str,
    reviewer_id: &str,
    reason: &str,
) -> Result<(), String> {
    let tasks = get_tasks(conn)?;
    let task = tasks.iter().find(|t| t.execution_id == execution_id)
        .ok_or_else(|| format!("Task with execution_id {} not found", execution_id))?;

    // Increment attempts on the task and rollback its status to backlog
    conn.execute(
        "UPDATE team_tasks SET state = 'backlog', attempts = attempts + 1 WHERE id = ?1",
        [&task.id],
    )
    .map_err(|e| format!("Request changes failed: {}", e))?;

    // Log the review rejection comments
    let _ = log_system_message(
        conn,
        reviewer_id,
        task.assignee_id.as_deref(),
        Some(&task.id),
        "review",
        &format!("REJECTED task '{}' changes requested: {}", task.title, reason),
    );

    // Reset assignee to let task distributor reassign or retry
    conn.execute(
        "UPDATE team_tasks SET assignee_id = NULL WHERE id = ?1",
        [&task.id],
    )
    .map_err(|e| format!("Reset assignee failed: {}", e))?;

    // Reset agent status
    if let Some(ref assignee) = task.assignee_id {
        let _ = conn.execute(
            "UPDATE team_agents SET status = 'idle', active_task_id = NULL, execution_id = NULL WHERE id = ?1",
            [assignee],
        );
    }

    Ok(())
}

fn append_to_reviewer_log(task_dir: &Path, message: &str) {
    let log_path = task_dir.join("logs").join("reviewer.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = writeln!(file, "[{}] [REVIEWER] {}", timestamp, message);
    }
}

pub fn run_task_review(
    app_handle: &AppHandle,
    project_path: &str,
    task_id: &str,
    approve: bool,
    reviewer_id: &str,
    feedback: &str,
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

    // Load state.json
    let mut state = read_task_state(project_path, task_id)?;

    // Transition to Reviewing during audit
    update_fs_task_state(project_path, task_id, TaskState::Reviewing)?;
    let event_bus = app_handle.state::<EventBus>();
    let _ = event_bus.dispatch(
        project_path,
        SwarmEvent::TaskStatusChanged {
            task_id: task_id.to_string(),
            status: "REVIEWING".to_string(),
        },
        app_handle,
    );

    append_to_reviewer_log(&task_dir, &format!("Review initiated by agent: {}", reviewer_id));
    append_to_reviewer_log(&task_dir, &format!("Feedback comments: {}", feedback));

    // Save review feedback text file
    let review_txt_path = task_dir.join("review.txt");
    fs::write(&review_txt_path, feedback).map_err(|e| format!("Failed to write review.txt: {}", e))?;

    if approve {
        append_to_reviewer_log(&task_dir, "Review APPROVED.");
        // Transition to Completed
        update_fs_task_state(project_path, task_id, TaskState::Completed)?;
        let _ = event_bus.dispatch(
            project_path,
            SwarmEvent::TaskStatusChanged {
                task_id: task_id.to_string(),
                status: "COMPLETED".to_string(),
            },
            app_handle,
        );
    } else {
        append_to_reviewer_log(&task_dir, "Review REJECTED / Changes requested.");

        // Increment attempts count
        state.attempts += 1;
        fs::write(
            task_dir.join("state.json"),
            serde_json::to_string_pretty(&state).unwrap_or_default(),
        ).map_err(|e| e.to_string())?;

        let retry_limit = spec.worker.retry_limit;
        if state.attempts < retry_limit {
            append_to_reviewer_log(
                &task_dir,
                &format!("Attempt {}/{} is below limit. Rolled back task to EXECUTING.", state.attempts, retry_limit)
            );

            // Transition back to EXECUTING
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
            append_to_reviewer_log(
                &task_dir,
                &format!("Attempt {}/{} reached retry limit. Transitioning to WAITING_HUMAN.", state.attempts, retry_limit)
            );

            // Transition to WAITING_HUMAN
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
    }

    Ok(())
}

