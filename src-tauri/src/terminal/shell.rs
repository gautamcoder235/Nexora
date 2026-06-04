//! # Shell Detection
//!
//! Cross-platform utilities for discovering which shells are available on the
//! host system and determining the user's default shell.

use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// The type (family) of a shell.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ShellType {
    /// Windows PowerShell (`powershell.exe`) or PowerShell Core (`pwsh`).
    PowerShell,
    /// Windows Command Prompt (`cmd.exe`).
    Cmd,
    /// Bourne Again Shell.
    Bash,
    /// Z Shell.
    Zsh,
    /// Friendly Interactive Shell.
    Fish,
    /// Windows Subsystem for Linux bridge (`wsl.exe`).
    Wsl,
}

impl std::fmt::Display for ShellType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ShellType::PowerShell => write!(f, "PowerShell"),
            ShellType::Cmd => write!(f, "CMD"),
            ShellType::Bash => write!(f, "Bash"),
            ShellType::Zsh => write!(f, "Zsh"),
            ShellType::Fish => write!(f, "Fish"),
            ShellType::Wsl => write!(f, "WSL"),
        }
    }
}

/// Information about a discovered shell.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellInfo {
    /// Human-readable display name (e.g. "PowerShell", "Bash").
    pub name: String,
    /// Absolute path to the shell binary.
    pub path: PathBuf,
    /// The shell family.
    pub shell_type: ShellType,
}

/// Detect the user's default shell.
///
/// **Unix** – reads the `SHELL` environment variable, falls back to `/bin/sh`.
///
/// **Windows** – defaults to PowerShell (`pwsh` if available, otherwise
/// `powershell.exe`).
///
/// # Returns
///
/// A [`ShellInfo`] describing the default shell, or an error string if
/// detection fails completely.
pub fn detect_default_shell() -> Result<ShellInfo, String> {
    info!("Detecting default shell");

    #[cfg(unix)]
    {
        // On Unix the canonical source of truth is the SHELL environment variable.
        if let Ok(shell_path) = std::env::var("SHELL") {
            let path = PathBuf::from(&shell_path);
            let shell_type = classify_shell_path(&path);
            let name = shell_type.to_string();
            debug!("Default shell from $SHELL: {}", shell_path);
            return Ok(ShellInfo {
                name,
                path,
                shell_type,
            });
        }

        // Fallback: /bin/sh should always exist.
        warn!("$SHELL not set, falling back to /bin/sh");
        Ok(ShellInfo {
            name: "Bash".to_string(),
            path: PathBuf::from("/bin/sh"),
            shell_type: ShellType::Bash,
        })
    }

    #[cfg(windows)]
    {
        // Prefer PowerShell Core (pwsh) if it is on PATH, otherwise fall back
        // to the built-in Windows PowerShell.
        if let Ok(pwsh_path) = which::which("pwsh") {
            debug!("Default shell: pwsh at {}", pwsh_path.display());
            return Ok(ShellInfo {
                name: "PowerShell".to_string(),
                path: pwsh_path,
                shell_type: ShellType::PowerShell,
            });
        }

        if let Ok(ps_path) = which::which("powershell") {
            debug!("Default shell: powershell at {}", ps_path.display());
            return Ok(ShellInfo {
                name: "PowerShell".to_string(),
                path: ps_path,
                shell_type: ShellType::PowerShell,
            });
        }

        // Last resort: cmd.exe.
        warn!("PowerShell not found, falling back to cmd.exe");
        Ok(ShellInfo {
            name: "CMD".to_string(),
            path: PathBuf::from("cmd.exe"),
            shell_type: ShellType::Cmd,
        })
    }
}

/// Discover all shells installed on the host.
///
/// Iterates over a well-known set of shell binary names, using the [`which`]
/// crate to resolve each one against `PATH`.
///
/// # Returns
///
/// A `Vec<ShellInfo>` containing every shell that could be located.
pub fn detect_available_shells() -> Vec<ShellInfo> {
    info!("Scanning for available shells");

    /// (binary name, human-readable label, ShellType)
    #[cfg(windows)]
    const CANDIDATES: &[(&str, &str, ShellType)] = &[
        ("pwsh", "PowerShell Core", ShellType::PowerShell),
        ("powershell", "Windows PowerShell", ShellType::PowerShell),
        ("cmd", "Command Prompt", ShellType::Cmd),
        ("bash", "Git Bash", ShellType::Bash),
        ("wsl", "WSL", ShellType::Wsl),
    ];

    #[cfg(unix)]
    const CANDIDATES: &[(&str, &str, ShellType)] = &[
        ("bash", "Bash", ShellType::Bash),
        ("zsh", "Zsh", ShellType::Zsh),
        ("fish", "Fish", ShellType::Fish),
        ("pwsh", "PowerShell Core", ShellType::PowerShell),
    ];

    let mut shells = Vec::new();

    for &(binary, label, ref shell_type) in CANDIDATES {
        match which::which(binary) {
            Ok(path) => {
                debug!("Found shell '{}' at {}", label, path.display());
                shells.push(ShellInfo {
                    name: label.to_string(),
                    path,
                    shell_type: shell_type.clone(),
                });
            }
            Err(_) => {
                debug!("Shell '{}' ({}) not found on PATH", label, binary);
            }
        }
    }

    info!("Detected {} available shell(s)", shells.len());
    shells
}

// -- Helpers ----------------------------------------------------------------

/// Classify a shell binary path into a [`ShellType`] based on its file name.
#[allow(dead_code)]
fn classify_shell_path(path: &PathBuf) -> ShellType {
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    match name.as_str() {
        "pwsh" | "powershell" => ShellType::PowerShell,
        "cmd" => ShellType::Cmd,
        "bash" | "sh" => ShellType::Bash,
        "zsh" => ShellType::Zsh,
        "fish" => ShellType::Fish,
        "wsl" => ShellType::Wsl,
        _ => ShellType::Bash, // sensible default
    }
}
