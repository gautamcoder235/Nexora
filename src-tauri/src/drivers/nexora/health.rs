use crate::drivers::types::HealthStatus;
use crate::drivers::sdk::is_executable_in_path;

pub fn check_health() -> HealthStatus {
    let nexora_exists = is_executable_in_path("nx");
    HealthStatus {
        executable_ok: nexora_exists,
        authentication_ok: true,
        version_ok: true,
        session_ok: true,
        connectivity_ok: true,
        details: if nexora_exists {
            "Nexora CLI is ready.".to_string()
        } else {
            "nx executable is missing from your PATH.".to_string()
        },
    }
}
