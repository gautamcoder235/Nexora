//! # Agent IPC Commands
//!
//! Tauri command handlers for AI coding agent detection and management.

use log::info;

use crate::agents::detector::{self, AgentInfo};

/// Scan the host system for installed CLI coding agents.
///
/// Checks `PATH` for known agent binaries (Claude Code, Codex, Gemini CLI,
/// Aider) and attempts to read their version via `--version`.
///
/// # Returns
///
/// A JSON-serialisable list of [`AgentInfo`] structs.
#[tauri::command]
pub fn detect_agents() -> Vec<AgentInfo> {
    info!("IPC: detect_agents");
    detector::detect_installed_agents()
}
