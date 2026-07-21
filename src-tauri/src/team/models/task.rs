use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskAttempt {
    pub attempt_number: u32,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
    pub status: String, // "success" | "failed"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_errors: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub file_path: String,
    pub original_content: String,
    pub new_content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KanbanTask {
    pub id: String,
    pub title: String,
    pub description: String,
    pub state: String, // "backlog" | "planning" | "assigned" | "running" | "review" | "validation" | "blocked" | "quarantined" | "done"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_agent_id: Option<String>,
    pub dependencies: Vec<String>,
    pub attempts: Vec<TaskAttempt>,
    pub created_at: String,
    pub updated_at: String,
    pub priority: String, // "low" | "medium" | "high" | "critical"
    
    // Performance & planning metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_duration: Option<u64>,
    pub priority_score: f64,
    pub retry_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_reason: Option<String>,
    pub created_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_by: Option<String>,
    pub approval_required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_task: Option<String>,
    pub child_tasks: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkpoint: Option<String>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_diffs: Option<Vec<FileDiff>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quarantine_reason: Option<String>,
    
    // Tauri/execution bridge IDs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id_camel: Option<String>,
}

// Helper struct for sorting task graph nodes (DAG)
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskSortInput {
    pub id: String,
    pub dependencies: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskGraph {
    pub nodes: Vec<KanbanTask>,
    pub edges: Vec<(String, String)>, // (source_task_id, target_task_id)
    pub critical_path: Vec<String>,
    pub estimated_cost: f64,
    pub estimated_duration: u64,
}
