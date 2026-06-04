//! # Terminal Session Management
//!
//! Provides the high-level [`TerminalSession`] type (which binds a PTY to a
//! shell) and the [`SessionManager`] that acts as the central registry of
//! active sessions.
//!
//! The [`SessionManager`] is intended to be stored as Tauri *managed state*
//! (`tauri::State<SessionManager>`) so that IPC command handlers can access it
//! without any global mutable statics.

use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;
use uuid::Uuid;
use tauri::Emitter;

use super::pty::PtySession;
use super::shell::ShellInfo;

/// A single terminal session combining a PTY with its shell metadata.
pub struct TerminalSession {
    /// Unique session identifier (UUID v4).
    pub id: String,
    /// The underlying PTY session.
    pub pty_session: PtySession,
    /// Information about the shell running in this session.
    pub shell_info: ShellInfo,
    /// Timestamp of when the session was created.
    pub created_at: SystemTime,
}

/// Serialisable snapshot of a [`TerminalSession`] for returning over IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub shell_name: String,
    pub shell_path: String,
    pub created_at_epoch_ms: u64,
}

impl TerminalSession {
    /// Create a cheap serialisable snapshot of this session.
    pub fn info(&self) -> SessionInfo {
        let epoch_ms = self
            .created_at
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        SessionInfo {
            id: self.id.clone(),
            shell_name: self.shell_info.name.clone(),
            shell_path: self.shell_info.path.display().to_string(),
            created_at_epoch_ms: epoch_ms,
        }
    }
}

/// Thread-safe registry of active terminal sessions.
///
/// Wrap this in `tauri::State<SessionManager>` to make it available to all
/// IPC command handlers.
pub struct SessionManager {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

impl SessionManager {
    /// Create a new, empty session manager.
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Create a new terminal session with the given shell and working directory.
    ///
    /// # Arguments
    ///
    /// * `app`        – Tauri application handle to emit output events.
    /// * `shell_info` – The shell to spawn.
    /// * `cwd`        – Initial working directory.
    /// * `rows`       – Initial terminal height in rows.
    /// * `cols`       – Initial terminal width in columns.
    ///
    /// # Returns
    ///
    /// The session ID on success, or an error string on failure.
    pub fn create_session(
        &self,
        app: tauri::AppHandle,
        shell_info: ShellInfo,
        cwd: PathBuf,
        rows: u16,
        cols: u16,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();

        let pty_session = PtySession::spawn_shell(
            id.clone(),
            shell_info.path.to_str().unwrap_or_default(),
            cwd,
            rows,
            cols,
        )?;

        let reader = pty_session.take_reader();

        let session = TerminalSession {
            id: id.clone(),
            pty_session,
            shell_info,
            created_at: SystemTime::now(),
        };

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Session lock poisoned: {e}"))?;

        info!("Created terminal session {}", id);
        sessions.insert(id.clone(), session);

        // Spawn PTY output forwarding thread
        if let Some(mut r) = reader {
            let session_id_clone = id.clone();
            std::thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match r.read(&mut buf) {
                        Ok(0) => {
                            info!("PTY reader EOF for session {}", session_id_clone);
                            break;
                        }
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                            #[derive(Clone, Serialize)]
                            struct OutputPayload {
                                #[serde(rename = "sessionId")]
                                session_id: String,
                                data: String,
                            }
                            let _ = app.emit("terminal-output", OutputPayload {
                                session_id: session_id_clone.clone(),
                                data,
                            });
                        }
                        Err(e) => {
                            warn!("Error reading PTY for session {}: {}", session_id_clone, e);
                            break;
                        }
                    }
                }
            });
        }

        Ok(id)
    }

    /// Destroy (kill and remove) a terminal session.
    ///
    /// Returns `Ok(())` if the session was found and removed, or an error
    /// string if the session ID is unknown.
    pub fn destroy_session(&self, id: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Session lock poisoned: {e}"))?;

        match sessions.remove(id) {
            Some(session) => {
                // Dropping the PtySession triggers its Drop impl, which kills the child.
                info!("Destroyed terminal session {}", id);
                drop(session);
                Ok(())
            }
            None => {
                warn!("Attempted to destroy unknown session {}", id);
                Err(format!("Session not found: {id}"))
            }
        }
    }

    /// Borrow a session by ID and execute a closure against it.
    ///
    /// This keeps the lock scope narrow — the closure runs while the lock is
    /// held and the result is returned immediately.
    ///
    /// # Errors
    ///
    /// Returns an error string if the session is not found or the lock is
    /// poisoned.
    pub fn with_session<F, R>(&self, id: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&TerminalSession) -> Result<R, String>,
    {
        let sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Session lock poisoned: {e}"))?;

        match sessions.get(id) {
            Some(session) => f(session),
            None => Err(format!("Session not found: {id}")),
        }
    }

    /// List all active sessions as serialisable snapshots.
    pub fn list_sessions(&self) -> Result<Vec<SessionInfo>, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Session lock poisoned: {e}"))?;

        Ok(sessions.values().map(|s| s.info()).collect())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}
