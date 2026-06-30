use serde::{Deserialize, Serialize};
use crate::team::messages::TeamMessage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionTimelineEvent {
    pub timestamp: i64,
    pub event_type: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchMetadata {
    pub file_path: String,
    pub additions: usize,
    pub deletions: usize,
}

pub fn parse_patch(patch_str: &str) -> Vec<PatchMetadata> {
    let mut metadata = Vec::new();
    let mut current_file = String::new();
    let mut additions = 0;
    let mut deletions = 0;

    for line in patch_str.lines() {
        if line.starts_with("diff --git ") {
            if !current_file.is_empty() {
                metadata.push(PatchMetadata {
                    file_path: current_file.clone(),
                    additions,
                    deletions,
                });
            }
            // Parse file name. Example line: diff --git a/src/main.rs b/src/main.rs
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let path = parts[3];
                // strip b/ prefix
                current_file = if path.starts_with("b/") {
                    path[2..].to_string()
                } else {
                    path.to_string()
                };
            }
            additions = 0;
            deletions = 0;
        } else if line.starts_with("+++ ") {
            // skip header line
        } else if line.starts_with("--- ") {
            // skip header line
        } else if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }

    if !current_file.is_empty() {
        metadata.push(PatchMetadata {
            file_path: current_file,
            additions,
            deletions,
        });
    }

    metadata
}

pub fn get_timeline(messages: &[TeamMessage]) -> Vec<ExecutionTimelineEvent> {
    messages
        .iter()
        .map(|msg| {
            let description = match msg.message_type.as_str() {
                "directive" => format!("Directive sent by {}: {}", msg.from_agent_id, msg.content),
                "review" => format!("Review submitted by {}: {}", msg.from_agent_id, msg.content),
                "validation" => format!("Validation update from {}: {}", msg.from_agent_id, msg.content),
                "warning" => format!("Warning issued by {}: {}", msg.from_agent_id, msg.content),
                _ => format!("Message from {} to {:?}: {}", msg.from_agent_id, msg.to_agent_id, msg.content),
            };

            ExecutionTimelineEvent {
                timestamp: msg.timestamp,
                event_type: msg.message_type.clone(),
                description,
            }
        })
        .collect()
}

pub fn parse_logs(log_str: &str) -> Vec<String> {
    log_str
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.to_string())
        .collect()
}

// ==========================================
// Artifact Registry & Promotion Engine
// ==========================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SwarmArtifact {
    pub schema_version: u32,
    pub id: String,
    pub file_path: String,
    pub content_hash: String,
    pub task_id: String,
    pub stage: String, // "draft" | "validated" | "reviewed" | "approved" | "merged" | "archived"
    pub size_bytes: u64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistryManifest {
    pub schema_version: u32,
    pub artifacts: Vec<SwarmArtifact>,
}

use std::collections::hash_map::DefaultHasher;
use std::hash::Hasher;

pub fn compute_hash(content: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    hasher.write(content);
    format!("{:x}", hasher.finish())
}

pub fn get_registry_path(project_path: &str) -> std::path::PathBuf {
    std::path::Path::new(project_path).join(".nexora").join("artifacts").join("registry.json")
}

pub fn load_registry(project_path: &str) -> Result<RegistryManifest, String> {
    let path = get_registry_path(project_path);
    if !path.exists() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let manifest = RegistryManifest {
            schema_version: 1,
            artifacts: vec![],
        };
        save_registry(project_path, &manifest)?;
        return Ok(manifest);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let manifest: RegistryManifest = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(manifest)
}

pub fn save_registry(project_path: &str, manifest: &RegistryManifest) -> Result<(), String> {
    let path = get_registry_path(project_path);
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn register_artifact(
    project_path: &str,
    task_id: &str,
    file_path: &str,
    stage: &str,
) -> Result<SwarmArtifact, String> {
    let repo_file = std::path::Path::new(project_path).join(file_path);
    if !repo_file.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    
    let content = std::fs::read(repo_file).map_err(|e| e.to_string())?;
    let size_bytes = content.len() as u64;
    let content_hash = compute_hash(&content);
    
    let store_dir = std::path::Path::new(project_path).join(".nexora").join("artifacts");
    std::fs::create_dir_all(&store_dir).map_err(|e| e.to_string())?;
    
    let ext = std::path::Path::new(file_path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("bin");
    let store_path = store_dir.join(format!("{}.{}", content_hash, ext));
    std::fs::write(store_path, &content).map_err(|e| e.to_string())?;
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
        
    let artifact_id = format!("art_{}", content_hash);
    let artifact = SwarmArtifact {
        schema_version: 1,
        id: artifact_id,
        file_path: file_path.to_string(),
        content_hash,
        task_id: task_id.to_string(),
        stage: stage.to_string(),
        size_bytes,
        created_at: now,
        updated_at: now,
    };
    
    let mut manifest = load_registry(project_path)?;
    manifest.artifacts.retain(|a| a.file_path != file_path || a.task_id != task_id);
    manifest.artifacts.push(artifact.clone());
    save_registry(project_path, &manifest)?;
    
    Ok(artifact)
}

pub fn promote_artifact_stage(
    project_path: &str,
    artifact_id: &str,
    new_stage: &str,
) -> Result<(), String> {
    let valid_stages = ["draft", "validated", "reviewed", "approved", "merged", "archived"];
    let normalized = new_stage.to_lowercase();
    if !valid_stages.contains(&normalized.as_str()) {
        return Err(format!("Invalid stage: {}", new_stage));
    }
    
    let mut manifest = load_registry(project_path)?;
    let mut found = false;
    for artifact in &mut manifest.artifacts {
        if artifact.id == artifact_id {
            artifact.stage = normalized.clone();
            artifact.updated_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            found = true;
            break;
        }
    }
    
    if !found {
        return Err(format!("Artifact not found: {}", artifact_id));
    }
    
    save_registry(project_path, &manifest)?;
    Ok(())
}

// ==========================================
// Tauri Commands
// ==========================================

#[tauri::command]
pub fn get_swarm_artifacts(project_path: String) -> Result<Vec<SwarmArtifact>, String> {
    let manifest = load_registry(&project_path)?;
    Ok(manifest.artifacts)
}

#[tauri::command]
pub fn promote_swarm_artifact(project_path: String, artifact_id: String, stage: String) -> Result<(), String> {
    promote_artifact_stage(&project_path, &artifact_id, &stage)
}

#[tauri::command]
pub fn add_swarm_artifact(
    project_path: String,
    task_id: String,
    file_path: String,
    stage: String,
) -> Result<SwarmArtifact, String> {
    register_artifact(&project_path, &task_id, &file_path, &stage)
}
