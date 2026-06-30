use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_resume(session_id: &str, _workspace_dir: &str) -> Result<(String, Vec<String>), DriverError> {
    // If a native session ID was discovered, resume it. Otherwise, use --continue
    // (since CLAUDE_CONFIG_DIR is now isolated per terminal, this is safe and will not collide).
    let args = if !session_id.is_empty() {
        vec!["--resume".to_string(), session_id.to_string()]
    } else {
        vec!["--continue".to_string()]
    };

    if crate::drivers::sdk::is_executable_in_path("claude") {
        let exe = get_executable_path("claude")?;
        Ok((exe, args))
    } else {
        let exe = get_executable_path("npx")?;
        let mut final_args = vec!["-y".to_string(), "@claudecode/cli".to_string()];
        final_args.extend(args);
        Ok((exe, final_args))
    }
}
