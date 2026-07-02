use serde_json::Value;
use std::process::Command;
use anyhow::Result;
use crate::ai::tools::registry::Tool;

pub struct RunCommandTool;

#[async_trait::async_trait]
impl Tool for RunCommandTool {
    fn name(&self) -> &'static str {
        "run_command"
    }

    fn description(&self) -> &'static str {
        "Executes a shell command on the local system and returns its stdout and stderr."
    }

    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The command string to execute (e.g. 'cargo check', 'ls -la', 'npm test')"
                },
                "cwd": {
                    "type": "string",
                    "description": "Optional current working directory to run the command in. Defaults to the current workspace root if omitted."
                }
            },
            "required": ["command"]
        })
    }

    fn permissions(&self) -> Vec<String> {
        vec!["sys:execute".to_string()]
    }

    async fn execute(&self, args: Value) -> Result<Value> {
        let command_str = args.get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing or invalid 'command' argument"))?;
            
        let cwd_opt = args.get("cwd").and_then(|v| v.as_str());

        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(command_str);
            c
        } else {
            let mut c = Command::new("sh");
            c.arg("-c").arg(command_str);
            c
        };

        if let Some(cwd) = cwd_opt {
            if !cwd.is_empty() {
                cmd.current_dir(cwd);
            }
        }

        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let code = output.status.code().unwrap_or(-1);

                Ok(serde_json::json!({
                    "exit_code": code,
                    "stdout": stdout,
                    "stderr": stderr
                }))
            }
            Err(e) => {
                Err(anyhow::anyhow!("Failed to execute command: {}", e))
            }
        }
    }
}
