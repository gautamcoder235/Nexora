use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use crate::swarm_db::DbState;

#[derive(Serialize, Deserialize)]
pub struct ValidationStepInfo {
    pub id: String,
    pub step_name: String,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<u64>,
    pub status: String,
    pub artifact_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ValidationRunInfo {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub status: String,
    pub steps: Vec<ValidationStepInfo>,
}

#[derive(Serialize, Deserialize)]
pub struct ArtifactInfo {
    pub id: String,
    pub artifact_type: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub checksum: String,
}

#[derive(Serialize, Deserialize)]
pub struct MergeCandidateInfo {
    pub id: String,
    pub execution_id: String,
    pub patch_artifact_id: String,
    pub status: String,
    pub reviewed_at: Option<String>,
    pub reviewed_by: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ExecutionLogInfo {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExecutionMetadata {
    pub execution_id: String,
    pub task_id: String,
    pub agent_id: String,
    pub pid: Option<u32>,
    pub head_commit: Option<String>,
    pub branch: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub validation_run_id: Option<String>,
    pub status: String,
}

#[tauri::command]
pub fn get_validation_run(app_handle: AppHandle, execution_id: String) -> Result<Option<ValidationRunInfo>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let run = conn.query_row(
        "SELECT id, started_at, ended_at, status FROM validation_runs WHERE execution_id = ?1 ORDER BY started_at DESC LIMIT 1",
        rusqlite::params![execution_id],
        |row| {
            Ok(ValidationRunInfo {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                status: row.get(3)?,
                steps: vec![],
            })
        }
    ).optional().map_err(|e| format!("DB Query Error: {}", e))?;

    if let Some(mut run_info) = run {
        let mut stmt = conn.prepare("SELECT id, step_name, exit_code, duration_ms, status, artifact_id FROM validation_steps WHERE validation_run_id = ?1 ORDER BY rowid ASC").unwrap();
        let step_iter = stmt.query_map([&run_info.id], |row| {
            Ok(ValidationStepInfo {
                id: row.get(0)?,
                step_name: row.get(1)?,
                exit_code: row.get(2)?,
                duration_ms: row.get(3)?,
                status: row.get(4)?,
                artifact_id: row.get(5)?,
            })
        }).unwrap();

        for step in step_iter {
            if let Ok(s) = step {
                run_info.steps.push(s);
            }
        }
        return Ok(Some(run_info));
    }

    Ok(None)
}

#[tauri::command]
pub fn get_artifacts(app_handle: AppHandle, execution_id: String) -> Result<Vec<ArtifactInfo>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare("SELECT id, artifact_type, file_path, size_bytes, created_at, checksum FROM artifacts WHERE execution_id = ?1 ORDER BY created_at ASC").unwrap();
    let artifact_iter = stmt.query_map([&execution_id], |row| {
        Ok(ArtifactInfo {
            id: row.get(0)?,
            artifact_type: row.get(1)?,
            file_path: row.get(2)?,
            size_bytes: row.get(3)?,
            created_at: row.get(4)?,
            checksum: row.get(5)?,
        })
    }).unwrap();

    let mut artifacts = Vec::new();
    for a in artifact_iter {
        if let Ok(art) = a {
            artifacts.push(art);
        }
    }
    Ok(artifacts)
}

#[tauri::command]
pub fn get_execution_logs(app_handle: AppHandle, execution_id: String) -> Result<Vec<ExecutionLogInfo>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare("SELECT id, timestamp, level, message FROM execution_logs WHERE execution_id = ?1 ORDER BY rowid ASC").unwrap();
    let log_iter = stmt.query_map([&execution_id], |row| {
        Ok(ExecutionLogInfo {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            level: row.get(2)?,
            message: row.get(3)?,
        })
    }).unwrap();

    let mut logs = Vec::new();
    for l in log_iter {
        if let Ok(log) = l {
            logs.push(log);
        }
    }
    Ok(logs)
}

#[tauri::command]
pub fn get_execution_metadata(app_handle: AppHandle, execution_id: String) -> Result<Option<ExecutionMetadata>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let meta = conn.query_row(
        "SELECT 
            e.task_id, 
            e.agent_id, 
            p.pid, 
            s.head_commit, 
            s.branch, 
            e.start_time, 
            e.end_time, 
            v.id as validation_run_id, 
            e.status 
         FROM executions e
         LEFT JOIN agent_processes p ON p.execution_id = e.id
         LEFT JOIN execution_snapshots s ON s.execution_id = e.id
         LEFT JOIN validation_runs v ON v.execution_id = e.id
         WHERE e.id = ?1
         LIMIT 1",
        rusqlite::params![execution_id],
        |row| {
            Ok(ExecutionMetadata {
                execution_id: execution_id.clone(),
                task_id: row.get(0)?,
                agent_id: row.get(1)?,
                pid: row.get(2)?,
                head_commit: row.get(3)?,
                branch: row.get(4)?,
                started_at: row.get(5)?,
                ended_at: row.get(6)?,
                validation_run_id: row.get(7)?,
                status: row.get(8)?,
            })
        }
    ).optional().map_err(|e| format!("DB Query Error: {}", e))?;

    Ok(meta)
}

