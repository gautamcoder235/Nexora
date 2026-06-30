use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_resume(session_id: &str, _workspace_dir: &str) -> Result<(String, Vec<String>), DriverError> {
    let exe = get_executable_path("codex")?;
    let args = if !session_id.is_empty() {
        // We have a native session ID discovered from stdout → resume it
        vec!["resume".to_string(), session_id.to_string()]
    } else {
        // Since we now use isolated CODEX_HOME directories per terminal,
        // we can safely use --last to resume this terminal's last session.
        vec!["resume".to_string(), "--last".to_string()]
    };
    Ok((exe, args))
}
