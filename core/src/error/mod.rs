use std::fmt;
use owo_colors::OwoColorize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    NX001, // IPC Connection Failed
    NX002, // Permission Denied
    NX003, // Config Parse Error
    NX004, // Model Unavailable
    NX005, // Workspace Mismatch
    NX006, // Plugin Execution Error
    NX007, // Cache Failure
    NX008, // Shell Integration Failed
    NX009, // Command Execution Failed
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            ErrorCode::NX001 => "NX001: IPC Connection Failed",
            ErrorCode::NX002 => "NX002: Permission Denied",
            ErrorCode::NX003 => "NX003: Config Parse Error",
            ErrorCode::NX004 => "NX004: Model Unavailable",
            ErrorCode::NX005 => "NX005: Workspace Mismatch",
            ErrorCode::NX006 => "NX006: Plugin Execution Error",
            ErrorCode::NX007 => "NX007: Cache Failure",
            ErrorCode::NX008 => "NX008: Shell Integration Failed",
            ErrorCode::NX009 => "NX009: Command Execution Failed",
        };
        write!(f, "{}", name)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum NexoraError {
    #[error("IPC Connection Error (NX001): {message}")]
    IpcError {
        message: String,
        details: Option<String>,
    },
    #[error("Permission Denied (NX002): {action}")]
    PermissionDenied {
        action: String,
        resource: String,
    },
    #[error("Config Error (NX003): {message}")]
    ConfigError {
        message: String,
        path: Option<String>,
    },
    #[error("Model Error (NX004): {model} is unavailable: {reason}")]
    ModelError {
        model: String,
        reason: String,
    },
    #[error("Workspace Error (NX005): {message}")]
    WorkspaceError {
        message: String,
    },
    #[error("Plugin Error (NX006): {plugin_id}: {message}")]
    PluginError {
        plugin_id: String,
        message: String,
    },
    #[error("Cache Error (NX007): {message}")]
    CacheError {
        message: String,
    },
    #[error("Shell Integration Error (NX008): {message}")]
    ShellError {
        message: String,
    },
    #[error("Command Execution Error (NX009): {message}")]
    CommandError {
        message: String,
    },
}

impl NexoraError {
    pub fn code(&self) -> ErrorCode {
        match self {
            NexoraError::IpcError { .. } => ErrorCode::NX001,
            NexoraError::PermissionDenied { .. } => ErrorCode::NX002,
            NexoraError::ConfigError { .. } => ErrorCode::NX003,
            NexoraError::ModelError { .. } => ErrorCode::NX004,
            NexoraError::WorkspaceError { .. } => ErrorCode::NX005,
            NexoraError::PluginError { .. } => ErrorCode::NX006,
            NexoraError::CacheError { .. } => ErrorCode::NX007,
            NexoraError::ShellError { .. } => ErrorCode::NX008,
            NexoraError::CommandError { .. } => ErrorCode::NX009,
        }
    }

    pub fn possible_causes(&self) -> Vec<String> {
        match self {
            NexoraError::IpcError { .. } => vec![
                "The Nexora Desktop Application is not running.".to_string(),
                "The IPC named pipe or Unix socket file is missing or blocked by another process.".to_string(),
                "Insufficient system privileges to open named pipe connections.".to_string(),
            ],
            NexoraError::PermissionDenied { action, resource } => vec![
                format!("The active command or plugin attempted to perform action '{}'.", action),
                format!("The resource '{}' is locked or restricted in the current profile.", resource),
                "The CLI is running inside a restricted sandboxed mode.".to_string(),
            ],
            NexoraError::ConfigError { .. } => vec![
                "The configuration TOML contains syntax errors (invalid formatting).".to_string(),
                "A configuration field holds a value type mismatch (e.g. string expected, got int).".to_string(),
                "The file path contains invalid characters or file permissions are read-only.".to_string(),
            ],
            NexoraError::ModelError { model, .. } => vec![
                format!("The model '{}' is not supported by your configured provider.", model),
                "No API key is configured or the current key has expired.".to_string(),
                "Network issues are preventing access to the cloud model endpoint.".to_string(),
            ],
            NexoraError::WorkspaceError { .. } => vec![
                "The directory is not initialized as a git repository or workspace.".to_string(),
                "Missing project manifest files (Cargo.toml, package.json, requirements.txt).".to_string(),
                "Access permissions to read workspace directory structures are denied.".to_string(),
            ],
            NexoraError::PluginError { .. } => vec![
                "The WebAssembly binary is corrupted or uses an unsupported ABI version.".to_string(),
                "The plugin panicked or executed an out-of-bounds memory access.".to_string(),
                "The plugin attempted unauthorized host system calls.".to_string(),
            ],
            NexoraError::CacheError { .. } => vec![
                "The cache file path is locked by another instance of Nexora CLI.".to_string(),
                "Disk space is fully exhausted preventing database commits.".to_string(),
            ],
            NexoraError::ShellError { .. } => vec![
                "The requested shell is not installed or not in the user's PATH.".to_string(),
                "Permissions are insufficient to write to the shell initialization configuration file.".to_string(),
            ],
            NexoraError::CommandError { .. } => vec![
                "An unexpected internal runtime panic occurred during command execution.".to_string(),
                "Invalid parameters passed to command dispatcher.".to_string(),
            ],
        }
    }

