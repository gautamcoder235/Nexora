use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{params, Connection, OptionalExtension};

// ==========================================
// Filesystem-Backed Lock Manager (New OS)
// ==========================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResourceLock {
    pub schema_version: u32,
    pub resource: String,      // file path or resource key
    pub owner: String,         // task_id or owner agent
    pub timestamp: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LocksManifest {
    pub schema_version: u32,
    pub locks: Vec<ResourceLock>,
}

fn get_locks_file_path(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".nexora").join("state").join("locks.json")
}

pub fn load_locks(project_path: &str) -> Result<LocksManifest, String> {
    let path = get_locks_file_path(project_path);
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let manifest = LocksManifest {
            schema_version: 1,
            locks: vec![],
        };
        let json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        return Ok(manifest);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let manifest: LocksManifest = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(manifest)
}

pub fn save_locks(project_path: &str, manifest: &LocksManifest) -> Result<(), String> {
    let path = get_locks_file_path(project_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn acquire_resource_lock(
    project_path: String,
    resource: String,
    owner: String,
) -> Result<bool, String> {
    let mut manifest = load_locks(&project_path)?;
    
    // Check if the resource is already locked by someone else
    if let Some(existing) = manifest.locks.iter().find(|l| l.resource == resource) {
        if existing.owner == owner {
            return Ok(true); // Already owned by this task
        }
        return Ok(false); // Locked by another task
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    manifest.locks.push(ResourceLock {
        schema_version: 1,
        resource,
        owner,
        timestamp: now,
    });

    save_locks(&project_path, &manifest)?;
    Ok(true)
}

#[tauri::command]
pub fn release_resource_lock(
    project_path: String,
    resource: String,
    owner: String,
) -> Result<bool, String> {
    let mut manifest = load_locks(&project_path)?;
    let initial_len = manifest.locks.len();
    
    manifest.locks.retain(|l| !(l.resource == resource && l.owner == owner));
    
    if manifest.locks.len() < initial_len {
        save_locks(&project_path, &manifest)?;
        Ok(true)
    } else {
        Ok(false) // No matching lock found
    }
}

#[tauri::command]
pub fn get_active_resource_locks(project_path: String) -> Result<Vec<ResourceLock>, String> {
    let manifest = load_locks(&project_path)?;
    Ok(manifest.locks)
}

#[tauri::command]
pub fn release_all_locks_for_owner(project_path: String, owner: String) -> Result<usize, String> {
    let mut manifest = load_locks(&project_path)?;
    let initial_len = manifest.locks.len();
    
    manifest.locks.retain(|l| l.owner != owner);
    
    let released_count = initial_len - manifest.locks.len();
    if released_count > 0 {
        save_locks(&project_path, &manifest)?;
    }
    
    Ok(released_count)
}

// ==========================================
// SQLite-Backed Legacy Locks (Coexistence)
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLockInfo {
    pub file_path: String,
    pub agent_id: String,
    pub expires_at: i64,
    pub heartbeat_at: i64,
}

pub fn acquire_team_lock(
    conn: &Connection,
    file_path: &str,
    agent_id: &str,
    ttl_seconds: i64,
) -> Result<bool, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let expires_at = now + ttl_seconds;

    let mut stmt = conn
        .prepare("SELECT agent_id, expires_at FROM resource_locks WHERE file_path = ?1")
        .map_err(|e| e.to_string())?;

    let existing: Option<(String, i64)> = stmt
        .query_row([file_path], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((existing_agent_id, existing_expires_at)) = existing {
        if now >= existing_expires_at || existing_agent_id == agent_id {
            conn.execute(
                "UPDATE resource_locks SET agent_id = ?1, expires_at = ?2, heartbeat_at = ?3 WHERE file_path = ?4",
                params![agent_id, expires_at, now, file_path],
            )
            .map_err(|e| e.to_string())?;
            Ok(true)
        } else {
            Ok(false)
        }
    } else {
        conn.execute(
            "INSERT INTO resource_locks (file_path, agent_id, expires_at, heartbeat_at) VALUES (?1, ?2, ?3, ?4)",
            params![file_path, agent_id, expires_at, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

pub fn release_team_lock(conn: &Connection, file_path: &str) -> Result<bool, String> {
    let affected = conn
        .execute("DELETE FROM resource_locks WHERE file_path = ?1", [file_path])
        .map_err(|e| e.to_string())?;
    Ok(affected > 0)
}

pub fn check_team_lock(conn: &Connection, file_path: &str) -> Result<Option<ResourceLockInfo>, String> {
    let mut stmt = conn
        .prepare("SELECT file_path, agent_id, expires_at, heartbeat_at FROM resource_locks WHERE file_path = ?1")
        .map_err(|e| e.to_string())?;

    let lock = stmt
        .query_row([file_path], |row| {
            Ok(ResourceLockInfo {
                file_path: row.get(0)?,
                agent_id: row.get(1)?,
                expires_at: row.get(2)?,
                heartbeat_at: row.get(3)?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(lock)
}

pub fn list_team_locks(conn: &Connection) -> Result<Vec<ResourceLockInfo>, String> {
    let mut stmt = conn
        .prepare("SELECT file_path, agent_id, expires_at, heartbeat_at FROM resource_locks")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ResourceLockInfo {
                file_path: row.get(0)?,
                agent_id: row.get(1)?,
                expires_at: row.get(2)?,
                heartbeat_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut locks = Vec::new();
    for r in rows {
        locks.push(r.map_err(|e| e.to_string())?);
    }
    Ok(locks)
}

pub fn cleanup_expired_locks(conn: &Connection) -> Result<usize, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let affected = conn
        .execute("DELETE FROM resource_locks WHERE expires_at <= ?1", [now])
        .map_err(|e| e.to_string())?;

    Ok(affected)
}
