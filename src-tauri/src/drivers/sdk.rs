use crate::drivers::errors::DriverError;
use std::process::Command;

pub fn is_executable_in_path(command: &str) -> bool {
    let check_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    let mut cmd = Command::new(check_cmd);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd.arg(command)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn get_executable_path(command: &str) -> Result<String, DriverError> {
    if !is_executable_in_path(command) {
        return Err(DriverError::ExecutableNotFound(command.to_string()));
    }
    Ok(command.to_string())
}
