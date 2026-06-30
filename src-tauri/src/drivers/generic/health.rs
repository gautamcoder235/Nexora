use crate::drivers::types::HealthStatus;

pub fn check_health() -> HealthStatus {
    HealthStatus {
        executable_ok: true,
        authentication_ok: true,
        version_ok: true,
        session_ok: true,
        connectivity_ok: true,
        details: "Generic shell is ready.".to_string(),
    }
}
