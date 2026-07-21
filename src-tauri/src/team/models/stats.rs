use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatistics {
    pub agent_id: String,
    pub success_rate: f64,
    pub tasks_completed: u32,
    pub tasks_failed: u32,
    pub average_completion_time_sec: f64,
    pub total_tokens_used: u64,
    pub total_commands_executed: u32,
    pub total_files_modified: u32,
    pub active_runtime_ms: u64,
}
