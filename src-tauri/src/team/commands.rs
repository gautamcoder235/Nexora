use tauri::{AppHandle, Manager, State};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::swarm_db::DbState;
use crate::team::agent_registry::{self, TeamAgent};
use crate::team::agent_metrics::{self, AgentMetrics};
use crate::team::messages::{self, TeamMessage};
use crate::team::locks;
use crate::team::task_distributor::{self, TeamTask};
use crate::team::team_engine;

#[derive(Serialize, Deserialize)]
pub struct TeamNode {
    pub id: String,
    pub label: String,
    pub role: String,
    pub status: String,
    pub active_task_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct TeamEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: String,
}

fn get_active_project_dir(conn: &Connection) -> String {
    let stmt = conn.prepare("SELECT root_path FROM repositories ORDER BY last_opened_at DESC LIMIT 1").ok();
    if let Some(mut s) = stmt {
        if let Some(path) = s.query_row([], |row| row.get::<_, String>(0)).ok() {
            return path;
        }
    }
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string())
}

#[tauri::command]
pub fn pause_agent(app_handle: AppHandle, agent_id: String) -> Result<(), String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    agent_registry::update_agent_status(conn, &agent_id, "paused")?;
    let _ = messages::log_system_message(
        conn,
        "coord",
        Some(&agent_id),
        None,
        "directive",
        "Agent execution has been paused.",
    );
    Ok(())
}

#[tauri::command]
pub fn resume_agent(app_handle: AppHandle, agent_id: String) -> Result<(), String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    let agent = agent_registry::get_agent(conn, &agent_id)?
        .ok_or_else(|| format!("Agent {} not found", agent_id))?;

    let new_status = if agent.active_task_id.is_some() {
        "busy"
    } else {
        "idle"
    };

    agent_registry::update_agent_status(conn, &agent_id, new_status)?;
    let _ = messages::log_system_message(
        conn,
        "coord",
        Some(&agent_id),
        None,
        "directive",
        "Agent execution has been resumed.",
    );
    Ok(())
}

#[tauri::command]
pub fn kill_agent(app_handle: AppHandle, agent_id: String) -> Result<(), String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    agent_registry::update_agent_status(conn, &agent_id, "offline")?;
    agent_registry::set_agent_task(conn, &agent_id, None, None)?;

    let _ = messages::log_system_message(
        conn,
        "coord",
        Some(&agent_id),
        None,
        "warning",
        "Agent execution has been terminated.",
    );
    Ok(())
}

#[tauri::command]
pub fn reassign_task(
    app_handle: AppHandle,
    task_id: String,
    new_assignee_id: Option<String>,
) -> Result<(), String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    let task = task_distributor::get_task(conn, &task_id)?
        .ok_or_else(|| format!("Task {} not found", task_id))?;

    // Reset status of old assignee if it exists
    if let Some(ref old_assignee) = task.assignee_id {
        agent_registry::set_agent_task(conn, old_assignee, None, None)?;
        agent_registry::update_agent_status(conn, old_assignee, "idle")?;
    }

    // Assign new agent
    task_distributor::assign_task(conn, &task_id, new_assignee_id.as_deref())?;

    if let Some(ref new_assignee) = new_assignee_id {
        agent_registry::set_agent_task(conn, new_assignee, Some(&task_id), Some(&task.execution_id))?;
        agent_registry::update_agent_status(conn, new_assignee, "busy")?;

        let _ = messages::log_system_message(
            conn,
            "coord",
            Some(new_assignee),
            Some(&task_id),
            "directive",
            &format!("Task '{}' has been reassigned to you. Please start work.", task.title),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn force_validation(app_handle: AppHandle, execution_id: String) -> Result<bool, String> {
    let (project_dir, task_id, task_exists) = {
        let db: State<DbState> = app_handle.state();
        let guard = db.0.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("Database not initialized")?;

        let project_dir = get_active_project_dir(conn);

        let mut task_id = execution_id.clone();
        let stmt = conn.prepare("SELECT id FROM team_tasks WHERE execution_id = ?1 OR id = ?1").ok();
        if let Some(mut s) = stmt {
            if let Some(id) = s.query_row([&execution_id], |row| row.get::<_, String>(0)).ok() {
                task_id = id;
            }
        }

        let task_path = crate::team::task_types::get_task_dir(&project_dir, &task_id);
        (project_dir, task_id, task_path.exists())
    };

    if task_exists {
        crate::team::validation_engine::run_task_validation(&app_handle, &project_dir, &task_id)
    } else {
        let db: State<DbState> = app_handle.state();
        let guard = db.0.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("Database not initialized")?;
        team_engine::force_task_validation(conn, &execution_id, &project_dir)
    }
}

#[tauri::command]
pub fn force_review(
    app_handle: AppHandle,
    execution_id: String,
    approve: Option<bool>,
    reviewer_id: Option<String>,
    comment: Option<String>,
) -> Result<(), String> {
    let approve_val = approve.unwrap_or(true);
    let reviewer_id_val = reviewer_id.unwrap_or_else(|| "rev".to_string());
    let comment_val = comment.unwrap_or_else(|| "Forced code review approval.".to_string());

    let (project_dir, task_id, task_exists) = {
        let db: State<DbState> = app_handle.state();
        let guard = db.0.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("Database not initialized")?;

        let project_dir = get_active_project_dir(conn);

        let mut task_id = execution_id.clone();
        let stmt = conn.prepare("SELECT id FROM team_tasks WHERE execution_id = ?1 OR id = ?1").ok();
        if let Some(mut s) = stmt {
            if let Some(id) = s.query_row([&execution_id], |row| row.get::<_, String>(0)).ok() {
                task_id = id;
            }
        }

        let task_path = crate::team::task_types::get_task_dir(&project_dir, &task_id);
        (project_dir, task_id, task_path.exists())
    };

    if task_exists {
        crate::team::review_engine::run_task_review(
            &app_handle,
            &project_dir,
            &task_id,
            approve_val,
            &reviewer_id_val,
            &comment_val,
        )
    } else {
        let db: State<DbState> = app_handle.state();
        let guard = db.0.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("Database not initialized")?;
        team_engine::force_task_review(
            conn,
            &execution_id,
            approve_val,
            &reviewer_id_val,
            &comment_val,
        )
    }
}

#[tauri::command]
pub fn rollback_task(
    app_handle: AppHandle,
    execution_id: String,
    checkpoint_name: Option<String>,
) -> Result<(), String> {
    let checkpoint_name_val = checkpoint_name.unwrap_or_else(|| "before_validation".to_string());

    let (project_dir, task_id, task_exists) = {
        let db: State<DbState> = app_handle.state();
        let guard = db.0.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("Database not initialized")?;

        let project_dir = get_active_project_dir(conn);

        let mut task_id = execution_id.clone();
        let stmt = conn.prepare("SELECT id FROM team_tasks WHERE execution_id = ?1 OR id = ?1").ok();
        if let Some(mut s) = stmt {
            if let Some(id) = s.query_row([&execution_id], |row| row.get::<_, String>(0)).ok() {
                task_id = id;
            }
        }

        let task_path = crate::team::task_types::get_task_dir(&project_dir, &task_id);
        (project_dir, task_id, task_path.exists())
    };

    if task_exists {
        crate::team::checkpoint_manager::restore_task_checkpoint(&project_dir, &task_id, &checkpoint_name_val)
    } else {
        let db: State<DbState> = app_handle.state();
        let guard = db.0.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("Database not initialized")?;
        team_engine::rollback_task_checkpoint(conn, &execution_id, &project_dir)
    }
}

#[tauri::command]
pub fn release_team_lock(app_handle: AppHandle, file_path: String) -> Result<(), String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    locks::release_team_lock(conn, &file_path)?;
    Ok(())
}

#[tauri::command]
pub fn spawn_agent(
    app_handle: AppHandle,
    agent_id: String,
    role: String,
    capabilities: Vec<String>,
) -> Result<(), String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    let name = format!("Spawned {}", role);
    let agent = TeamAgent {
        id: agent_id,
        name,
        role,
        status: "idle".to_string(),
        capabilities,
        execution_id: None,
        active_task_id: None,
    };

    agent_registry::insert_agent(conn, &agent)?;
    Ok(())
}

