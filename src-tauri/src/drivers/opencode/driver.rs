use crate::drivers::driver::CliDriver;
use crate::drivers::types::{DriverMetadata, DriverCapabilities, LaunchOptions, HealthStatus};
use crate::drivers::errors::DriverError;

pub struct OpencodeDriver;

impl OpencodeDriver {
    pub fn new() -> Self {
        OpencodeDriver
    }
}

impl CliDriver for OpencodeDriver {
    fn metadata(&self) -> DriverMetadata {
        DriverMetadata {
            id: "opencode".to_string(),
            display_name: "OpenCode CLI".to_string(),
            executable: "opencode".to_string(),
            supported_versions: ">=0.1.0".to_string(),
            platform: std::env::consts::OS.to_string(),
            capabilities: self.capabilities(),
            session_strategy: "Fresh session".to_string(),
            discovery_strategy: "Logs regex parsing".to_string(),
            launch_strategy: "OpenCode command execution".to_string(),
        }
    }

    fn detect(&self) -> Result<bool, DriverError> {
        Ok(crate::drivers::sdk::is_executable_in_path("opencode"))
    }

    fn launch(&self, opts: LaunchOptions) -> Result<(String, Vec<String>), DriverError> {
        super::launch::format_launch(opts)
    }

    fn resume(&self, session_id: &str, workspace_dir: &str) -> Result<(String, Vec<String>), DriverError> {
        super::resume::format_resume(session_id, workspace_dir)
    }

    fn discover_session(&self, stdout_line: &str) -> Option<String> {
        super::discover::discover(stdout_line)
    }

    fn stop(&self, _session_id: &str) -> Result<(), DriverError> {
        Ok(())
    }

    fn health(&self) -> HealthStatus {
        super::health::check_health()
    }

    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            supports_resume: true,
            supports_multiple_sessions: true,
            supports_interrupt: true,
            supports_streaming: true,
            supports_mcp: true,
            supports_tool_calling: true,
            supports_json: false,
            supports_session_discovery: true,
            supports_export: false,
            supports_import: false,
            supports_workspaces: true,
        }
    }

    fn cleanup(&self, _session_id: &str) -> Result<(), DriverError> {
        Ok(())
    }
}
