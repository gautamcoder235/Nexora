use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct SessionKey {
    pub cli: String,
    pub workspace: PathBuf,
    pub terminal_id: String,
}

impl SessionKey {
    pub fn to_string_id(&self) -> String {
        let workspace_str = self.workspace.to_string_lossy().to_string();
        #[cfg(target_os = "windows")]
        let workspace_str = workspace_str.to_lowercase();
        let normalized_workspace = workspace_str.trim_end_matches(std::path::MAIN_SEPARATOR);

        format!("{}|{}|{}", self.cli, normalized_workspace, self.terminal_id)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SessionLockInfo {
    pub status: String,
    pub native_session_id: String,
    pub pid: u32,
    pub created_at: u64,
    pub heartbeat: u64,
}



#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum DriverState {
    NotInstalled,
    Installed,
    Ready,
    Launching,
    Running,
    Detached,
    Resuming,
    Stopping,
    Failed,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct DriverCapabilities {
    pub supports_resume: bool,
    pub supports_multiple_sessions: bool,
    pub supports_interrupt: bool,
    pub supports_streaming: bool,
    pub supports_mcp: bool,
    pub supports_tool_calling: bool,
    pub supports_json: bool,
    pub supports_session_discovery: bool,
    pub supports_export: bool,
    pub supports_import: bool,
    pub supports_workspaces: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DriverMetadata {
    pub id: String,
    pub display_name: String,
    pub executable: String,
    pub supported_versions: String,
    pub platform: String,
    pub capabilities: DriverCapabilities,
    pub session_strategy: String,
    pub discovery_strategy: String,
    pub launch_strategy: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LaunchOptions {
    pub session_id: String,
    pub workspace_dir: String,
    pub custom_args: Option<Vec<String>>,
    pub env_overrides: Option<HashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SessionInfo {
    pub session_id: String,
    pub workspace: PathBuf,
    pub terminal_id: String,
    pub tool: String,
    pub created_at: u64,
    pub last_seen: u64,
    pub state: String,
    pub metadata: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HealthStatus {
    pub executable_ok: bool,
    pub authentication_ok: bool,
    pub version_ok: bool,
    pub session_ok: bool,
    pub connectivity_ok: bool,
    pub details: String,
}
