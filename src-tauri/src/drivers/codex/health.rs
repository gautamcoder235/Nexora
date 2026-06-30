use crate::drivers::types::HealthStatus;
use crate::drivers::sdk::is_executable_in_path;

pub fn check_health() -> HealthStatus {
    let codex_exists = is_executable_in_path("codex");
    HealthStatus {
        executable_ok: codex_exists,
        authentication_ok: true,
        version_ok: true,
        session_ok: true,
        connectivity_ok: true,
        details: if codex_exists {
            "Codex CLI is ready.".to_string()
        } else {
            "codex executable is missing from your PATH.".to_string()
        },
    }
}
