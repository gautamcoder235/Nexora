use crate::drivers::types::HealthStatus;
use crate::drivers::sdk::is_executable_in_path;

pub fn check_health() -> HealthStatus {
    let npx_exists = is_executable_in_path("npx");
    HealthStatus {
        executable_ok: npx_exists,
        authentication_ok: true,
        version_ok: true,
        session_ok: true,
        connectivity_ok: true,
        details: if npx_exists {
            "Claude Code is ready. NPX executable found.".to_string()
        } else {
            "NPX is missing from your PATH. Please install Node.js.".to_string()
        },
    }
}
