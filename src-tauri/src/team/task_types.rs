use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskState {
    Queued,
    Ready,
    Executing,
    Validating,
    Reviewing,
    WaitingHuman,
    Completed,
    Failed,
    Blocked,
    Staled,
    Cancelled,
}

impl TaskState {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskState::Queued => "QUEUED",
            TaskState::Ready => "READY",
            TaskState::Executing => "EXECUTING",
            TaskState::Validating => "VALIDATING",
            TaskState::Reviewing => "REVIEWING",
            TaskState::WaitingHuman => "WAITING_HUMAN",
            TaskState::Completed => "COMPLETED",
            TaskState::Failed => "FAILED",
            TaskState::Blocked => "BLOCKED",
            TaskState::Staled => "STALED",
            TaskState::Cancelled => "CANCELLED",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkerSpec {
    pub runtime: String, // "aider" | "claude_code" | "antigravity"
    pub model: String,
    pub temperature: f32,
    pub max_cost_usd: f64,
    pub max_runtime_sec: u64,
    pub retry_limit: u32,
}

impl Default for WorkerSpec {
    fn default() -> Self {
        WorkerSpec {
            runtime: "aider".to_string(),
            model: "claude-3-5-sonnet".to_string(),
            temperature: 0.1,
            max_cost_usd: 0.50,
            max_runtime_sec: 900,
            retry_limit: 3,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskSpec {
    pub schema_version: u32,
    pub task_id: String,
    pub title: String,
    pub description: String,
    pub dependencies: Vec<String>,
    pub priority: String, // "critical" | "high" | "normal" | "low" | "background"
    pub worker: WorkerSpec,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskStateMetadata {
    pub schema_version: u32,
    pub id: String,
    pub status: String, // matching TaskState string representation
    pub created_at: i64,
    pub updated_at: i64,
    pub dependencies: Vec<String>,
    pub artifact_outputs: Vec<String>,
    pub attempts: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct VerificationResult {
    pub schema_version: u32,
    pub passed: bool,
    pub tests_total: u32,
    pub tests_failed: u32,
    pub output_summary: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ArtifactsManifest {
    pub schema_version: u32,
    pub artifacts: Vec<String>,
}

pub fn get_task_dir(project_path: &str, task_id: &str) -> PathBuf {
    Path::new(project_path).join(".nexora").join("tasks").join(task_id)
}

pub fn initialize_task_structure(project_path: &str, spec: &TaskSpec) -> Result<(), String> {
    let task_dir = get_task_dir(project_path, &spec.task_id);
    
    // Create folders
    fs::create_dir_all(&task_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(task_dir.join("logs")).map_err(|e| e.to_string())?;
    fs::create_dir_all(task_dir.join("metadata")).map_err(|e| e.to_string())?;

    // Write spec.json
    let spec_path = task_dir.join("spec.json");
    let spec_json = serde_json::to_string_pretty(spec).map_err(|e| e.to_string())?;
    fs::write(spec_path, spec_json).map_err(|e| e.to_string())?;

    // Write state.json
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    let initial_state = TaskStateMetadata {
        schema_version: 1,
        id: spec.task_id.clone(),
        status: "QUEUED".to_string(),
        created_at: now,
        updated_at: now,
        dependencies: spec.dependencies.clone(),
        artifact_outputs: vec![],
        attempts: 0,
    };
    let state_path = task_dir.join("state.json");
    let state_json = serde_json::to_string_pretty(&initial_state).map_err(|e| e.to_string())?;
    fs::write(state_path, state_json).map_err(|e| e.to_string())?;

    // Write empty files for patch, verification, and artifacts manifests
    fs::write(task_dir.join("workspace.patch"), "").map_err(|e| e.to_string())?;
    
    let verification_json = serde_json::to_string_pretty(&VerificationResult {
        schema_version: 1,
        passed: false,
        tests_total: 0,
        tests_failed: 0,
        output_summary: "No verification run yet".to_string(),
    }).unwrap();
    fs::write(task_dir.join("verification.json"), verification_json).map_err(|e| e.to_string())?;

    let artifacts_json = serde_json::to_string_pretty(&ArtifactsManifest {
        schema_version: 1,
        artifacts: vec![],
    }).unwrap();
    fs::write(task_dir.join("artifacts.json"), artifacts_json).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn read_task_state(project_path: &str, task_id: &str) -> Result<TaskStateMetadata, String> {
    let state_path = get_task_dir(project_path, task_id).join("state.json");
    if !state_path.exists() {
        return Err(format!("Task state not found: {}", task_id));
    }
    let content = fs::read_to_string(state_path).map_err(|e| e.to_string())?;
    let state: TaskStateMetadata = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(state)
}

pub fn update_task_state(project_path: &str, task_id: &str, new_state: TaskState) -> Result<(), String> {
    let task_dir = get_task_dir(project_path, task_id);
    let mut state = read_task_state(project_path, task_id)?;
    
    state.status = new_state.as_str().to_string();
    state.updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    let state_json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(task_dir.join("state.json"), state_json).map_err(|e| e.to_string())?;
    Ok(())
}
