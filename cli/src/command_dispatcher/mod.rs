pub mod middleware;

use std::sync::Arc;
use serde_json::Value;
use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputMode {
    Human,
    Json,
    Yaml,
    Csv,
    Markdown,
    Raw,
    Silent,
}

impl Default for OutputMode {
    fn default() -> Self {
        Self::Human
    }
}

pub enum CommandResult {
    Success(Value),
    Text(String),
    Empty,
}

pub trait Command: Send + Sync {
    fn name(&self) -> &'static str;
    fn aliases(&self) -> Vec<&'static str> { vec![] }
    fn description(&self) -> &'static str;
    fn execute(&self, services: &ServiceContainer, args: &clap::ArgMatches) -> Result<CommandResult, NexoraError>;
}

pub trait Middleware: Send + Sync {
    fn pre_execute(&self, services: &ServiceContainer, command_name: &str, args: &clap::ArgMatches) -> Result<(), NexoraError>;
    fn post_execute(&self, services: &ServiceContainer, command_name: &str, result: &mut CommandResult) -> Result<(), NexoraError>;
}

pub struct CommandPipeline {
    services: Arc<ServiceContainer>,
    middlewares: Vec<Box<dyn Middleware>>,
    commands: Vec<Box<dyn Command>>,
}

impl CommandPipeline {
    pub fn new(services: ServiceContainer) -> Self {
        Self {
            services: Arc::new(services),
            middlewares: Vec::new(),
            commands: Vec::new(),
        }
    }

    pub fn add_middleware(&mut self, middleware: Box<dyn Middleware>) {
        self.middlewares.push(middleware);
    }

    pub fn register_command(&mut self, command: Box<dyn Command>) {
        self.commands.push(command);
    }

    pub fn dispatch(&self, command_name: &str, args: &clap::ArgMatches, output_mode: OutputMode) -> Result<(), NexoraError> {
        let cmd = self.commands.iter()
            .find(|c| c.name() == command_name || c.aliases().contains(&command_name))
            .ok_or_else(|| NexoraError::CommandError {
                message: format!("Unknown command: {}", command_name),
            })?;

        // 1. Run pre-execute middlewares (Logging, metrics, permissions, validations)
        for mw in &self.middlewares {
            mw.pre_execute(&self.services, cmd.name(), args)?;
        }

        // 2. Measure & Execute Command
        let mut result = self.services.metrics.time_action(
            &format!("command.{}", cmd.name()),
            format!("Execution of subcommand '{}'", cmd.name()),
            || cmd.execute(&self.services, args),
        )?;

        // 3. Run post-execute middlewares
        for mw in &self.middlewares {
            mw.post_execute(&self.services, cmd.name(), &mut result)?;
        }

        // 4. Output Renderer Pipeline
        self.render_output(result, output_mode);

        Ok(())
    }

    fn render_output(&self, result: CommandResult, mode: OutputMode) {
        if mode == OutputMode::Silent {
            return;
        }

        match result {
            CommandResult::Empty => {}
            CommandResult::Text(txt) => {
                if mode == OutputMode::Raw || mode == OutputMode::Human {
                    println!("{}", txt);
                } else if mode == OutputMode::Json {
                    println!("{}", serde_json::json!({ "output": txt }));
                }
            }
            CommandResult::Success(val) => {
                match mode {
                    OutputMode::Json => {
                        if let Ok(json_str) = serde_json::to_string_pretty(&val) {
                            println!("{}", json_str);
                        }
                    }
                    OutputMode::Yaml => {
                        // Very simple fallback since we don't depend on yaml crate
                        if let Ok(json_str) = serde_json::to_string(&val) {
                            println!("---\n# YAML representation\n{}", json_str);
                        }
                    }
                    OutputMode::Csv => {
                        println!("data");
                        if let Some(arr) = val.as_array() {
                            for item in arr {
                                println!("{}", item);
                            }
                        } else {
                            println!("{}", val);
                        }
                    }
                    OutputMode::Markdown => {
                        println!("### Execution Result\n\n```json\n{}\n```", val);
                    }
                    OutputMode::Human | OutputMode::Raw => {
                        // Human mode formats beautifully, raw prints standard value
                        if let Some(msg) = val.get("message").and_then(|m| m.as_str()) {
                            println!("{}", msg);
                        } else {
                            println!("{}", val);
                        }
                    }
                    OutputMode::Silent => {}
                }
            }
        }
    }
}
