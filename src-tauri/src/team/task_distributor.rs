use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use crate::team::agent_registry::{get_agents, set_agent_task, update_agent_status};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamTask {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub assignee_id: Option<String>,
    pub state: String, // backlog, planning, assigned, running, review, validation, blocked, quarantined, done
    pub priority: String, // low, medium, high, urgent
    pub dependencies: Vec<String>, // JSON array of task IDs
    pub attempts: i32,
    pub execution_id: String,
}

pub fn get_tasks(conn: &Connection) -> Result<Vec<TeamTask>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, description, assignee_id, state, priority, dependencies, attempts, execution_id FROM team_tasks")
        .map_err(|e| format!("Prepare query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let deps_json: String = row.get(6)?;
            let dependencies: Vec<String> = serde_json::from_str(&deps_json).unwrap_or_default();
            Ok(TeamTask {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                assignee_id: row.get(3)?,
                state: row.get(4)?,
                priority: row.get(5)?,
                dependencies,
                attempts: row.get(7)?,
                execution_id: row.get(8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    let mut tasks = Vec::new();
    for r in rows {
        tasks.push(r.map_err(|e| e.to_string())?);
    }
    Ok(tasks)
}

pub fn get_task(conn: &Connection, id: &str) -> Result<Option<TeamTask>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, description, assignee_id, state, priority, dependencies, attempts, execution_id FROM team_tasks WHERE id = ?1")
        .map_err(|e| format!("Prepare query failed: {}", e))?;

    let mut rows = stmt
        .query_map([id], |row| {
            let deps_json: String = row.get(6)?;
            let dependencies: Vec<String> = serde_json::from_str(&deps_json).unwrap_or_default();
            Ok(TeamTask {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                assignee_id: row.get(3)?,
                state: row.get(4)?,
                priority: row.get(5)?,
                dependencies,
                attempts: row.get(7)?,
                execution_id: row.get(8)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    if let Some(r) = rows.next() {
        Ok(Some(r.map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

pub fn insert_task(conn: &Connection, task: &TeamTask) -> Result<(), String> {
    let deps_json = serde_json::to_string(&task.dependencies).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO team_tasks (id, title, description, assignee_id, state, priority, dependencies, attempts, execution_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            task.id,
            task.title,
            task.description,
            task.assignee_id,
            task.state,
            task.priority,
            deps_json,
            task.attempts,
            task.execution_id
        ],
    )
    .map_err(|e| format!("Insert task failed: {}", e))?;
    Ok(())
}

pub fn update_task_state(conn: &Connection, id: &str, state: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE team_tasks SET state = ?1 WHERE id = ?2",
        params![state, id],
    )
    .map_err(|e| format!("Update task state failed: {}", e))?;
    Ok(())
}

pub fn assign_task(
    conn: &Connection,
    task_id: &str,
    assignee_id: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE team_tasks SET assignee_id = ?1 WHERE id = ?2",
        params![assignee_id, task_id],
    )
    .map_err(|e| format!("Assign task failed: {}", e))?;
    Ok(())
}

pub fn get_assignable_tasks(conn: &Connection) -> Result<Vec<TeamTask>, String> {
    let all_tasks = get_tasks(conn)?;
    let mut assignable = Vec::new();

    for task in &all_tasks {
        if task.state == "backlog" || task.state == "planning" {
            // Check if all dependencies are "done"
            let mut deps_satisfied = true;
            for dep_id in &task.dependencies {
                let dep_task = all_tasks.iter().find(|t| &t.id == dep_id);
                match dep_task {
                    Some(dt) => {
                        if dt.state != "done" {
                            deps_satisfied = false;
                            break;
                        }
                    }
                    None => {
                        // Dependency is missing? Skip check or treat as unsatisfied
                        deps_satisfied = false;
                        break;
                    }
                }
            }

            if deps_satisfied {
                assignable.push(task.clone());
            }
        }
    }

    // Sort by priority (urgent > high > medium > low)
    assignable.sort_by_key(|t| match t.priority.as_str() {
        "urgent" => 0,
        "high" => 1,
        "medium" => 2,
        "low" => 3,
        _ => 4,
    });

    Ok(assignable)
}

pub fn distribute_tasks(conn: &Connection) -> Result<usize, String> {
    let assignable = get_assignable_tasks(conn)?;
    let agents = get_agents(conn)?;

    let mut assignments_count = 0;

    for task in assignable {
        // Find an idle agent whose capabilities or role match the task requirements
        // Simple mapping: Coordinator coordinates planning/orchestration.
        // Frontend Engineer handles React/UI tasks.
        // Backend Engineer handles Rust/API.
        // QA Engineer handles validation/tests.
        // Reviewer handles review.
        let matching_agent = agents.iter().find(|agent| {
            if agent.status != "idle" && agent.status != "offline" {
                return false;
            }

            // Match based on task type keywords in title/description or simple heuristic
            let title_lower = task.title.to_lowercase();
            let desc_lower = task.description.as_ref().map(|d| d.to_lowercase()).unwrap_or_default();

            let is_match = match agent.role.as_str() {
                "coordinator" => title_lower.contains("coord") || title_lower.contains("plan") || desc_lower.contains("orchestrate"),
                "reviewer" => title_lower.contains("review") || desc_lower.contains("approve"),
                "validation" => title_lower.contains("test") || title_lower.contains("qa") || title_lower.contains("validate"),
                "agent" => {
                    // Match capabilities
                    if agent.id == "fe" && (title_lower.contains("front") || title_lower.contains("ui") || title_lower.contains("css") || title_lower.contains("ts")) {
                        true
                    } else if agent.id == "be" && (title_lower.contains("back") || title_lower.contains("api") || title_lower.contains("rust") || title_lower.contains("go")) {
                        true
                    } else if agent.id == "db" && (title_lower.contains("database") || title_lower.contains("sql") || title_lower.contains("schema")) {
                        true
                    } else {
                        // General agent matches if no other specific matches
                        agent.id != "fe" && agent.id != "be" && agent.id != "db"
                    }
                }
                _ => false,
            };

            is_match
        });

        if let Some(agent) = matching_agent {
            // Assign task to this agent
            assign_task(conn, &task.id, Some(&agent.id))?;
            update_task_state(conn, &task.id, "assigned")?;
            update_agent_status(conn, &agent.id, "busy")?;
            set_agent_task(conn, &agent.id, Some(&task.id), Some(&task.execution_id))?;

            // Log a message
            let _ = crate::team::messages::log_system_message(
                conn,
                "coord",
                Some(&agent.id),
                Some(&task.id),
                "directive",
                &format!("Task '{}' has been assigned to you. Please start execution.", task.title),
            );

            assignments_count += 1;
        }
    }

    Ok(assignments_count)
}