#[tauri::command]
pub fn get_merge_candidate(app_handle: AppHandle, execution_id: String) -> Result<Option<MergeCandidateInfo>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let candidate = conn.query_row(
        "SELECT id, execution_id, patch_artifact_id, status, reviewed_at, reviewed_by FROM merge_candidates WHERE execution_id = ?1 LIMIT 1",
        rusqlite::params![execution_id],
        |row| {
            Ok(MergeCandidateInfo {
                id: row.get(0)?,
                execution_id: row.get(1)?,
                patch_artifact_id: row.get(2)?,
                status: row.get(3)?,
                reviewed_at: row.get(4)?,
                reviewed_by: row.get(5)?,
            })
        }
    ).optional().map_err(|e| format!("DB Query Error: {}", e))?;

    Ok(candidate)
}

#[tauri::command]
pub fn review_merge_candidate(app_handle: AppHandle, execution_id: String, action: String) -> Result<(), String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let new_status = match action.as_str() {
        "approve" => "approved",
        "reject" => "rejected",
        _ => return Err("Invalid action. Must be 'approve' or 'reject'".to_string()),
    };

    let current_status: String = conn.query_row(
        "SELECT status FROM merge_candidates WHERE execution_id = ?1",
        rusqlite::params![execution_id],
        |row| row.get(0)
    ).map_err(|_| "Merge candidate not found".to_string())?;

    if current_status != "pending_review" {
        return Err(format!("Cannot {} candidate in status {}", action, current_status));
    }

    conn.execute(
        "UPDATE merge_candidates SET status = ?1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = 'local_user' WHERE execution_id = ?2",
        rusqlite::params![new_status, execution_id]
    ).map_err(|e| format!("DB Update Error: {}", e))?;

    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct ArtifactReadResult {
    pub content: Option<String>,
    pub error: Option<String>,
    pub corrupted: bool,
}

#[tauri::command]
pub fn read_artifact(app_handle: AppHandle, artifact_id: String) -> Result<ArtifactReadResult, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let (file_path, expected_checksum): (String, String) = conn.query_row(
        "SELECT file_path, checksum FROM artifacts WHERE id = ?1",
        rusqlite::params![artifact_id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|e| format!("Artifact not found: {}", e))?;

    let content = std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read artifact from disk: {}", e))?;

    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    let actual_checksum = format!("{:x}", hasher.finish());

    if actual_checksum != expected_checksum {
        return Ok(ArtifactReadResult {
            content: None,
            error: Some("Artifact corruption detected: SHA hash mismatch.".to_string()),
            corrupted: true,
        });
    }

    Ok(ArtifactReadResult {
        content: Some(content),
        error: None,
        corrupted: false,
    })
}

// ============================================================================
// Phase 5: Swarm Control Center Queries
// ============================================================================

use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::atomic::{AtomicUsize, Ordering};

static QUERIES_ID_COUNTER: AtomicUsize = AtomicUsize::new(0);

fn gen_id(prefix: &str) -> String {
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let counter = QUERIES_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{}", prefix, ms, counter)
}

// -- ExecutionSummary (rich list row) ----------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct ExecutionSummary {
    pub id: String,
    pub task_title: String,
    pub agent_id: String,
    pub status: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub validation_status: Option<String>,
    pub validation_steps_passed: i64,
    pub validation_steps_total: i64,
    pub current_gate: Option<String>,
    pub has_merge_candidate: bool,
    pub merge_status: Option<String>,
}

