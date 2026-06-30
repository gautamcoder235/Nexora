use crate::drivers::types::LaunchOptions;
use crate::drivers::errors::DriverError;

pub fn format_launch(opts: LaunchOptions) -> Result<(String, Vec<String>), DriverError> {
    let shell = if cfg!(target_os = "windows") {
        "powershell.exe".to_string()
    } else {
        "/bin/bash".to_string()
    };
    let mut args = Vec::new();
    if let Some(custom) = opts.custom_args {
        args.extend(custom);
    }
    Ok((shell, args))
}
