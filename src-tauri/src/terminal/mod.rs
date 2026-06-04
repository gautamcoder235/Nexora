//! # Terminal Module
//!
//! Provides pseudo-terminal (PTY) management, shell detection, and session
//! lifecycle for the Multi Vibe integrated terminal.
//!
//! ## Architecture
//!
//! The terminal subsystem is split into three layers:
//!
//! - **`pty`** – Low-level PTY spawning, I/O, and resize operations via `portable-pty`.
//! - **`shell`** – Cross-platform shell detection and enumeration.
//! - **`session`** – High-level session management that ties a PTY to a shell and
//!   exposes the result through Tauri managed state.

pub mod pty;
pub mod session;
pub mod shell;

// Re-export the primary public types for ergonomic imports.
pub use pty::PtySession;
pub use session::{SessionManager, TerminalSession};
pub use shell::{ShellInfo, ShellType};
