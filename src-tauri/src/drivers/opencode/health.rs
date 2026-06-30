use crate::drivers::types::HealthStatus;
use crate::drivers::sdk::is_executable_in_path;

pub fn check_health() -> HealthStatus {
    let opencode_exists = is_executable_in_path("opencode");
    HealthStatus {
        executable_ok: opencode_exists,
        authentication_ok: true,
        version_ok: true,
        session_ok: true,
        connectivity_ok: true,
        details: if opencode_exists {
            "OpenCode CLI is ready.".to_string()
        } else {
            "opencode executable is missing from your PATH.".to_string()
        },
    }
}
