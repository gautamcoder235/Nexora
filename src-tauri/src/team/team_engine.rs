use rusqlite::Connection;
use crate::team::task_distributor::{get_tasks, update_task_state, distribute_tasks};
use crate::team::review_engine::{approve_changes, request_changes};
use crate::team::validation_engine::run_validation;
use crate::team::recovery_engine::rollback_and_retry;
use crate::team::messages::log_system_message;

pub fn step_team_engine(conn: &Connection, project_dir: &str) -> Result<(), String> {
    // 1. Distribute backlog tasks to idle agents
    let assigned_count = distribute_tasks(conn)?;
    if assigned_count > 0 {
        println!("[Team Engine] Assigned {} new tasks.", assigned_count);
    }

    // 2. Poll/Step tasks that are in progress
    let tasks = get_tasks(conn)?;
    for task in tasks {
        match task.state.as_str() {
            "assigned" => {
                // Transition to running
                update_task_state(conn, &task.id, "running")?;
                let _ = log_system_message(
                    conn,
                    task.assignee_id.as_deref().unwrap_or("be"),
                    Some("coord"),
                    Some(&task.id),
                    "response",
                    &format!("Starting work on task '{}'", task.title),
                );

                // Create a checkpoint before work starts
                let _ = crate::team::checkpoint_manager::create_checkpoint(project_dir, &task.execution_id);
            }
            "running" => {
                // In a real execution, the agent script runs asynchronously.
                // For the orchestration engine, we simulate/allow transitioning to review when done.
            }
            _ => {}
        }
    }

    Ok(())
}

pub fn force_task_validation(
    conn: &Connection,
    execution_id: &str,
    project_dir: &str,
) -> Result<bool, String> {
    run_validation(conn, execution_id, project_dir)
}

pub fn force_task_review(
    conn: &Connection,
    execution_id: &str,
    approve: bool,
    reviewer_id: &str,
    comment: &str,
) -> Result<(), String> {
    if approve {
        approve_changes(conn, execution_id, reviewer_id, comment)
    } else {
        request_changes(conn, execution_id, reviewer_id, comment)
    }
}

pub fn rollback_task_checkpoint(
    conn: &Connection,
    execution_id: &str,
    project_dir: &str,
) -> Result<(), String> {
    rollback_and_retry(conn, execution_id, project_dir)
}
