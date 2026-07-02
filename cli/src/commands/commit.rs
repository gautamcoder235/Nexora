use std::process::Command as StdCommand;
use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{Command, CommandResult};
use crate::ui::{print_alert, show_spinner};
use crate::services::ipc::IpcRequest;

pub struct CommitCommand;

impl Command for CommitCommand {
    fn name(&self) -> &'static str { "commit" }
    fn description(&self) -> &'static str { "Generates an AI conventional commit message based on staged git diff changes" }

    fn execute(&self, services: &ServiceContainer, _args: &clap::ArgMatches) -> Result<CommandResult, NexoraError> {
        let theme = &services.theme;

        if !services.workspace.is_git_repo {
            print_alert(theme, "error", "Active workspace directory is not initialized as a git repository.");
            return Err(NexoraError::WorkspaceError {
                message: "No git repository found in workspace hierarchy".to_string(),
            });
        }

        // Get staged diff
        let diff_output = StdCommand::new("git")
            .arg("diff")
            .arg("--cached")
            .current_dir(&services.workspace.root_path)
            .output()
            .map_err(|e| NexoraError::CommandError {
                message: format!("Failed to run git command: {}", e),
            })?;

        if !diff_output.status.success() {
            let err_msg = String::from_utf8_lossy(&diff_output.stderr).to_string();
            print_alert(theme, "error", &format!("Git command error: {}", err_msg));
            return Err(NexoraError::CommandError {
                message: format!("Git command failed: {}", err_msg),
            });
        }

        let diff_str = String::from_utf8_lossy(&diff_output.stdout).to_string();
        if diff_str.trim().is_empty() {
            print_alert(theme, "warn", "No changes staged. Please stage files using `git add` before committing.");
            return Ok(CommandResult::Text("No changes staged.".to_string()));
        }

        let spinner = show_spinner(theme, "Analyzing staged git diff changes...");

        let mut ipc = services.ipc.lock();
        let result = if ipc.is_connected() || ipc.connect(std::time::Duration::from_millis(500)).is_ok() {
            let prompt = format!(
                "Generate a professional Conventional Commit message (feat/fix/chore/docs/refactor/style) based on this git diff. Return ONLY the commit message text:\n\n```diff\n{}\n```",
                diff_str
            );

            let request = IpcRequest {
                jsonrpc: "2.0".to_string(),
                method: "chat/send".to_string(),
                params: serde_json::json!({
                    "prompt": prompt,
                    "model": services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string()),
                }),
                id: 3,
            };

            match ipc.send(&request) {
                Ok(response) => {
                    spinner.finish_and_clear();
                    if let Some(res) = response.result {
                        if let Some(reply) = res.get("reply").and_then(|r| r.as_str()) {
                            let msg = reply.trim();
                            println!("\n{}", msg);
                            Ok(CommandResult::Text(msg.to_string()))
                        } else {
                            Ok(CommandResult::Success(res))
                        }
                    } else if let Some(err) = response.error {
                        print_alert(theme, "error", &format!("Commit generator error: {}", err));
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
            
            // Offline fallback message draft
            let summary = "feat(core): update workspaces module tracking dependencies";
            println!("\n[Offline Mockup Commit Message]");
            println!("{}", summary);
            Ok(CommandResult::Text(summary.to_string()))
        };

        result
    }
}
