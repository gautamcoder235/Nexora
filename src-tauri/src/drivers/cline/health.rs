use crate::drivers::types::HealthStatus;
use crate::drivers::sdk::is_executable_in_path;

pub fn check_health() -> HealthStatus {
    let cline_exists = is_executable_in_path("cline");
    HealthStatus {
        executable_ok: cline_exists,
        authentication_ok: true,
        version_ok: true,
        session_ok: true,
        connectivity_ok: true,
        details: if cline_exists {
            "Cline CLI is ready.".to_string()
        } else {
            "cline executable is missing from your PATH.".to_string()
        },
    }
}
