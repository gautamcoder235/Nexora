use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeamMessage {
    pub id: String,
    pub sender: String, // "user" | "agent" | "system"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receiver: Option<String>,
    pub priority: String, // "high" | "medium" | "low"
    pub message_type: String, // "task" | "question" | "warning" | "error" | "review" | "approval" | "result" | "broadcast"
    pub content: String,
    pub timestamp: String,
    pub attachments: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_id: Option<String>,
}
