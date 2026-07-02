use std::path::PathBuf;
use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{Command, CommandResult};
use crate::ui::{print_alert, show_spinner};
use crate::services::ipc::IpcRequest;

pub struct ExplainCommand;

impl Command for ExplainCommand {
    fn name(&self) -> &'static str { "explain" }
    fn description(&self) -> &'static str { "Explains the contents of a source code file" }

    fn execute(&self, services: &ServiceContainer, args: &clap::ArgMatches) -> Result<CommandResult, NexoraError> {
        let theme = &services.theme;
        let file_path_str = args.get_one::<String>("file").ok_or_else(|| NexoraError::CommandError {
            message: "A target file path must be provided, e.g. `nx explain src/main.rs`".to_string(),
        })?;

        // Find file (checking relative or absolute paths)
        let file_path = PathBuf::from(file_path_str);
        let target_path = if file_path.is_absolute() {
            file_path
        } else {
            services.workspace.root_path.join(file_path)
        };

        if !target_path.exists() {
            print_alert(theme, "error", &format!("File does not exist: {}", target_path.to_string_lossy()));
            return Err(NexoraError::WorkspaceError {
                message: format!("Target explain file does not exist: {}", target_path.to_string_lossy()),
            });
        }

        // Read file contents
        let file_content = std::fs::read_to_string(&target_path).map_err(|e| NexoraError::WorkspaceError {
            message: format!("Failed to read target file: {}", e),
        })?;

        let spinner = show_spinner(theme, &format!("Analyzing file '{}'...", file_path_str));

        let mut ipc = services.ipc.lock();
        let result = if ipc.is_connected() || ipc.connect(std::time::Duration::from_millis(500)).is_ok() {
            let request = IpcRequest {
                jsonrpc: "2.0".to_string(),
                method: "chat/send".to_string(),
                params: serde_json::json!({
                    "prompt": format!("Please analyze and explain the following code file (named {}):\n\n```\n{}\n```", file_path_str, file_content),
                    "model": services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string()),
                }),
                id: 2,
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
                        print_alert(theme, "error", &format!("AI analysis error: {}", err));
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
            spinner.finish_and_clear();
            print_alert(theme, "warn", "Desktop application connection is offline.");
            println!("\n[Offline Fallback Mode - Local Analysis]");
            
            // Simple offline analysis summary
            let summary = format!(
                "Local scan of: {}\nFile size: {} bytes\nLines: {}",
                target_path.to_string_lossy(),
                file_content.len(),
                file_content.lines().count()
            );
            println!("\n{}", summary);
            Ok(CommandResult::Text(summary))
        };

        result
    }
}
