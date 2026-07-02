use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{Command, CommandResult};
use crate::ui::cockpit::start_cockpit;

pub struct ChatCommand;

impl Command for ChatCommand {
    fn name(&self) -> &'static str { "chat" }
    fn aliases(&self) -> Vec<&'static str> { vec!["c"] }
    fn description(&self) -> &'static str { "Starts the interactive live developer cockpit dashboard session" }

    fn execute(&self, services: &ServiceContainer, _args: &clap::ArgMatches) -> Result<CommandResult, NexoraError> {
        start_cockpit(services)?;
        Ok(CommandResult::Empty)
    }
}
