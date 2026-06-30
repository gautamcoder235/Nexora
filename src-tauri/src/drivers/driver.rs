use crate::drivers::types::{DriverMetadata, DriverCapabilities, LaunchOptions, HealthStatus};
use crate::drivers::errors::DriverError;

pub trait CliDriver: Send + Sync {
    fn metadata(&self) -> DriverMetadata;
    fn detect(&self) -> Result<bool, DriverError>;
    fn launch(&self, opts: LaunchOptions) -> Result<(String, Vec<String>), DriverError>;
    fn resume(&self, session_id: &str, workspace_dir: &str) -> Result<(String, Vec<String>), DriverError>;
    fn discover_session(&self, stdout_line: &str) -> Option<String>;
    fn stop(&self, session_id: &str) -> Result<(), DriverError>;
    fn health(&self) -> HealthStatus;
    fn capabilities(&self) -> DriverCapabilities;
    fn cleanup(&self, session_id: &str) -> Result<(), DriverError>;
}
