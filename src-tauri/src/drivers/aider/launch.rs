use crate::drivers::types::LaunchOptions;
use crate::drivers::errors::DriverError;
use crate::drivers::sdk::get_executable_path;

pub fn format_launch(opts: LaunchOptions) -> Result<(String, Vec<String>), DriverError> {
    let exe = get_executable_path("aider")?;
    let mut args = Vec::new();
    
    // Check if custom_args overrides the model
    let mut has_model_arg = false;
    if let Some(ref custom) = opts.custom_args {
        for arg in custom {
            if arg == "--model" || arg == "-m" 
                || arg == "--opus" || arg == "--sonnet" || arg == "--haiku"
                || arg == "-4" || arg == "--4" || arg == "--4o" || arg == "--mini"
                || arg == "--4-turbo" || arg == "--35turbo" || arg == "--35-turbo"
                || arg == "-3" || arg == "--deepseek" || arg == "--o1-mini"
                || arg == "--o1-preview" 
            {
                has_model_arg = true;
                break;
            }
        }
    }
    
    if !has_model_arg {
        args.push("--model".to_string());
        args.push("anthropic/claude-3-5-sonnet".to_string());
    }
    
    if let Some(custom) = opts.custom_args {
        args.extend(custom);
    }
    
    Ok((exe, args))
}
