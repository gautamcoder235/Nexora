//! # Agents Module
//!
//! Utilities for detecting and interacting with CLI-based AI coding agents
//! installed on the host system (e.g. Claude Code, Codex, Gemini CLI, Aider).

pub mod detector;

// Re-export the primary public types.
pub use detector::{AgentInfo, AgentType};
