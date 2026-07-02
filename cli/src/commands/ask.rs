use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{Command, CommandResult};
use crate::ui::{print_alert, show_spinner};
use crate::services::ipc::IpcRequest;

pub struct AskCommand;

impl Command for AskCommand {
    fn name(&self) -> &'static str { "ask" }
    fn description(&self) -> &'static str { "Asks the AI assistant a quick coding question" }

    fn execute(&self, services: &ServiceContainer, args: &clap::ArgMatches) -> Result<CommandResult, NexoraError> {
        let theme = &services.theme;
        let prompt = args.get_one::<String>("prompt").ok_or_else(|| NexoraError::CommandError {
            message: "A prompt question must be provided, e.g. nx ask \"how to extract file in Rust?\"".to_string(),
        })?;

        let spinner = show_spinner(theme, "Querying Nexora Assistant...");

        let mut ipc = services.ipc.lock();
        let result = if ipc.is_connected() || ipc.connect(std::time::Duration::from_millis(500)).is_ok() {
            // IPC connected! Request reply from Tauri Desktop host
            let request = IpcRequest {
                jsonrpc: "2.0".to_string(),
                method: "chat/send".to_string(),
                params: serde_json::json!({
                    "prompt": prompt,
                    "model": services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string()),
                }),
                id: 1,
            };

            match ipc.send(&request) {
                Ok(response) => {
                    spinner.finish_and_clear();
                    if let Some(res) = response.result {
                        if let Some(reply) = res.get("reply").and_then(|r| r.as_str()) {
                            println!("\n{}", reply);
                            Ok(CommandResult::Text(reply.to_string()))
                        } else {
                            Ok(CommandResult::Success(res))
                        }
                    } else if let Some(err) = response.error {
                        print_alert(theme, "error", &format!("Desktop service error: {}", err));
                        Err(NexoraError::CommandError {
                            message: format!("AI service returned error: {}", err),
                        })
                    } else {
                        Err(NexoraError::CommandError {
                            message: "Invalid IPC response structure".to_string(),
                        })
                    }
                }
                Err(e) => {
                    spinner.finish_and_clear();
                    Err(e)
                }
            }
        } else {
            // Offline fallback
            spinner.finish_and_clear();
            print_alert(theme, "warn", "Desktop application connection is offline.");
            println!("\n[Offline Fallback Mode]");
            println!("Please run the Nexora Desktop app to utilize full context models.");
            println!("Or configure API keys inside global config: `nx config set api_key <value>`");
            
            let mock_reply = format!(
                "Here is a local diagnostic check:\nYour workspace is at: {}\nPrompt received: '{}'", 
                services.workspace.root_path.to_string_lossy(),
                prompt
            );
            println!("\n{}", mock_reply);
            Ok(CommandResult::Text(mock_reply))
        };

        result
    }
}
