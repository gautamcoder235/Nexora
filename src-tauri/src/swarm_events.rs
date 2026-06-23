use crate::swarm_db::DbState;
use crate::swarm_queries::ExecutionSummary;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};

static EVENT_COUNTER: AtomicUsize = AtomicUsize::new(0);

pub fn emit_event(
    app_handle: &AppHandle,
    event_name: &str,
    execution_id: &str,
) -> Result<(), String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state
        .0
        .lock()
        .map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let summary = {
        let mut stmt = conn.prepare("
            SELECT
                e.id,
                COALESCE(t.title, 'Untitled Task') as task_title,
                COALESCE(e.agent_id, '') as agent_id,
                e.status,
                e.start_time,
                e.end_time,
                (SELECT status FROM validation_runs WHERE execution_id = e.id ORDER BY started_at DESC LIMIT 1) as validation_status,
                (SELECT COUNT(*) FROM validation_steps vs
                 JOIN validation_runs vr2 ON vs.validation_run_id = vr2.id
                 WHERE vr2.execution_id = e.id AND vs.status = 'passed') as steps_passed,
                (SELECT COUNT(*) FROM validation_steps vs
                 JOIN validation_runs vr2 ON vs.validation_run_id = vr2.id
                 WHERE vr2.execution_id = e.id) as steps_total,
                (SELECT vs.step_name FROM validation_steps vs
                 JOIN validation_runs vr2 ON vs.validation_run_id = vr2.id
                 WHERE vr2.execution_id = e.id AND vs.status = 'running'
                 LIMIT 1) as current_gate,
                CASE WHEN (SELECT id FROM merge_candidates WHERE execution_id = e.id LIMIT 1) IS NOT NULL THEN 1 ELSE 0 END as has_merge_candidate,
                (SELECT status FROM merge_candidates WHERE execution_id = e.id ORDER BY rowid DESC LIMIT 1) as merge_status,
                e.tokens_prompt,
                e.tokens_completion,
                e.tokens_total,
                e.estimated_cost
            FROM executions e
            LEFT JOIN tasks t ON e.task_id = t.id
            WHERE e.id = ?1
            LIMIT 1
        ").map_err(|e| e.to_string())?;

        stmt.query_row([execution_id], |row| {
            let id: String = row.get(0)?;
            let task_title: String = row.get(1)?;
            let agent_id: String = row.get(2)?;
            let status: String = row.get(3)?;
            let started_at: String = row.get::<_, Option<String>>(4)?.unwrap_or_default();
            let ended_at: Option<String> = row.get(5)?;
            let validation_status: Option<String> = row.get(6)?;
            let validation_steps_passed: i64 = row.get(7)?;
            let validation_steps_total: i64 = row.get(8)?;
            let current_gate: Option<String> = row.get(9)?;
            let has_merge_candidate: bool = row.get::<_, i64>(10)? != 0;
            let merge_status: Option<String> = row.get(11)?;
            let db_prompt: Option<i64> = row.get(12)?;
            let db_completion: Option<i64> = row.get(13)?;
            let db_total: Option<i64> = row.get(14)?;
            let db_cost: Option<f64> = row.get(15)?;

            let (tokens_prompt, tokens_completion, tokens_total, estimated_cost) = 
                if db_total.unwrap_or(0) > 0 {
                    (db_prompt.unwrap_or(0), db_completion.unwrap_or(0), db_total.unwrap_or(0), db_cost.unwrap_or(0.0))
                } else {
                    crate::swarm_queries::get_deterministic_metrics(&id, &status, &started_at, ended_at.as_deref())
                };

            Ok(ExecutionSummary {
                id,
                task_title,
                agent_id,
                status,
                started_at,
                ended_at,
                validation_status,
                validation_steps_passed,
                validation_steps_total,
                current_gate,
                has_merge_candidate,
                merge_status,
                tokens_prompt,
                tokens_completion,
                tokens_total,
                estimated_cost,
            })
        })
        .map_err(|e| e.to_string())?
    };

    // Drop lock before emitting to avoid deadlocks
    drop(conn_guard);

    let _ = app_handle.emit(event_name, summary);
    Ok(())
}

pub fn transition_execution_state(
    app_handle: &AppHandle,
    execution_id: &str,
    new_status: &str,
    detail: Option<&str>,
) -> Result<(), String> {
    {
        let db_state: State<DbState> = app_handle.state();
        let conn_guard = db_state
            .0
            .lock()
            .map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        crate::swarm_db::update_execution_status(conn, execution_id, new_status)
            .map_err(|e| format!("State error: {}", e))?;

        let counter = EVENT_COUNTER.fetch_add(1, Ordering::Relaxed);
        let event_id = format!(
            "evt-{}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis(),
            counter
        );
        crate::swarm_db::insert_execution_event(conn, &event_id, execution_id, new_status, detail)
            .map_err(|e| format!("Event error: {}", e))?;
    }

    let event_name = match new_status {
        "created" => "execution:created",
        "terminated" => "execution:terminated",
        _ => "execution:updated",
    };

    emit_event(app_handle, event_name, execution_id)?;
    Ok(())
}
