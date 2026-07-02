use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{Command, CommandResult};
use crate::ui::print_alert;
use dialoguer::{Select, theme::ColorfulTheme};

fn read_password_with_asterisks(prompt_text: &str) -> Result<String, NexoraError> {
    use crossterm::{
        event::{self, Event, KeyCode, KeyModifiers},
        terminal::{disable_raw_mode, enable_raw_mode},
    };
    use std::io::{Write, stdout};
    use dialoguer::console::style;

    print!("{} {} {} ", 
        style("?").yellow().bold(),
        style(prompt_text).bold(),
        style("›").black().bright()
    );
    stdout().flush().unwrap_or_default();
    
    if enable_raw_mode().is_err() {
        return Err(NexoraError::CommandError { message: "Failed to enable raw terminal mode".to_string() });
    }
    
    let mut input = String::new();
    loop {
        if let Ok(Event::Key(key)) = event::read() {
            if key.kind == event::KeyEventKind::Press {
                match key.code {
                    KeyCode::Enter => {
                        break;
                    }
                    KeyCode::Char(c) => {
                        if key.modifiers.contains(KeyModifiers::CONTROL) && c == 'c' {
                            disable_raw_mode().unwrap_or_default();
                            std::process::exit(1);
                        }
                        input.push(c);
                        print!("*");
                        stdout().flush().unwrap_or_default();
                    }
                    KeyCode::Backspace => {
                        if input.pop().is_some() {
                            print!("\x08 \x08"); // move back, print space, move back
                            stdout().flush().unwrap_or_default();
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    disable_raw_mode().unwrap_or_default();
    println!();
    Ok(input)
}

pub struct SetupCommand;

impl Command for SetupCommand {
    fn name(&self) -> &'static str { "setup" }
    fn description(&self) -> &'static str { "Interactive guide to set API keys, select active provider, and search/select models" }

    fn execute(&self, services: &ServiceContainer, _args: &clap::ArgMatches) -> Result<CommandResult, NexoraError> {
        let theme = &services.theme;
        let colorful_theme = ColorfulTheme::default();

        println!("Welcome to the Nexora Interactive Configuration Wizard!\n");

        let main_options = &[
            "Add/Update API Key",
            "Choose Provider & Select Model",
            "Exit Wizard"
        ];

        let selection = Select::with_theme(&colorful_theme)
            .with_prompt("What would you like to configure?")
            .items(main_options)
            .default(0)
            .interact()
            .map_err(|e| NexoraError::CommandError { message: format!("Interactive select failed: {}", e) })?;

        match selection {
            0 => {
                // Add/Update API Key
                let providers = &[
                    ("Groq (GROQ_API_KEY)", "GROQ_API_KEY"),
                    ("DeepSeek (DEEPSEEK_API_KEY)", "DEEPSEEK_API_KEY"),
                    ("Google Gemini (GEMINI_API_KEY)", "GEMINI_API_KEY"),
                    ("Mistral (MISTRAL_API_KEY)", "MISTRAL_API_KEY"),
                    ("Codestral (CODESTRAL_API_KEY)", "CODESTRAL_API_KEY"),
                    ("Kimi/Moonshot (KIMI_API_KEY)", "KIMI_API_KEY"),
                    ("NVIDIA NIM (NVIDIA_NIM_API_KEY)", "NVIDIA_NIM_API_KEY"),
                    ("OpenRouter (OPENROUTER_API_KEY)", "OPENROUTER_API_KEY"),
                    ("OpenCode (OPENCODE_API_KEY)", "OPENCODE_API_KEY"),
                ];

                let provider_names: Vec<&str> = providers.iter().map(|p| p.0).collect();
                let prov_selection = Select::with_theme(&colorful_theme)
                    .with_prompt("Select the provider to add/update API key for:")
                    .items(&provider_names)
                    .default(0)
                    .interact()
                    .map_err(|e| NexoraError::CommandError { message: format!("Interactive select failed: {}", e) })?;

                let env_var = providers[prov_selection].1;

                let key: String = read_password_with_asterisks(&format!("Enter API Key for {}", providers[prov_selection].0))?;

                if key.trim().is_empty() {
                    print_alert(theme, "error", "API Key cannot be empty!");
                    return Ok(CommandResult::Text("API Key update cancelled".to_string()));
                }

                // Write to global .env
                let global_path = nexora_core::config::get_global_config_path().ok_or_else(|| {
                    NexoraError::ConfigError {
                        message: "Unable to find global config folder".to_string(),
                        path: None,
                    }
                })?;
                let env_file_path = global_path.parent().unwrap().join(".env");
                
                let mut env_content = String::new();
                if env_file_path.exists() {
                    env_content = std::fs::read_to_string(&env_file_path).unwrap_or_default();
                }

                let mut lines: Vec<String> = env_content.lines().map(|s| s.to_string()).collect();
                let mut found = false;
                let new_line = format!("{}={}", env_var, key);

                for line in &mut lines {
                    if line.starts_with(&format!("{}=", env_var)) {
                        *line = new_line.clone();
                        found = true;
                        break;
                    }
                }

                if !found {
                    lines.push(new_line);
                }

                std::fs::write(&env_file_path, lines.join("\n") + "\n").map_err(|e| NexoraError::CommandError {
                    message: format!("Failed to write to .env file: {}", e),
                })?;

                print_alert(theme, "success", &format!("Successfully saved {} to local .env file!", env_var));
            }
            1 => {
                // Choose Provider & Select Model
                let providers_list = &[
                    ("groq", vec!["llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"]),
                    ("deepseek", vec!["deepseek-chat", "deepseek-coder"]),
                    ("gemini", vec!["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"]),
                    ("mistral", vec!["mistral-large-latest", "open-mixtral-8x22", "mistral-small-latest"]),
                    ("codestral", vec!["codestral-latest"]),
                    ("kimi", vec!["moonshot-v1-8k", "moonshot-v1-32k"]),
                    ("nvidia", vec!["meta/llama3-70b-instruct", "nvidia/nemotron-4-340b-instruct"]),
                    ("openrouter", vec!["meta-llama/llama-3-70b-instruct", "anthropic/claude-3-opus", "google/gemini-pro"]),
                    ("opencode", vec!["opencode-default-model"]),
                ];

                let provider_names: Vec<&str> = providers_list.iter().map(|p| p.0).collect();
                let prov_selection = Select::with_theme(&colorful_theme)
                    .with_prompt("Choose active provider:")
                    .items(&provider_names)
                    .default(0)
                    .interact()
                    .map_err(|e| NexoraError::CommandError { message: format!("Interactive select failed: {}", e) })?;

                let chosen_provider = providers_list[prov_selection].0;
                let models = &providers_list[prov_selection].1;

                // Search/Select model from list
                let model_selection = Select::with_theme(&colorful_theme)
                    .with_prompt(format!("Choose model for {}:", chosen_provider))
                    .items(models)
                    .default(0)
                    .interact()
                    .map_err(|e| NexoraError::CommandError { message: format!("Interactive select failed: {}", e) })?;

                let chosen_model = models[model_selection];

                // Write both to global config.toml
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

                // Update active profile model and provider
                let active = config_struct.active_profile.clone();
                if let Some(profile) = config_struct.profiles.get_mut(&active) {
                    profile.model = Some(chosen_model.to_string());
                    profile.provider = Some(chosen_provider.to_string());
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

                print_alert(theme, "success", &format!("Successfully set provider to '{}' and model to '{}'!", chosen_provider, chosen_model));
            }
            _ => {
                println!("Wizard exited.");
            }
        }

        Ok(CommandResult::Text("Setup completed successfully".to_string()))
    }
}
