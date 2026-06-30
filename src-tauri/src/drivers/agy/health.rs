use crate::drivers::types::HealthStatus;
use crate::drivers::sdk::is_executable_in_path;

pub fn check_health() -> HealthStatus {
    let agy_exists = is_executable_in_path("agy");
    HealthStatus {
        executable_ok: agy_exists,
        authentication_ok: true,
        version_ok: true,
        session_ok: true,
        connectivity_ok: true,
        details: if agy_exists {
            "Antigravity CLI is ready.".to_string()
        } else {
            "agy executable is missing from your PATH.".to_string()
        },
    }
}
