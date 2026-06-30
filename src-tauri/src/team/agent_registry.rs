use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamAgent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub status: String,
    pub capabilities: Vec<String>,
    pub execution_id: Option<String>,
    pub active_task_id: Option<String>,
}

pub fn get_agents(conn: &Connection) -> Result<Vec<TeamAgent>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, role, status, capabilities, execution_id, active_task_id FROM team_agents")
        .map_err(|e| format!("Prepare query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let caps_json: String = row.get(4)?;
            let capabilities: Vec<String> = serde_json::from_str(&caps_json).unwrap_or_default();
            Ok(TeamAgent {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                status: row.get(3)?,
                capabilities,
                execution_id: row.get(5)?,
                active_task_id: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut agents = Vec::new();
    for r in rows {
        agents.push(r.map_err(|e| e.to_string())?);
    }
    Ok(agents)
}

pub fn get_agent(conn: &Connection, id: &str) -> Result<Option<TeamAgent>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, role, status, capabilities, execution_id, active_task_id FROM team_agents WHERE id = ?1")
        .map_err(|e| format!("Prepare query failed: {}", e))?;

    let mut rows = stmt
        .query_map([id], |row| {
            let caps_json: String = row.get(4)?;
            let capabilities: Vec<String> = serde_json::from_str(&caps_json).unwrap_or_default();
            Ok(TeamAgent {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                status: row.get(3)?,
                capabilities,
                execution_id: row.get(5)?,
                active_task_id: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    if let Some(r) = rows.next() {
        Ok(Some(r.map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

pub fn update_agent_status(conn: &Connection, id: &str, status: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE team_agents SET status = ?1 WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| format!("Update agent status failed: {}", e))?;
    Ok(())
}

pub fn insert_agent(conn: &Connection, agent: &TeamAgent) -> Result<(), String> {
    let caps_json = serde_json::to_string(&agent.capabilities).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO team_agents (id, name, role, status, capabilities, execution_id, active_task_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            agent.id,
            agent.name,
            agent.role,
            agent.status,
            caps_json,
            agent.execution_id,
            agent.active_task_id
        ],
    )
    .map_err(|e| format!("Insert agent failed: {}", e))?;

    // Also ensure team_metrics has an entry for this agent if it doesn't already
    let _ = conn.execute(
        "INSERT OR IGNORE INTO team_metrics (agent_id) VALUES (?1)",
        [agent.id.clone()],
    );

    Ok(())
}

pub fn delete_agent(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM team_agents WHERE id = ?1", [id])
        .map_err(|e| format!("Delete agent failed: {}", e))?;
    Ok(())
}

pub fn set_agent_task(
    conn: &Connection,
    id: &str,
    task_id: Option<&str>,
    execution_id: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE team_agents SET active_task_id = ?1, execution_id = ?2 WHERE id = ?3",
        params![task_id, execution_id, id],
    )
    .map_err(|e| format!("Set agent task failed: {}", e))?;
    Ok(())
}
