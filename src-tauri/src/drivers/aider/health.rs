use crate::drivers::types::HealthStatus;
use crate::drivers::sdk::is_executable_in_path;

pub fn check_health() -> HealthStatus {
    let aider_exists = is_executable_in_path("aider");
    HealthStatus {
        executable_ok: aider_exists,
        authentication_ok: true,
        version_ok: true,
        session_ok: true,
        connectivity_ok: true,
        details: if aider_exists {
            "Aider CLI is ready.".to_string()
        } else {
            "aider executable is missing from your PATH.".to_string()
        },
    }
}
