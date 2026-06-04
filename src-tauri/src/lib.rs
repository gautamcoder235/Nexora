//! # Multi Vibe — Application Entry Point
//!
//! This is the root library crate for the Multi Vibe Tauri backend.  It wires
//! together all subsystem modules, registers Tauri IPC command handlers, and
//! initialises managed state and plugins.

// -- Module declarations ----------------------------------------------------

/// Pseudo-terminal management, shell detection, and session lifecycle.
pub mod terminal;

/// AI coding agent detection and orchestration.
pub mod agents;

/// Workspace memory and context management (placeholder).
pub mod memory;

/// Tauri IPC command handlers exposed to the frontend.
pub mod commands;

// -- Imports ----------------------------------------------------------------

use commands::{
    create_terminal_session, destroy_terminal_session, detect_agents, list_shells,
    resize_terminal, write_terminal,
};
use terminal::session::SessionManager;

// -- Tauri entry point ------------------------------------------------------

/// Configure and launch the Tauri application.
///
/// This function:
///
/// 1. Initialises the logger (`env_logger`).
/// 2. Creates the [`SessionManager`] and registers it as Tauri managed state.
/// 3. Registers all IPC command handlers.
/// 4. Initialises bundled Tauri plugins.
/// 5. Starts the event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialise logging — set `RUST_LOG=debug` for verbose output.
    env_logger::init();

    log::info!("Starting Multi Vibe backend");

    tauri::Builder::default()
        // -- Managed state --------------------------------------------------
        .manage(SessionManager::new())
        // -- Plugins --------------------------------------------------------
        .plugin(tauri_plugin_opener::init())
        // -- IPC command handlers -------------------------------------------
        .invoke_handler(tauri::generate_handler![
            create_terminal_session,
            list_shells,
            write_terminal,
            resize_terminal,
            destroy_terminal_session,
            detect_agents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Multi Vibe application");
}
