use crate::drivers::types::LaunchOptions;
use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_launch(opts: LaunchOptions) -> Result<(String, Vec<String>), DriverError> {
    let exe = get_executable_path("nx")?;
    let mut args = Vec::new();
    
    if let Some(custom) = opts.custom_args {
        args.extend(custom);
    }
    
    Ok((exe, args))
}
