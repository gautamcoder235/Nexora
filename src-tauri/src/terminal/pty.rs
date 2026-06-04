//! # PTY Management
//!
//! Manages pseudo-terminal sessions using the [`portable_pty`] crate.
//!
//! ## Design Notes — Adapting Warp's PTY Approach
//!
//! Modern terminals like Warp treat each PTY session as an isolated unit that
//! owns three resources:
//!
//! 1. **A master file-descriptor** – the host-side handle used to read output
//!    from and write input to the child process.
//! 2. **A child process** – the shell (or arbitrary command) running inside the
//!    PTY.
//! 3. **Session metadata** – an opaque identifier, the shell path, the working
//!    directory, and the current terminal dimensions.
//!
//! We mirror this design with [`PtySession`]. The master FD is wrapped by
//! `portable_pty::MasterPty` (which abstracts over platform-specific APIs such
//! as `openpty` on Unix and `ConPTY` on Windows). The child process is held as
//! a boxed `portable_pty::Child`.
//!
//! Warp further decouples *reading* from *writing* by cloning the master FD
//! into a separate reader handle that can be moved to a background thread.  We
//! follow the same pattern: [`PtySession::take_reader`] extracts a
//! `Box<dyn Read + Send>` that the caller can poll on a dedicated thread,
//! forwarding output to the frontend via Tauri events.

use log::{debug, error, info};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;

/// Metadata attached to every PTY session.
#[derive(Debug, Clone)]
pub struct PtyMeta {
    /// A unique identifier for this session (typically a UUID).
    pub id: String,
    /// The shell binary that was spawned (e.g. `powershell.exe`, `/bin/bash`).
    pub shell: String,
    /// The initial working directory of the shell.
    pub cwd: PathBuf,
}

/// A single PTY session.
///
/// Owns the master-side handle, the child process, and an optional reader
/// handle that can be detached for background output polling.
pub struct PtySession {
    /// The master (host-side) PTY handle used for writing input and resizing.
    master: Box<dyn MasterPty + Send>,
    /// The writer half of the master, wrapped in a mutex for thread safety.
    writer: Mutex<Box<dyn Write + Send>>,
    /// The child process running inside the PTY.
    child: Mutex<Box<dyn Child + Send + Sync>>,
    /// An optional reader handle.  [`take_reader`] moves this out so it can be
    /// driven on a background thread.
    reader: Mutex<Option<Box<dyn Read + Send>>>,
    /// Descriptive metadata.
    pub meta: PtyMeta,
}

impl PtySession {
    // -- Construction --------------------------------------------------------

    /// Spawn a new shell process inside a fresh PTY.
    ///
    /// # Arguments
    ///
    /// * `id`    – A unique session identifier (e.g. a UUID string).
    /// * `shell` – Absolute path to the shell binary.
    /// * `cwd`   – The initial working directory for the shell.
    /// * `rows`  – Initial number of terminal rows.
    /// * `cols`  – Initial number of terminal columns.
    ///
    /// # Errors
    ///
    /// Returns an error string if the PTY pair cannot be created or the shell
    /// process fails to start.
    pub fn spawn_shell(
        id: String,
        shell: &str,
        cwd: PathBuf,
        rows: u16,
        cols: u16,
    ) -> Result<Self, String> {
        info!(
            "Spawning PTY session id={} shell={} cwd={} size={}x{}",
            id,
            shell,
            cwd.display(),
            cols,
            rows
        );

        let pty_system = native_pty_system();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        // Open a new PTY pair (master + slave).
        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY pair: {e}"))?;

        // Build the command that will run inside the slave side of the PTY.
        let mut cmd = CommandBuilder::new(shell);
        cmd.cwd(&cwd);

        // On Windows, PowerShell benefits from disabling the logo banner.
        #[cfg(target_os = "windows")]
        {
            let shell_lower = shell.to_lowercase();
            if shell_lower.contains("powershell") || shell_lower.contains("pwsh") {
                cmd.arg("-NoLogo");
            }
        }

        // Spawn the child process on the slave side.
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell process: {e}"))?;

        debug!("Child process spawned successfully for session {}", id);

        // Obtain a reader handle from the master (used for reading shell output).
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

        // Obtain a writer handle from the master (used for sending input).
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

        Ok(Self {
            master: pair.master,
            writer: Mutex::new(writer),
            child: Mutex::new(child),
            reader: Mutex::new(Some(reader)),
            meta: PtyMeta {
                id,
                shell: shell.to_string(),
                cwd,
            },
        })
    }

    // -- I/O ----------------------------------------------------------------

    /// Write raw bytes to the PTY (i.e. send keyboard input to the shell).
    ///
    /// # Errors
    ///
    /// Returns an error string if the write fails (e.g. the child has exited).
    pub fn write_to_pty(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|e| format!("Writer lock poisoned: {e}"))?;
        writer
            .write_all(data)
            .map_err(|e| format!("Failed to write to PTY: {e}"))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY writer: {e}"))?;
        Ok(())
    }

    /// Take ownership of the reader handle.
    ///
    /// This is designed to be called **once**; the reader is moved to a
    /// background thread that continuously reads shell output and forwards it
    /// to the frontend via Tauri events.
    ///
    /// Returns `None` if the reader has already been taken.
    pub fn take_reader(&self) -> Option<Box<dyn Read + Send>> {
        self.reader
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
    }

    // -- Resize -------------------------------------------------------------

    /// Resize the PTY to the given dimensions.
    ///
    /// This propagates a `SIGWINCH` (Unix) or equivalent notification (Windows
    /// ConPTY) to the child process so it can re-render its output.
    ///
    /// # Errors
    ///
    /// Returns an error string if the resize operation fails.
    pub fn resize_pty(&self, rows: u16, cols: u16) -> Result<(), String> {
        debug!(
            "Resizing PTY session {} to {}x{}",
            self.meta.id, cols, rows
        );

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        self.master
            .resize(size)
            .map_err(|e| format!("Failed to resize PTY: {e}"))
    }

    // -- Lifecycle ----------------------------------------------------------

    /// Attempt to kill the child process.
    ///
    /// This is a best-effort operation; if the child has already exited the
    /// error is logged but not propagated.
    pub fn kill(&self) {
        if let Ok(mut child) = self.child.lock() {
            match child.kill() {
                Ok(()) => info!("Killed child process for session {}", self.meta.id),
                Err(e) => error!(
                    "Failed to kill child for session {}: {e}",
                    self.meta.id
                ),
            }
        }
    }

    /// Check whether the child process has exited.
    pub fn is_alive(&self) -> bool {
        if let Ok(mut child) = self.child.lock() {
            // `try_wait` returns Ok(Some(status)) when the child has exited.
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.kill();
    }
}
