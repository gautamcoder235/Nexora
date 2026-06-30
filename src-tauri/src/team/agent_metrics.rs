use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub agent_id: String,
    pub cpu: f64,
    pub memory: f64,
    pub tokens: i64,
    pub cost: f64,
    pub task_duration_secs: i64,
    pub messages_sent: i64,
    pub messages_received: i64,
    pub validation_count: i64,
    pub failure_count: i64,
}

pub fn get_metrics(conn: &Connection, agent_id: &str) -> Result<AgentMetrics, String> {
    let mut stmt = conn
        .prepare(
            "SELECT agent_id, cpu, memory, tokens, cost, task_duration_secs, 
                    messages_sent, messages_received, validation_count, failure_count 
             FROM team_metrics WHERE agent_id = ?1",
        )
        .map_err(|e| format!("Prepare query failed: {}", e))?;

    let mut rows = stmt
        .query_map([agent_id], |row| {
            Ok(AgentMetrics {
                agent_id: row.get(0)?,
                cpu: row.get(1)?,
                memory: row.get(2)?,
                tokens: row.get(3)?,
                cost: row.get(4)?,
                task_duration_secs: row.get(5)?,
                messages_sent: row.get(6)?,
                messages_received: row.get(7)?,
                validation_count: row.get(8)?,
                failure_count: row.get(9)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    if let Some(r) = rows.next() {
        Ok(r.map_err(|e| e.to_string())?)
    } else {
        // Return a default struct if not found, and insert it
        let default_metrics = AgentMetrics {
            agent_id: agent_id.to_string(),
            cpu: 0.0,
            memory: 0.0,
            tokens: 0,
            cost: 0.0,
            task_duration_secs: 0,
            messages_sent: 0,
            messages_received: 0,
            validation_count: 0,
            failure_count: 0,
        };
        let _ = update_metrics(conn, &default_metrics);
        Ok(default_metrics)
    }
}

pub fn update_metrics(conn: &Connection, metrics: &AgentMetrics) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO team_metrics (
            agent_id, cpu, memory, tokens, cost, task_duration_secs, 
            messages_sent, messages_received, validation_count, failure_count
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            metrics.agent_id,
            metrics.cpu,
            metrics.memory,
            metrics.tokens,
            metrics.cost,
            metrics.task_duration_secs,
            metrics.messages_sent,
            metrics.messages_received,
            metrics.validation_count,
            metrics.failure_count
        ],
    )
    .map_err(|e| format!("Update agent metrics failed: {}", e))?;
    Ok(())
}

pub fn increment_messages_sent(conn: &Connection, agent_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE team_metrics SET messages_sent = messages_sent + 1 WHERE agent_id = ?1",
        [agent_id],
    )
    .map_err(|e| format!("Increment messages_sent failed: {}", e))?;
    Ok(())
}

pub fn increment_messages_received(conn: &Connection, agent_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE team_metrics SET messages_received = messages_received + 1 WHERE agent_id = ?1",
        [agent_id],
    )
    .map_err(|e| format!("Increment messages_received failed: {}", e))?;
    Ok(())
}

pub fn increment_validation_count(conn: &Connection, agent_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE team_metrics SET validation_count = validation_count + 1 WHERE agent_id = ?1",
        [agent_id],
    )
    .map_err(|e| format!("Increment validation_count failed: {}", e))?;
    Ok(())
}

pub fn increment_failure_count(conn: &Connection, agent_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE team_metrics SET failure_count = failure_count + 1 WHERE agent_id = ?1",
        [agent_id],
    )
    .map_err(|e| format!("Increment failure_count failed: {}", e))?;
    Ok(())
}
