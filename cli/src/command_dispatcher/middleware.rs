use std::time::Duration;
use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{Middleware, CommandResult};

pub struct MetricsMiddleware;

impl Middleware for MetricsMiddleware {
    fn pre_execute(&self, services: &ServiceContainer, command_name: &str, _args: &clap::ArgMatches) -> Result<(), NexoraError> {
        services.metrics.increment(&format!("calls.{}", command_name), format!("Call count of {}", command_name));
        Ok(())
    }

    fn post_execute(&self, services: &ServiceContainer, command_name: &str, _result: &mut CommandResult) -> Result<(), NexoraError> {
        // Find execution metric recorded by dispatcher and log
        let metrics = services.metrics.get_metrics();
        if let Some(entry) = metrics.iter().find(|m| m.name == format!("command.{}", command_name)) {
            services.event_bus.publish(&nexora_core::event_bus::NexoraEvent::CommandFinished {
                command: command_name.to_string(),
                duration_ms: entry.value / 1000,
                success: true,
            });
        }
        Ok(())
    }
}

pub struct LoggingMiddleware;

impl Middleware for LoggingMiddleware {
    fn pre_execute(&self, services: &ServiceContainer, command_name: &str, _args: &clap::ArgMatches) -> Result<(), NexoraError> {
        tracing::debug!("Dispatching command: {}", command_name);
        services.event_bus.publish(&nexora_core::event_bus::NexoraEvent::CommandStarted {
            command: command_name.to_string(),
            args: std::env::args().skip(1).collect(),
        });
        Ok(())
    }

    fn post_execute(&self, _services: &ServiceContainer, command_name: &str, _result: &mut CommandResult) -> Result<(), NexoraError> {
        tracing::debug!("Finished command: {}", command_name);
        Ok(())
    }
}

pub struct IpcConnectionMiddleware;

impl Middleware for IpcConnectionMiddleware {
    fn pre_execute(&self, services: &ServiceContainer, command_name: &str, _args: &clap::ArgMatches) -> Result<(), NexoraError> {
        // Subelement commands that require desktop connectivity (e.g. chat, workspace, etc.)
        let remote_commands = ["chat", "workspace", "models"];
        if remote_commands.contains(&command_name) {
            let mut ipc = services.ipc.lock();
            if !ipc.is_connected() {
                let timeout_ms = services.config.get_value("ipc.timeout_ms")
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(1000);
                
                ipc.connect(Duration::from_millis(timeout_ms))?;
                services.event_bus.publish(&nexora_core::event_bus::NexoraEvent::DesktopConnected {
                    address: "desktop-ipc".to_string(),
                });
            }
        }
        Ok(())
    }

    fn post_execute(&self, _services: &ServiceContainer, _command_name: &str, _result: &mut CommandResult) -> Result<(), NexoraError> {
        Ok(())
    }
}
