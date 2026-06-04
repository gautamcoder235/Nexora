//! # CLI Agent Detection
//!
//! Scans the host system's `PATH` for known AI coding agent CLIs and gathers
//! metadata (binary path, version string) for each one found.

use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

/// The family of a detected AI coding agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentType {
    /// Anthropic's Claude Code CLI.
    ClaudeCode,
    /// OpenAI's Codex CLI.
    Codex,
    /// Google's Gemini CLI.
    GeminiCli,
    /// Paul Gauthier's Aider.
    Aider,
    /// An unrecognised agent.
    Other,
}

impl std::fmt::Display for AgentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentType::ClaudeCode => write!(f, "Claude Code"),
            AgentType::Codex => write!(f, "Codex"),
            AgentType::GeminiCli => write!(f, "Gemini CLI"),
            AgentType::Aider => write!(f, "Aider"),
            AgentType::Other => write!(f, "Other"),
        }
    }
}

/// Metadata about a detected CLI agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    /// Human-readable name of the agent.
    pub name: String,
    /// Absolute path to the agent binary.
    pub binary_path: PathBuf,
    /// Version string (e.g. `"1.2.3"`), or `None` if version detection failed.
    pub version: Option<String>,
    /// The agent family.
    pub agent_type: AgentType,
}

/// Well-known CLI agents and their corresponding binary names.
///
/// Each entry is `(binary_name, display_name, AgentType)`.
const KNOWN_AGENTS: &[(&str, &str, AgentType)] = &[
    ("claude", "Claude Code", AgentType::ClaudeCode),
    ("codex", "Codex", AgentType::Codex),
    ("gemini", "Gemini CLI", AgentType::GeminiCli),
    ("aider", "Aider", AgentType::Aider),
];

/// Scan the system `PATH` for all known CLI coding agents.
///
/// For each agent found the function also attempts to run `<binary> --version`
/// to capture the version string.
///
/// # Returns
///
/// A `Vec<AgentInfo>` — one entry per detected agent. Agents that are not
/// installed are silently omitted.
pub fn detect_installed_agents() -> Vec<AgentInfo> {
    info!("Scanning for installed CLI coding agents");

    let mut agents = Vec::new();

    for &(binary, display_name, ref agent_type) in KNOWN_AGENTS {
        match which::which(binary) {
            Ok(path) => {
                debug!("Found agent '{}' at {}", display_name, path.display());

                let version = query_version(&path);
                if let Some(ref v) = version {
                    debug!("{} version: {}", display_name, v);
                }

                agents.push(AgentInfo {
                    name: display_name.to_string(),
                    binary_path: path,
                    version,
                    agent_type: agent_type.clone(),
                });
            }
            Err(_) => {
                debug!("Agent '{}' ({}) not found on PATH", display_name, binary);
            }
        }
    }

    info!("Detected {} installed agent(s)", agents.len());
    agents
}

/// Run `<binary> --version` and attempt to extract a clean version string.
///
/// Returns `None` if the command fails or produces no parseable output.
fn query_version(binary_path: &PathBuf) -> Option<String> {
    let output = Command::new(binary_path)
        .arg("--version")
        .output()
        .map_err(|e| {
            warn!(
                "Failed to run --version for {}: {e}",
                binary_path.display()
            );
            e
        })
        .ok()?;

    let raw = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).to_string()
    } else {
        // Some tools print version info to stderr.
        String::from_utf8_lossy(&output.stderr).to_string()
    };

    // Take only the first line and trim whitespace.
    let version_line = raw.lines().next().unwrap_or("").trim().to_string();

    if version_line.is_empty() {
        None
    } else {
        Some(version_line)
    }
}
