use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{Command, CommandResult};
use crate::ui::{print_alert, print_table};

pub struct ConfigCommand;

impl Command for ConfigCommand {
    fn name(&self) -> &'static str { "config" }
    fn description(&self) -> &'static str { "Inspects or updates configuration parameters" }
    
    fn execute(&self, services: &ServiceContainer, args: &clap::ArgMatches) -> Result<CommandResult, NexoraError> {
        let theme = &services.theme;
        
        let sub = args.subcommand();
        match sub {
            Some(("get", sub_args)) => {
                let key = sub_args.get_one::<String>("key").ok_or_else(|| NexoraError::CommandError {
                    message: "Parameter name is required".to_string(),
                })?;
                
                let val = services.config.get_value(key);
                match val {
                    Some(v) => {
                        println!("{}", v);
                        Ok(CommandResult::Text(v))
                    }
                    None => {
                        print_alert(theme, "error", &format!("Parameter '{}' is not set", key));
                        Err(NexoraError::ConfigError {
                            message: format!("Key '{}' not found in active layers", key),
                            path: None,
                        })
                    }
                }
            }
            Some(("set", sub_args)) => {
                let key = sub_args.get_one::<String>("key").ok_or_else(|| NexoraError::CommandError {
                    message: "Parameter name is required".to_string(),
                })?;
                let value = sub_args.get_one::<String>("value").ok_or_else(|| NexoraError::CommandError {
                    message: "Parameter value is required".to_string(),
                })?;

                // Read global file
                let global_path = nexora_core::config::get_global_config_path().ok_or_else(|| {
                    NexoraError::ConfigError {
                        message: "Unable to find global config folder".to_string(),
                        path: None,
                    }
                })?;

                let mut config_struct = if global_path.exists() {
                    let content = std::fs::read_to_string(&global_path).unwrap_or_default();
                    toml::from_str::<nexora_core::config::NexoraConfig>(&content).unwrap_or_default()
                } else {
                    nexora_core::config::NexoraConfig::default()
                };

                // Modify specific key
                match key.as_str() {
                    "model" => {
                        let active = config_struct.active_profile.clone();
                        if let Some(profile) = config_struct.profiles.get_mut(&active) {
                            profile.model = Some(value.clone());
                        }
                    }
                    "theme" => {
                        config_struct.display.theme = Some(value.clone());
                    }
                    "icons" => {
                        config_struct.display.icons = Some(value == "true" || value == "1");
                    }
                    "unicode" => {
                        config_struct.display.unicode = Some(value == "true" || value == "1");
                    }
                    _ => {
                        return Err(NexoraError::ConfigError {
                            message: format!("Setting key '{}' is not supported via CLI shorthand", key),
                            path: Some(global_path.to_string_lossy().to_string()),
                        });
                    }
                }

                // Write back
                let serialized = toml::to_string_pretty(&config_struct).map_err(|e| NexoraError::ConfigError {
                    message: format!("Failed to serialize TOML: {}", e),
                    path: Some(global_path.to_string_lossy().to_string()),
                })?;
                
                std::fs::write(&global_path, serialized).map_err(|e| NexoraError::ConfigError {
                    message: format!("Failed to write config: {}", e),
                    path: Some(global_path.to_string_lossy().to_string()),
                })?;

                print_alert(theme, "success", &format!("Successfully set '{}' to '{}'.", key, value));
                Ok(CommandResult::Success(serde_json::json!({
                    "status": "updated",
                    "key": key,
                    "value": value
                })))
            }
            _ => {
                // By default, list active configuration keys
                let keys = [
                    "active_profile",
                    "model",
                    "theme",
                    "icons",
                    "unicode",
                    "ipc.pipe_name",
                    "ipc.socket_path",
                    "ipc.timeout_ms",
                    "telemetry.enabled"
                ];
                
                let mut rows: Vec<Vec<String>> = Vec::new();
                for k in &keys {
                    let resolved = services.config.get_value(k).unwrap_or_else(|| "Not Set".to_string());
                    rows.push(vec![k.to_string(), resolved]);
                }

                let row_slices: Vec<Vec<&str>> = rows
                    .iter()
                    .map(|v| vec![v[0].as_str(), v[1].as_str()])
                    .collect();
                
                println!();
                print_table(theme, &["Configuration Key", "Active Value (Resolved)"], &row_slices);

                Ok(CommandResult::Success(serde_json::json!({
                    "keys_listed": keys.len()
                })))
            }
        }
    }
}
