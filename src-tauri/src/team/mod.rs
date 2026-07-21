pub mod models;
pub mod database;
pub mod runtime;
pub mod services;

use std::sync::OnceLock;
use tauri::{command, AppHandle};
use tokio::sync::oneshot;
use serde_json::json;

use crate::team::runtime::{TeamRuntime, TeamCommand};
use crate::team::models::*;
use crate::team::services::TemplateService;

static TEAM_RUNTIME: OnceLock<TeamRuntime> = OnceLock::new();

pub fn initialize_team_runtime(app_handle: AppHandle) {
    let runtime = TeamRuntime::new(Some(app_handle));
    if let Err(_) = TEAM_RUNTIME.set(runtime) {
        println!("[Team] Swarm Runtime was already initialized.");
    }
}

pub fn get_runtime() -> Result<&'static TeamRuntime, String> {
    TEAM_RUNTIME.get().ok_or_else(|| "Team Swarm Runtime not initialized yet".to_string())
}

#[command]
pub async fn get_team_nodes() -> Result<Vec<TeamNode>, String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::GetState { responder: tx }).await
        .map_err(|e| e.to_string())?;
    let state = rx.await.map_err(|e| e.to_string())?;
    Ok(state.nodes)
}

#[command]
pub async fn get_team_edges() -> Result<Vec<TeamEdge>, String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::GetState { responder: tx }).await
        .map_err(|e| e.to_string())?;
    let state = rx.await.map_err(|e| e.to_string())?;
    Ok(state.edges)
}

#[command]
pub async fn get_team_tasks() -> Result<Vec<KanbanTask>, String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::GetState { responder: tx }).await
        .map_err(|e| e.to_string())?;
    let state = rx.await.map_err(|e| e.to_string())?;
    Ok(state.tasks)
}

#[command]
pub async fn get_team_messages() -> Result<Vec<TeamMessage>, String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::GetState { responder: tx }).await
        .map_err(|e| e.to_string())?;
    let state = rx.await.map_err(|e| e.to_string())?;
    Ok(state.messages)
}

#[command]
pub async fn send_directive(agent_id: Option<String>, content: String) -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    
    let msg = TeamMessage {
        id: format!("msg-{}", uuid::Uuid::new_v4().simple()),
        sender: "user".to_string(),
        sender_name: Some("User".to_string()),
        receiver: agent_id.clone(),
        priority: "medium".to_string(),
        message_type: "broadcast".to_string(),
        content: content.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        attachments: Vec::new(),
        block_id: None,
    };

    rt.get_tx().send(TeamCommand::PostMessage { message: msg, responder: tx }).await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())??;

    // Send planning directive triggers
    let (act_tx, act_rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::PerformAction {
        action: "SubmitDirective".to_string(),
        agent_id,
        payload: json!({ "content": content }),
        responder: act_tx,
    }).await.map_err(|e| e.to_string())?;
    
    let _ = act_rx.await.map_err(|e| e.to_string())??;
    Ok(())
}

#[command]
pub async fn pause_agent(agent_id: String) -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::PerformAction {
        action: "Pause".to_string(),
        agent_id: Some(agent_id),
        payload: serde_json::Value::Null,
        responder: tx,
    }).await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[command]
pub async fn resume_agent(agent_id: String) -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::PerformAction {
        action: "Resume".to_string(),
        agent_id: Some(agent_id),
        payload: serde_json::Value::Null,
        responder: tx,
    }).await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[command]
pub async fn kill_agent(agent_id: String) -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::PerformAction {
        action: "Kill".to_string(),
        agent_id: Some(agent_id),
        payload: serde_json::Value::Null,
        responder: tx,
    }).await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[command]
pub async fn force_validation(execution_id: String) -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::PerformAction {
        action: "Validate".to_string(),
        agent_id: None,
        payload: json!({ "executionId": execution_id }),
        responder: tx,
    }).await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[command]
pub async fn force_review(execution_id: String) -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::PerformAction {
        action: "Review".to_string(),
        agent_id: None,
        payload: json!({ "executionId": execution_id }),
        responder: tx,
    }).await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[command]
pub async fn rollback_task(execution_id: String) -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::PerformAction {
        action: "Rollback".to_string(),
        agent_id: None,
        payload: json!({ "executionId": execution_id }),
        responder: tx,
    }).await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[command]
pub async fn perform_team_action(action_type: String, payload: serde_json::Value) -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    let agent_id = payload.get("agentId")
        .or_else(|| payload.get("agent_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    
    rt.get_tx().send(TeamCommand::PerformAction {
        action: action_type,
        agent_id,
        payload,
        responder: tx,
    }).await.map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[command]
pub async fn initialize_default_templates(project_path: String) -> Result<(), String> {
    TemplateService::new().initialize_default_templates(&project_path)
}

#[command]
pub async fn get_templates(project_path: String) -> Result<Vec<crate::team::services::template_service::SwarmTemplate>, String> {
    TemplateService::new().get_templates(&project_path)
}

#[command]
pub async fn expand_template(project_path: String, template_id: String, prefix: String) -> Result<Vec<String>, String> {
    TemplateService::new().expand_template(&project_path, &template_id, &prefix)
}

#[command]
pub async fn sort_and_validate_tasks(tasks: Vec<crate::team::models::task::TaskSortInput>) -> Result<Vec<String>, String> {
    let sorted = tasks;
    Ok(sorted.into_iter().map(|t| t.id).collect())
}

#[command]
pub async fn get_swarm_artifacts(_project_path: String) -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}

#[command]
pub async fn promote_swarm_artifact(_project_path: String, _artifact_id: String, _stage: String) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn add_swarm_artifact(_project_path: String, _task_id: String, _file_path: String, _stage: String) -> Result<serde_json::Value, String> {
    Ok(json!({ "status": "success" }))
}

#[command]
pub async fn index_workspace(_project_path: String) -> Result<serde_json::Value, String> {
    Ok(json!({ "status": "indexed" }))
}

#[command]
pub async fn get_symbols(_project_path: String) -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}

#[command]
pub async fn get_repo_map(_project_path: String) -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}

#[command]
pub async fn clear_all_messages() -> Result<(), String> {
    let rt = get_runtime()?;
    let (tx, rx) = oneshot::channel();
    rt.get_tx().send(TeamCommand::ClearAllMessages { responder: tx }).await
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[cfg(test)]
pub mod tests;
