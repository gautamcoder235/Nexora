use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_resume(session_id: &str, _workspace_dir: &str) -> Result<(String, Vec<String>), DriverError> {
    let exe = get_executable_path("cline")?;
    let mut args = Vec::new();
    if !session_id.is_empty() {
        args.push("--id".to_string());
        args.push(session_id.to_string());
    }
    Ok((exe, args))
}
