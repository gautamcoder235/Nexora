use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_resume(session_id: &str, _workspace_dir: &str) -> Result<(String, Vec<String>), DriverError> {
    let exe = get_executable_path("nx")?;
    let args = if !session_id.is_empty() {
        vec!["--session".to_string(), session_id.to_string()]
    } else {
        vec!["--continue".to_string()]
    };
    Ok((exe, args))
}
