use crate::drivers::types::LaunchOptions;
use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_launch(opts: LaunchOptions) -> Result<(String, Vec<String>), DriverError> {
    let exe = get_executable_path("codex")?;
    let mut args = Vec::new();
    
    if let Some(custom) = opts.custom_args {
        // Filter out unexpected placeholder arguments if they are passed from old templates
        let filtered: Vec<String> = custom.into_iter().filter(|a| a != "--" && a != "--test-first").collect();
        args.extend(filtered);
    }
    
    Ok((exe, args))
}
