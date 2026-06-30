use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMessage {
    pub id: String,
    pub from_agent_id: String,
    pub to_agent_id: Option<String>,
    pub task_id: Option<String>,
    pub message_type: String,
    pub content: String,
    pub timestamp: i64,
}

pub fn get_messages(conn: &Connection) -> Result<Vec<TeamMessage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, from_agent_id, to_agent_id, task_id, message_type, content, timestamp 
             FROM team_messages ORDER BY timestamp ASC",
        )
        .map_err(|e| format!("Prepare query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TeamMessage {
                id: row.get(0)?,
                from_agent_id: row.get(1)?,
                to_agent_id: row.get(2)?,
                task_id: row.get(3)?,
                message_type: row.get(4)?,
                content: row.get(5)?,
                timestamp: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut messages = Vec::new();
    for r in rows {
        messages.push(r.map_err(|e| e.to_string())?);
    }
    Ok(messages)
}

pub fn get_messages_for_task(conn: &Connection, task_id: &str) -> Result<Vec<TeamMessage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, from_agent_id, to_agent_id, task_id, message_type, content, timestamp 
             FROM team_messages WHERE task_id = ?1 ORDER BY timestamp ASC",
        )
        .map_err(|e| format!("Prepare query failed: {}", e))?;

    let rows = stmt
        .query_map([task_id], |row| {
            Ok(TeamMessage {
                id: row.get(0)?,
                from_agent_id: row.get(1)?,
                to_agent_id: row.get(2)?,
                task_id: row.get(3)?,
                message_type: row.get(4)?,
                content: row.get(5)?,
                timestamp: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut messages = Vec::new();
    for r in rows {
        messages.push(r.map_err(|e| e.to_string())?);
    }
    Ok(messages)
}

pub fn insert_message(conn: &Connection, msg: &TeamMessage) -> Result<(), String> {
    conn.execute(
        "INSERT INTO team_messages (id, from_agent_id, to_agent_id, task_id, message_type, content, timestamp) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            msg.id,
            msg.from_agent_id,
            msg.to_agent_id,
            msg.task_id,
            msg.message_type,
            msg.content,
            msg.timestamp
        ],
    )
    .map_err(|e| format!("Insert message failed: {}", e))?;

    // Increment metrics
    let _ = crate::team::agent_metrics::increment_messages_sent(conn, &msg.from_agent_id);
    if let Some(ref to_id) = msg.to_agent_id {
        let _ = crate::team::agent_metrics::increment_messages_received(conn, to_id);
    }

    Ok(())
}

use std::sync::atomic::{AtomicUsize, Ordering};

static MSG_COUNTER: AtomicUsize = AtomicUsize::new(1);

pub fn log_system_message(
    conn: &Connection,
    from: &str,
    to: Option<&str>,
    task_id: Option<&str>,
    msg_type: &str,
    content: &str,
) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let counter = MSG_COUNTER.fetch_add(1, Ordering::Relaxed);
    let id = format!("msg-{}-{}", now, counter);

    let msg = TeamMessage {
        id,
        from_agent_id: from.to_string(),
        to_agent_id: to.map(|s| s.to_string()),
        task_id: task_id.map(|s| s.to_string()),
        message_type: msg_type.to_string(),
        content: content.to_string(),
        timestamp: now,
    };

    insert_message(conn, &msg)
}
