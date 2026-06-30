use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_resume(_session_id: &str, _workspace_dir: &str) -> Result<(String, Vec<String>), DriverError> {
    let exe = get_executable_path("aider")?;
    let args = vec![
        "--model".to_string(),
        "anthropic/claude-3-5-sonnet".to_string(),
        "--restore-chat-history".to_string(),
    ];
    Ok((exe, args))
}