#[tauri::command]
pub fn list_executions(app_handle: AppHandle, limit: Option<i64>) -> Result<Vec<ExecutionSummary>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let max = limit.unwrap_or(50);
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
            (SELECT status FROM merge_candidates WHERE execution_id = e.id ORDER BY rowid DESC LIMIT 1) as merge_status
        FROM executions e
        LEFT JOIN tasks t ON e.task_id = t.id
        WHERE e.deleted_at IS NULL
        ORDER BY e.start_time DESC
        LIMIT ?1
    ").map_err(|e| e.to_string())?;

    let rows = stmt.query_map([max], |row| {
        Ok(ExecutionSummary {
            id: row.get(0)?,
            task_title: row.get(1)?,
            agent_id: row.get(2)?,
            status: row.get(3)?,
            started_at: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            ended_at: row.get(5)?,
            validation_status: row.get(6)?,
            validation_steps_passed: row.get(7)?,
            validation_steps_total: row.get(8)?,
            current_gate: row.get(9)?,
            has_merge_candidate: row.get::<_, i64>(10)? != 0,
            merge_status: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for r in rows { results.push(r.map_err(|e| e.to_string())?); }
    Ok(results)
}

// -- Terminate Execution -------------------------------------------------------

#[tauri::command]
pub async fn terminate_execution(app_handle: AppHandle, execution_id: String) -> Result<(), String> {
    let pid_opt: Option<u32> = {
        let db_state: State<DbState> = app_handle.state();
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        conn.query_row(
            "SELECT pid FROM agent_processes WHERE execution_id = ?1 AND status = 'running' LIMIT 1",
            rusqlite::params![execution_id],
            |row| row.get(0)
        ).unwrap_or(None)
    };

    if let Some(pid) = pid_opt {
        // Attempt graceful terminate
        #[cfg(windows)]
        let _ = std::process::Command::new("taskkill").args(["/PID", &pid.to_string()]).output();
        #[cfg(unix)]
        unsafe { libc::kill(pid as i32, libc::SIGTERM); }

        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

        // Force kill tree
        #[cfg(windows)]
        let _ = std::process::Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).output();
        #[cfg(unix)]
        unsafe { libc::kill(-(pid as i32), libc::SIGKILL); }

        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    crate::swarm_events::transition_execution_state(&app_handle, &execution_id, "terminated", Some("Manually terminated by user"))?;

    Ok(())
}

// -- Execution Events (Timeline) ----------------------------------------------

#[derive(Serialize, Deserialize)]
pub struct ExecutionEventInfo {
    pub id: String,
    pub event_type: String,
    pub detail: Option<String>,
    pub timestamp: String,
}

#[tauri::command]
pub fn get_execution_events(app_handle: AppHandle, execution_id: String) -> Result<Vec<ExecutionEventInfo>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT id, event_type, detail, timestamp FROM execution_events WHERE execution_id = ?1 ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![execution_id], |row| {
        Ok(ExecutionEventInfo {
            id: row.get(0)?,
            event_type: row.get(1)?,
            detail: row.get(2)?,
            timestamp: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?;

    let mut events = Vec::new();
    for r in rows { events.push(r.map_err(|e| e.to_string())?); }
    Ok(events)
}

// -- Execution Drafts ---------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct ExecutionDraft {
    pub id: String,
    pub repo_name: String,
    pub repo_path: String,
    pub task_title: String,
    pub task_description: Option<String>,
    pub agent_id: String,
    pub allowed_patterns: Vec<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn save_execution_draft(
    app_handle: AppHandle,
    repo_name: String,
    repo_path: String,
    task_title: String,
    task_description: String,
    agent_id: String,
    allowed_patterns: Vec<String>,
) -> Result<ExecutionDraft, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let id = gen_id("draft");
    let patterns_json = serde_json::to_string(&allowed_patterns).unwrap_or_default();

    crate::swarm_db::insert_execution_draft(
        conn, &id, &repo_name, &repo_path, &task_title, &task_description, &agent_id, &patterns_json
    ).map_err(|e| format!("DB Draft Error: {}", e))?;

    Ok(ExecutionDraft {
        id,
        repo_name,
        repo_path,
        task_title,
        task_description: Some(task_description),
        agent_id,
        allowed_patterns,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn list_execution_drafts(app_handle: AppHandle) -> Result<Vec<ExecutionDraft>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT id, repo_name, repo_path, task_title, task_description, agent_id, allowed_patterns, created_at FROM execution_drafts ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        let patterns_json: String = row.get(6)?;
        let patterns: Vec<String> = serde_json::from_str(&patterns_json).unwrap_or_default();
        Ok(ExecutionDraft {
            id: row.get(0)?,
            repo_name: row.get(1)?,
            repo_path: row.get(2)?,
            task_title: row.get(3)?,
            task_description: row.get(4)?,
            agent_id: row.get(5)?,
            allowed_patterns: patterns,
            created_at: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?;

    let mut drafts = Vec::new();
    for r in rows { drafts.push(r.map_err(|e| e.to_string())?); }
    Ok(drafts)
}

#[tauri::command]
pub fn discard_execution_draft(app_handle: AppHandle, draft_id: String) -> Result<(), String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    crate::swarm_db::delete_execution_draft(conn, &draft_id).map_err(|e| e.to_string())
}