#[tauri::command]
pub fn send_directive(
    app_handle: AppHandle,
    execution_id: String,
    content: String,
) -> Result<(), String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    let tasks = task_distributor::get_tasks(conn)?;
    let task = tasks.iter().find(|t| t.execution_id == execution_id)
        .ok_or_else(|| format!("Task with execution_id {} not found", execution_id))?;

    let assignee = task.assignee_id.as_deref().unwrap_or("be");

    let _ = messages::log_system_message(
        conn,
        "coord",
        Some(assignee),
        Some(&task.id),
        "directive",
        &content,
    );

    // Step team engine to see if task distribution / status checks should be run
    let project_dir = get_active_project_dir(conn);
    let _ = team_engine::step_team_engine(conn, &project_dir);

    Ok(())
}

#[tauri::command]
pub fn get_team_nodes(app_handle: AppHandle) -> Result<Vec<TeamNode>, String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    let agents = agent_registry::get_agents(conn)?;
    let nodes = agents
        .into_iter()
        .map(|agent| TeamNode {
            id: agent.id,
            label: agent.name,
            role: agent.role,
            status: agent.status,
            active_task_id: agent.active_task_id,
        })
        .collect();

    Ok(nodes)
}

#[tauri::command]
pub fn get_team_edges(app_handle: AppHandle) -> Result<Vec<TeamEdge>, String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    let agents = agent_registry::get_agents(conn)?;
    let tasks = task_distributor::get_tasks(conn)?;

    let mut edges = Vec::new();
    let mut edge_counter = 1;

    for agent in &agents {
        // Coordinator link to other agents
        if agent.role != "coordinator" {
            edges.push(TeamEdge {
                id: format!("edge-coord-{}", agent.id),
                source: "coord".to_string(),
                target: agent.id.clone(),
                label: "orchestrates".to_string(),
            });
        }

        // Active task link
        if let Some(ref task_id) = agent.active_task_id {
            edges.push(TeamEdge {
                id: format!("edge-task-assign-{}", edge_counter),
                source: agent.id.clone(),
                target: task_id.clone(),
                label: "assigned".to_string(),
            });
            edge_counter += 1;
        }
    }

    // Task dependency links
    for task in &tasks {
        for dep_id in &task.dependencies {
            edges.push(TeamEdge {
                id: format!("edge-task-dep-{}", edge_counter),
                source: dep_id.clone(),
                target: task.id.clone(),
                label: "depends".to_string(),
            });
            edge_counter += 1;
        }
    }

    Ok(edges)
}

#[tauri::command]
pub fn get_team_tasks(app_handle: AppHandle) -> Result<Vec<TeamTask>, String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    task_distributor::get_tasks(conn)
}

#[tauri::command]
pub fn get_team_messages(app_handle: AppHandle) -> Result<Vec<TeamMessage>, String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    messages::get_messages(conn)
}

#[tauri::command]
pub fn get_agent_metrics(app_handle: AppHandle, agent_id: String) -> Result<AgentMetrics, String> {
    let db: State<DbState> = app_handle.state();
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;

    agent_metrics::get_metrics(conn, &agent_id)
}
