use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use crate::team::models::{KanbanTask, TeamMessage, AgentRuntime};
use crate::team::runtime::lock_manager::FileLock;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub tasks: Vec<KanbanTask>,
    pub locks: Vec<FileLock>,
    pub messages: Vec<TeamMessage>,
    pub agent_runtimes: Vec<AgentRuntime>,
}

pub struct SnapshotManager {
    workspace_path: PathBuf,
}

impl SnapshotManager {
    pub fn new(workspace_path: PathBuf) -> Self {
        SnapshotManager { workspace_path }
    }

    pub fn save_snapshot(&self, snapshot: &RuntimeSnapshot) -> Result<(), String> {
        let snapshot_dir = self.workspace_path.join(".nexora").join("state");
        std::fs::create_dir_all(&snapshot_dir)
            .map_err(|e| format!("Failed to create snapshot directory: {}", e))?;
        
        let path = snapshot_dir.join("team_snapshot.json");
        let json = serde_json::to_string_pretty(snapshot)
            .map_err(|e| format!("Failed to serialize snapshot: {}", e))?;
        
        std::fs::write(&path, json)
            .map_err(|e| format!("Failed to write snapshot to disk: {}", e))?;
        
        Ok(())
    }

    pub fn load_snapshot(&self) -> Result<Option<RuntimeSnapshot>, String> {
        let path = self.workspace_path.join(".nexora").join("state").join("team_snapshot.json");
        if !path.exists() {
            return Ok(None);
        }

        let json = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read snapshot file: {}", e))?;
        
        let snapshot: RuntimeSnapshot = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to deserialize snapshot: {}", e))?;
        
        Ok(Some(snapshot))
    }

    pub fn clear_snapshot(&self) {
        let path = self.workspace_path.join(".nexora").join("state").join("team_snapshot.json");
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
}
