use std::collections::HashMap;
use clap::{Arg, Command as ClapCommand, ArgAction};
// NexoraError is not directly used here
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{CommandPipeline, OutputMode};
use crate::command_dispatcher::middleware::{MetricsMiddleware, LoggingMiddleware, IpcConnectionMiddleware};
use crate::commands::doctor::DoctorCommand;
use crate::commands::config::ConfigCommand;
use crate::commands::ask::AskCommand;
use crate::commands::explain::ExplainCommand;
use crate::commands::commit::CommitCommand;
use crate::commands::chat::ChatCommand;
use crate::commands::setup::SetupCommand;

pub mod runtime;
pub mod services;
pub mod command_dispatcher;
pub mod ui;
pub mod commands;

fn main() {
    // 1. Setup minimal clap command-line parser
    let matches = ClapCommand::new("nx")
        .version("0.1.0")
        .author("Nexora AI Team")
        .about("Modern production-grade AI-aware CLI")
        .arg(
            Arg::new("profile")
                .long("profile")
                .help("Select configurations profile (e.g. work, home, server)")
                .action(ArgAction::Set)
        )
        .arg(
            Arg::new("model")
                .long("model")
                .short('m')
                .help("Specify LLM model inline")
                .action(ArgAction::Set)
                .global(true)
        )
        .arg(
            Arg::new("provider")
                .long("provider")
                .short('p')
                .help("Specify LLM provider inline")
                .action(ArgAction::Set)
                .global(true)
        )
        .arg(
            Arg::new("json")
                .long("json")
                .help("Format command output as JSON")
                .action(ArgAction::SetTrue)
                .global(true)
        )
        .arg(
            Arg::new("yaml")
                .long("yaml")
                .help("Format command output as YAML")
                .action(ArgAction::SetTrue)
                .global(true)
        )
        .arg(
            Arg::new("raw")
                .long("raw")
                .help("Format command output as raw unformatted text")
                .action(ArgAction::SetTrue)
                .global(true)
        )
        .arg(
            Arg::new("silent")
                .long("silent")
                .help("Suppress standard output logs entirely")
                .action(ArgAction::SetTrue)
                .global(true)
        )
        .subcommand(
            ClapCommand::new("doctor")
                .about("Audits configurations, active profile states, and Desktop IPC health")
        )
        .subcommand(
            ClapCommand::new("config")
                .about("Inspects or updates configuration parameters")
                .subcommand(
                    ClapCommand::new("get")
                        .about("Get active configuration value")
                        .arg(Arg::new("key").required(true).help("The parameter key"))
                )
                .subcommand(
                    ClapCommand::new("set")
                        .about("Set configuration value")
                        .arg(Arg::new("key").required(true).help("The parameter key"))
                        .arg(Arg::new("value").required(true).help("The parameter value"))
                )
        )
        .subcommand(
            ClapCommand::new("ask")
                .about("Asks the AI assistant a quick coding question")
                .arg(Arg::new("prompt").required(true).help("The coding prompt question"))
        )
        .subcommand(
            ClapCommand::new("explain")
                .about("Explains the contents of a source code file")
                .arg(Arg::new("file").required(true).help("The target file path to analyze"))
        )
        .subcommand(
            ClapCommand::new("commit")
                .about("Generates an AI conventional commit message based on staged changes")
                .arg(
                    Arg::new("ai")
                        .long("ai")
                        .help("Trigger AI-guided conventional message draft")
                        .action(ArgAction::SetTrue)
                )
        )
        .subcommand(
            ClapCommand::new("chat")
                .about("Starts an interactive live coding chat session with the assistant")
        )
        .subcommand(
            ClapCommand::new("setup")
                .about("Interactive guide to set API keys, select active provider, and search/select models")
        )
        .get_matches();

    // 2. Resolve Global Profile and CLI Flags Overrides
    let profile_override = matches.get_one::<String>("profile").cloned();
    let mut overrides = HashMap::new();
    if let Some(m) = matches.get_one::<String>("model") {
        overrides.insert("model".to_string(), m.clone());
    }
    if let Some(p) = matches.get_one::<String>("provider") {
        overrides.insert("provider".to_string(), p.clone());
    }

    // 3. Resolve OutputMode
    let output_mode = if matches.get_flag("json") {
        OutputMode::Json
    } else if matches.get_flag("yaml") {
        OutputMode::Yaml
    } else if matches.get_flag("raw") {
        OutputMode::Raw
    } else if matches.get_flag("silent") {
        OutputMode::Silent
    } else {
        OutputMode::Human
    };

    // 4. Initialize DI Service Container
    let services = match ServiceContainer::bootstrap(profile_override, overrides) {
        Ok(s) => s,
        Err(e) => {
            e.print_and_exit();
        }
    };

    // 5. Initialize execution pipeline with middlewares
    let mut pipeline = CommandPipeline::new(services);
    pipeline.add_middleware(Box::new(LoggingMiddleware));
    pipeline.add_middleware(Box::new(MetricsMiddleware));
    pipeline.add_middleware(Box::new(IpcConnectionMiddleware));

    // 6. Register Subcommands
    pipeline.register_command(Box::new(DoctorCommand));
    pipeline.register_command(Box::new(ConfigCommand));
    pipeline.register_command(Box::new(AskCommand));
    pipeline.register_command(Box::new(ExplainCommand));
    pipeline.register_command(Box::new(CommitCommand));
    pipeline.register_command(Box::new(ChatCommand));
    pipeline.register_command(Box::new(SetupCommand));

    // 7. Dispatch to Command Pipeline
    let result = match matches.subcommand() {
        Some((name, sub_matches)) => pipeline.dispatch(name, sub_matches, output_mode),
        None => {
            let empty_matches = clap::ArgMatches::default();
            pipeline.dispatch("chat", &empty_matches, output_mode)
        }
    };

    if let Err(e) = result {
        e.print_and_exit();
    }
}