    pub fn suggested_fixes(&self) -> Vec<String> {
        match self {
            NexoraError::IpcError { .. } => vec![
                "Launch the Nexora Desktop App and keep it running in the background.".to_string(),
                "Verify connection settings using: `nx doctor --fix-ipc`".to_string(),
            ],
            NexoraError::PermissionDenied { .. } => vec![
                "Modify permissions for this plugin or command in your `config.toml`.".to_string(),
                "Run the CLI command with administrative / elevated privileges if accessing system resources.".to_string(),
            ],
            NexoraError::ConfigError { path, .. } => {
                let mut fixes = vec!["Reset the settings to default using: `nx config reset`".to_string()];
                if let Some(p) = path {
                    fixes.push(format!("Inspect the syntax of your configuration file: {}", p));
                }
                fixes
            }
            NexoraError::ModelError { .. } => vec![
                "Check your active profile configurations via `nx config list`.".to_string(),
                "Provide a valid API key in environment variables (e.g. `export GEMINI_API_KEY=...`).".to_string(),
            ],
            NexoraError::WorkspaceError { .. } => vec![
                "Change directories to a valid codebase workspace root.".to_string(),
                "Initialize the folder using `git init` or create project manifests.".to_string(),
            ],
            NexoraError::PluginError { plugin_id, .. } => vec![
                format!("Reinstall the plugin using: `nx plugin install {}`", plugin_id),
                "Verify plugin trust policies in the global `config.toml` file.".to_string(),
            ],
            NexoraError::CacheError { .. } => vec![
                "Clean the caching database: `nx cache clean`".to_string(),
                "Verify writing permissions inside `~/.cache/nexora/`.".to_string(),
            ],
            NexoraError::ShellError { .. } => vec![
                "Ensure command-line completions are initialized correctly: `nx init zsh` or similar.".to_string(),
                "Run the installation script manually with custom shell script redirects.".to_string(),
            ],
            NexoraError::CommandError { .. } => vec![
                "Check the log file output: `nx doctor`".to_string(),
                "Submit an issue with command trace flags enabled: `NEXORA_LOG=trace nx <command>`".to_string(),
            ],
        }
    }

    pub fn doc_link(&self) -> String {
        let anchor = match self.code() {
            ErrorCode::NX001 => "err-ipc-001",
            ErrorCode::NX002 => "err-permission-002",
            ErrorCode::NX003 => "err-config-003",
            ErrorCode::NX004 => "err-model-004",
            ErrorCode::NX005 => "err-workspace-005",
            ErrorCode::NX006 => "err-plugin-006",
            ErrorCode::NX007 => "err-cache-007",
            ErrorCode::NX008 => "err-shell-008",
            ErrorCode::NX009 => "err-command-009",
        };
        format!("https://nexora.dev/docs/errors#{}", anchor)
    }

    pub fn print_and_exit(&self) -> ! {
        let code_str = format!("{:?}", self.code());
        eprintln!("\n  {} {}", "Error:".red().bold(), self.to_string().bold());
        eprintln!("  {} {}\n", "Code:".cyan().bold(), code_str.cyan());

        let causes = self.possible_causes();
        if !causes.is_empty() {
            eprintln!("  {}", "Possible Causes:".yellow().bold());
            for cause in causes {
                eprintln!("    • {}", cause);
            }
            eprintln!();
        }

        let fixes = self.suggested_fixes();
        if !fixes.is_empty() {
            eprintln!("  {}", "Suggested Fixes:".green().bold());
            for fix in fixes {
                eprintln!("    • {}", fix);
            }
            eprintln!();
        }

        eprintln!("  {}", "Documentation:".blue().bold());
        eprintln!("    {}\n", self.doc_link().underline());

        std::process::exit(self.code() as i32 + 1);
    }
}
