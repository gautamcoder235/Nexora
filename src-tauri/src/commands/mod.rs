//! # Tauri IPC Commands
//!
//! This module groups all `#[tauri::command]` handler functions exposed to the
//! frontend via Tauri's IPC bridge.
//!
//! Each submodule corresponds to a logical domain:
//!
//! - **`terminal_cmds`** – Terminal session lifecycle and I/O.
//! - **`agent_cmds`**    – CLI agent detection and management.

pub mod agent_cmds;
pub mod terminal_cmds;

// Re-export all command functions so they can be registered in a single
// `tauri::generate_handler![]` invocation.
pub use agent_cmds::detect_agents;
pub use terminal_cmds::{
    create_terminal_session, destroy_terminal_session, list_shells, resize_terminal,
    write_terminal,
};
