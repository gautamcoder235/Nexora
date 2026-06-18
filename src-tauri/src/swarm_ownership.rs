use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::Path;
use globset::{Glob, GlobSetBuilder};

use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use rusqlite::OptionalExtension;
use crate::swarm_db::DbState;

#[derive(Serialize, Deserialize)]
pub struct OwnershipValidationResult {
    pub is_valid: bool,
    pub violated_files: Vec<String>,
    pub modified_files: Vec<String>,
}

#[tauri::command]
pub fn validate_ownership(worktree_path: String, allowed_patterns: Vec<String>) -> Result<OwnershipValidationResult, String> {
    let root = Path::new(&worktree_path);

    if !root.exists() {
        return Err("Worktree path does not exist".to_string());
    }

    // 1. Get all modified, added, deleted, or untracked files
    // `git status --porcelain` gives us everything that has changed.
    let output = Command::new("git")
        .current_dir(root)
        .arg("status")
        .arg("--porcelain")
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        return Err(format!("git status failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let status_output = String::from_utf8_lossy(&output.stdout);
    let mut modified_files = Vec::new();

    for line in status_output.lines() {
        if line.len() > 3 {
            // git status --porcelain format: "XY filename"
            // We just need the filename part, which starts at index 3
            let filename = &line[3..];
            modified_files.push(filename.to_string());
        }
    }

    // If no files changed, automatically valid
    if modified_files.is_empty() {
        return Ok(OwnershipValidationResult {
            is_valid: true,
            violated_files: vec![],
            modified_files: vec![],
        });
    }

    // 2. Compile glob patterns
    let mut builder = GlobSetBuilder::new();
    for pattern in allowed_patterns {
        let glob = Glob::new(&pattern).map_err(|e| format!("Invalid glob pattern '{}': {}", pattern, e))?;
        builder.add(glob);
    }
    
    let globset = builder.build().map_err(|e| format!("Failed to compile globset: {}", e))?;

    // 3. Match modified files against patterns
    let mut violated_files = Vec::new();
    
    for file in &modified_files {
        // If the globset is empty, ANY modification is a violation.
        // If it's not empty, check if it matches.
        if !globset.is_match(file) {
            violated_files.push(file.clone());
        }
    }

    Ok(OwnershipValidationResult {
        is_valid: violated_files.is_empty(),
        violated_files,
        modified_files,
    })
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ResourceLockInfo {
    pub file_path: String,
    pub agent_id: String,
    pub expires_at: i64,
    pub heartbeat_at: i64,
}

#[tauri::command]
pub fn acquire_lock(
    app_handle: AppHandle,
    agent_id: String,
    file_path: String,
    ttl_seconds: Option<i64>,
) -> Result<bool, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let ttl = ttl_seconds.unwrap_or(30);
    let expires_at = now + ttl;

    // Check if lock exists and who owns it
    let mut stmt = conn.prepare("SELECT agent_id, expires_at FROM resource_locks WHERE file_path = ?1")
        .map_err(|e| e.to_string())?;
    
    let existing: Option<(String, i64)> = stmt.query_row([&file_path], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).optional().map_err(|e| e.to_string())?;

    if let Some((existing_agent_id, existing_expires_at)) = existing {
        // Check if expired, or if it is owned by the same agent
        if now >= existing_expires_at || existing_agent_id == agent_id {
            // Can overwrite/re-acquire
            conn.execute(
                "UPDATE resource_locks SET agent_id = ?1, expires_at = ?2, heartbeat_at = ?3 WHERE file_path = ?4",
                rusqlite::params![agent_id, expires_at, now, file_path],
            ).map_err(|e| e.to_string())?;
            return Ok(true);
        } else {
            // Still locked by another agent
            return Ok(false);
        }
    } else {
        // Insert new lock
        conn.execute(
            "INSERT INTO resource_locks (file_path, agent_id, expires_at, heartbeat_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![file_path, agent_id, expires_at, now],
        ).map_err(|e| e.to_string())?;
        return Ok(true);
    }
}

#[tauri::command]
pub fn release_lock(
    app_handle: AppHandle,
    agent_id: String,
    file_path: String,
) -> Result<bool, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let deleted = conn.execute(
        "DELETE FROM resource_locks WHERE file_path = ?1 AND agent_id = ?2",
        rusqlite::params![file_path, agent_id],
    ).map_err(|e| e.to_string())?;

    Ok(deleted > 0)
}

#[tauri::command]
pub fn heartbeat_lock(
    app_handle: AppHandle,
    agent_id: String,
    file_path: String,
) -> Result<bool, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Extend expires_at by 30 seconds (or another configured timeout)
    let extended_expires_at = now + 30;

    let updated = conn.execute(
        "UPDATE resource_locks SET heartbeat_at = ?1, expires_at = ?2 WHERE file_path = ?3 AND agent_id = ?4",
        rusqlite::params![now, extended_expires_at, file_path, agent_id],
    ).map_err(|e| format!("Failed to update heartbeat: {}", e))?;

    Ok(updated > 0)
}

#[tauri::command]
pub fn get_resource_locks(app_handle: AppHandle) -> Result<Vec<ResourceLockInfo>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare("SELECT file_path, agent_id, expires_at, heartbeat_at FROM resource_locks")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(ResourceLockInfo {
            file_path: row.get(0)?,
            agent_id: row.get(1)?,
            expires_at: row.get(2)?,
            heartbeat_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn start_lock_watchdog(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

            let expired_locks = {
                let db_state = match app_handle.try_state::<DbState>() {
                    Some(state) => state,
                    None => continue,
                };
                
                let conn_guard = match db_state.0.lock() {
                    Ok(guard) => guard,
                    Err(_) => continue,
                };
                
                let conn = match conn_guard.as_ref() {
                    Some(c) => c,
                    None => continue,
                };

                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;

                let mut stmt = match conn.prepare("SELECT file_path, agent_id, expires_at FROM resource_locks WHERE expires_at < ?1") {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                let rows = match stmt.query_map([now], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
                }) {
                    Ok(r) => r,
                    Err(_) => continue,
                };

                let mut list = Vec::new();
                for r in rows {
                    if let Ok(item) = r {
                        list.push(item);
                    }
                }

                if !list.is_empty() {
                    let _ = conn.execute("DELETE FROM resource_locks WHERE expires_at < ?1", [now]);
                }

                list
            };

            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;

            for (file_path, agent_id, expires_at) in expired_locks {
                #[derive(Serialize, Clone)]
                struct LockExpirationPayload {
                    file_path: String,
                    agent_id: String,
                    expired_at: i64,
                    cleared_at: i64,
                }

                let payload = LockExpirationPayload {
                    file_path,
                    agent_id,
                    expired_at: expires_at,
                    cleared_at: now,
                };

                let _ = app_handle.emit("lock:expired", payload);
            }
        }
    });
}
