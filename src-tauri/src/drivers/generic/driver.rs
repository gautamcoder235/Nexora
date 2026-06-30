use crate::drivers::driver::CliDriver;
use crate::drivers::types::{DriverMetadata, DriverCapabilities, LaunchOptions, HealthStatus};
use crate::drivers::errors::DriverError;

pub struct GenericDriver;

impl GenericDriver {
    pub fn new() -> Self {
        GenericDriver
    }
}

impl CliDriver for GenericDriver {
    fn metadata(&self) -> DriverMetadata {
        let shell = if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            "bash".to_string()
        };
        DriverMetadata {
            id: "generic".to_string(),
            display_name: "Generic Shell".to_string(),
            executable: shell,
            supported_versions: "*".to_string(),
            platform: std::env::consts::OS.to_string(),
            capabilities: self.capabilities(),
            session_strategy: "Fresh session".to_string(),
            discovery_strategy: "None".to_string(),
            launch_strategy: "System shell execution".to_string(),
        }
    }

    fn detect(&self) -> Result<bool, DriverError> {
        Ok(true)
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
            supports_resume: false,
            supports_multiple_sessions: true,
            supports_interrupt: true,
            supports_streaming: true,
            supports_mcp: false,
            supports_tool_calling: false,
            supports_json: false,
            supports_session_discovery: false,
            supports_export: false,
            supports_import: false,
            supports_workspaces: true,
        }
    }

    fn cleanup(&self, _session_id: &str) -> Result<(), DriverError> {
        Ok(())
    }
}
