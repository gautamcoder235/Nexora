use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentRole {
    Coordinator,
    Builder,
    Scout,
    Reviewer,
}

impl AgentRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentRole::Coordinator => "coordinator",
            AgentRole::Builder => "builder",
            AgentRole::Scout => "scout",
            AgentRole::Reviewer => "reviewer",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "coordinator" => AgentRole::Coordinator,
            "scout" => AgentRole::Scout,
            "reviewer" => AgentRole::Reviewer,
            _ => AgentRole::Builder,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgentProfile {
    pub id: String,
    pub name: String,
    pub role: AgentRole,
    pub preferred_model: String,
    pub success_rate: f64,
    pub tasks_completed: u32,
    pub tasks_failed: u32,
    pub avg_completion_time_sec: f64,
    pub known_mistakes: Vec<String>,
    pub languages: Vec<String>,
    pub expertise: Vec<String>,
    pub preferences: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgentRuntime {
    pub id: String,
    pub status: String, // "idle" | "running" | "paused" | "error" | "offline"
    pub active_task_id: Option<String>,
    pub current_task_description: Option<String>,
    pub locked_files: Vec<String>,
    pub cli_command: Option<String>,
    pub prompt_context: Vec<String>,
    pub connected_terminal_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgentHealth {
    pub cpu_usage: f32,
    pub memory_bytes: u64,
    pub last_heartbeat: u64,
    pub response_latency_ms: u32,
    pub status_details: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgentCapabilities {
    pub agent_id: String,
    pub capabilities: Vec<String>, // e.g. ["Rust", "React", "SQLite", "Testing"]
}

// Struct matching frontend's expectations for JSON IPC exchange
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeamNode {
    pub id: String,
    pub label: String,
    pub role: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_task_description: Option<String>,
    pub locked_files: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cli_command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_context: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connected_terminal_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeamEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub message_count: u32,
    pub review_requests: u32,
    pub task_transfers: u32,
    pub is_active: bool,
}
