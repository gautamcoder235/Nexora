use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::swarm_db::DbState;

#[derive(Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub command: String,
    pub version: Option<String>,
    pub enabled: bool,
    pub capabilities: Vec<String>,
}

#[tauri::command]
pub fn get_all_agents(app_handle: AppHandle) -> Result<Vec<Agent>, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state
        .0
        .lock()
        .map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT id, name, command, version, enabled FROM agents")
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let agent_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, bool>(4)?,
            ))
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut agents = Vec::new();
    for row_res in agent_rows {
        let (id, name, command, version, enabled) = row_res.map_err(|e| e.to_string())?;

        let mut cap_stmt = conn
            .prepare("SELECT capability FROM agent_capabilities WHERE agent_id = ?1")
            .map_err(|e| e.to_string())?;
        let caps = cap_stmt
            .query_map([&id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;

        let mut capabilities = Vec::new();
        for cap in caps {
            capabilities.push(cap.map_err(|e| e.to_string())?);
        }

        agents.push(Agent {
            id,
            name,
            command,
            version,
            enabled,
            capabilities,
        });
    }

    Ok(agents)
}

#[tauri::command]
pub fn register_agent(
    app_handle: AppHandle,
    id: String,
    name: String,
    command: String,
    version: Option<String>,
    capabilities: Vec<String>,
) -> Result<bool, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state
        .0
        .lock()
        .map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "INSERT OR REPLACE INTO agents (id, name, command, version, enabled) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, name, command, version, true],
    ).map_err(|e| format!("Insert agent failed: {}", e))?;

    // Clear old capabilities if updating
    conn.execute("DELETE FROM agent_capabilities WHERE agent_id = ?1", [&id])
        .map_err(|e| format!("Clear caps failed: {}", e))?;

    for cap in capabilities {
        conn.execute(
            "INSERT INTO agent_capabilities (agent_id, capability) VALUES (?1, ?2)",
            [&id, &cap],
        )
        .map_err(|e| format!("Insert cap failed: {}", e))?;
    }

    Ok(true)
}

#[tauri::command]
pub fn update_agent_status(
    app_handle: AppHandle,
    id: String,
    enabled: bool,
) -> Result<bool, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state
        .0
        .lock()
        .map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "UPDATE agents SET enabled = ?1 WHERE id = ?2",
        rusqlite::params![enabled, id],
    )
    .map_err(|e| format!("Update agent failed: {}", e))?;

    Ok(true)
}
