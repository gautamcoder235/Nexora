//! # Terminal IPC Commands
//!
//! Tauri command handlers for terminal session lifecycle and I/O.
//! All functions are annotated with `#[tauri::command]` and access the
//! [`SessionManager`] via Tauri managed state.

use log::info;
use std::path::PathBuf;
use tauri::State;

use crate::terminal::session::SessionManager;
use crate::terminal::shell::{self, ShellInfo};

/// Create a new terminal session.
///
/// If no `cwd` is provided the current working directory of the Tauri process
/// is used.  If no shell is specified the platform default is detected
/// automatically.
///
/// # Returns
///
/// The unique session ID (UUID v4) as a string.
#[tauri::command]
pub fn create_terminal_session(
    app: tauri::AppHandle,
    state: State<'_, SessionManager>,
    cwd: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<String, String> {
    info!("IPC: create_terminal_session");

    let shell_info = shell::detect_default_shell()?;

    let working_dir = match cwd {
        Some(dir) => PathBuf::from(dir),
        None => std::env::current_dir()
            .map_err(|e| format!("Failed to determine current directory: {e}"))?,
    };

    let rows = rows.unwrap_or(24);
    let cols = cols.unwrap_or(80);

    state.create_session(app, shell_info, working_dir, rows, cols)
}

/// List all shells available on the host system.
///
/// # Returns
///
/// A JSON-serialisable list of [`ShellInfo`] structs.
#[tauri::command]
pub fn list_shells() -> Vec<ShellInfo> {
    info!("IPC: list_shells");
    shell::detect_available_shells()
}

/// Write data to a terminal session's PTY.
///
/// # Arguments
///
/// * `session_id` – The target session's UUID.
/// * `data`       – The raw string data to send.
#[tauri::command]
pub fn write_terminal(
    state: State<'_, SessionManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state.with_session(&session_id, |session| {
        session.pty_session.write_to_pty(data.as_bytes())
    })
}

/// Resize a terminal session's PTY.
///
/// # Arguments
///
/// * `session_id` – The target session's UUID.
/// * `rows`       – New height in rows.
/// * `cols`       – New width in columns.
#[tauri::command]
pub fn resize_terminal(
    state: State<'_, SessionManager>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.with_session(&session_id, |session| {
        session.pty_session.resize_pty(rows, cols)
    })
}

/// Destroy (kill and remove) a terminal session.
///
/// # Arguments
///
/// * `session_id` – The target session's UUID.
#[tauri::command]
pub fn destroy_terminal_session(
    state: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    info!("IPC: destroy_terminal_session {}", session_id);
    state.destroy_session(&session_id)
}
