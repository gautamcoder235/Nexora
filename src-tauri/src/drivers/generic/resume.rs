use crate::drivers::errors::DriverError;

pub fn format_resume(_session_id: &str, _workspace_dir: &str) -> Result<(String, Vec<String>), DriverError> {
    let shell = if cfg!(target_os = "windows") {
        "powershell.exe".to_string()
    } else {
        "/bin/bash".to_string()
    };
    Ok((shell, Vec::new()))
}
