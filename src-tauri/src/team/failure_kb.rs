use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailureCase {
    pub task_id: String,
    pub execution_id: String,
    pub timestamp: i64,
    pub error_message: String,
}

pub fn record_failure(
    project_dir: &str,
    task_id: &str,
    execution_id: &str,
    error_message: &str,
) -> Result<(), String> {
    let nexora_dir = Path::new(project_dir).join(".nexora");
    if !nexora_dir.exists() {
        fs::create_dir_all(&nexora_dir).map_err(|e| format!("Failed to create .nexora directory: {}", e))?;
    }

    let kb_path = nexora_dir.join("team_kb.json");
    let mut failures = get_failures(project_dir).unwrap_or_default();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    failures.push(FailureCase {
        task_id: task_id.to_string(),
        execution_id: execution_id.to_string(),
        timestamp: now,
        error_message: error_message.to_string(),
    });

    let content = serde_json::to_string_pretty(&failures)
        .map_err(|e| format!("Failed to serialize KB: {}", e))?;

    fs::write(kb_path, content).map_err(|e| format!("Failed to write KB file: {}", e))?;

    Ok(())
}

pub fn get_failures(project_dir: &str) -> Result<Vec<FailureCase>, String> {
    let kb_path = Path::new(project_dir).join(".nexora").join("team_kb.json");
    if !kb_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(kb_path).map_err(|e| format!("Failed to read KB file: {}", e))?;
    let failures: Vec<FailureCase> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse KB file: {}", e))?;

    Ok(failures)
}
