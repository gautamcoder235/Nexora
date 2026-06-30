use crate::drivers::types::LaunchOptions;
use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_launch(opts: LaunchOptions) -> Result<(String, Vec<String>), DriverError> {
    if crate::drivers::sdk::is_executable_in_path("claude") {
        let exe = get_executable_path("claude")?;
        let mut args = Vec::new();
        if let Some(custom) = opts.custom_args {
            let filtered: Vec<String> = custom.into_iter().filter(|a| a != "-y" && a != "@claudecode/cli").collect();
            args.extend(filtered);
        }
        Ok((exe, args))
    } else {
        let exe = get_executable_path("npx")?;
        let mut args = vec!["-y".to_string(), "@claudecode/cli".to_string()];
        if let Some(custom) = opts.custom_args {
            args.extend(custom);
        }
        Ok((exe, args))
    }
}
