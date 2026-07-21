use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EventPriority {
    High,
    Medium,
    Low,
}

impl EventPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            EventPriority::High => "high",
            EventPriority::Medium => "medium",
            EventPriority::Low => "low",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemEvent {
    pub id: String,
    pub event_type: String, // e.g. "task_assigned", "file_locked", "agent_spawned", etc.
    pub priority: String, // "high" | "medium" | "low"
    pub message: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}
