use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

pub mod swarm_agents;
pub mod swarm_changeset;
pub mod swarm_db;
pub mod swarm_events;
pub mod swarm_lifecycle;
pub mod swarm_merge;
pub mod swarm_ownership;
pub mod swarm_queries;
pub mod swarm_validation;
pub mod swarm_worktrees;
use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::time::{Duration, Instant};
use sysinfo::System;

#[derive(Serialize, Clone, Default)]
pub struct BackendMetrics {
    pub pending_bytes: usize,
    pub oldest_pending_age_ms: u64,
    pub events_per_second: u32,
    pub bytes_per_second: usize,
    pub emit_avg_ms: f64,
    pub emit_max_ms: f64,
}

lazy_static::lazy_static! {
    static ref TERMINAL_METRICS: Mutex<HashMap<String, BackendMetrics>> = Mutex::new(HashMap::new());
}

// ==========================================
// Browser Webview State
// ==========================================
const BROWSER_WEBVIEW_LABEL: &str = "browser";

#[derive(Default)]
struct BrowserState {
    created: bool,
    current_url: String,
}

fn browser_webview_bounds(
    main_window: &WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> (Position, Size) {
    let scale_factor = main_window.scale_factor().unwrap_or(1.0);
    let inner_pos = main_window.inner_position().unwrap_or_default();
    let outer_pos = main_window.outer_position().unwrap_or_default();

    // The child window's position is relative to the parent window's outer top-left frame corner.
    // To align it with the client area DOM coordinates (which are relative to inner_position),
    // we must offset by the window decoration size (border width and title bar height):
    let dx = inner_pos.x - outer_pos.x;
    let dy = inner_pos.y - outer_pos.y;

    (
        Position::Physical(PhysicalPosition::new(
            dx + (x * scale_factor).round() as i32,
            dy + (y * scale_factor).round() as i32,
        )),
        Size::Physical(PhysicalSize::new(
            (width * scale_factor).round().max(1.0) as u32,
            (height * scale_factor).round().max(1.0) as u32,
        )),
    )
}

fn log_debug_pos(
    tag: &str,
    main_window: &WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    pos: Position,
    size: Size,
) {
    let scale_factor = main_window.scale_factor().unwrap_or(1.0);
    let inner_pos = main_window.inner_position().unwrap_or_default();
    let outer_pos = main_window.outer_position().unwrap_or_default();
    let msg = format!(
        "[{}] dom_x={}, dom_y={}, dom_w={}, dom_h={}, scale={}, requested_pos={:?}, requested_size={:?}, inner_pos=({}, {}), outer_pos=({}, {})",
        tag, x, y, width, height, scale_factor, pos, size, inner_pos.x, inner_pos.y, outer_pos.x, outer_pos.y
    );
    eprintln!("POSITION_DEBUG: {}", msg);
}

struct BrowserStateWrapper(Mutex<BrowserState>);

// Struct mapping to an active PTY session on the OS
struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send>,
}

// Global thread-safe terminal registry
static PTY_SESSIONS: OnceLock<Mutex<HashMap<String, PtySession>>> = OnceLock::new();

fn get_sessions() -> &'static Mutex<HashMap<String, PtySession>> {
    PTY_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

// Global thread-safe terminal visibility registry
static SESSION_VISIBILITIES: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn get_visibilities() -> &'static Mutex<HashMap<String, String>> {
    SESSION_VISIBILITIES.get_or_init(|| Mutex::new(HashMap::new()))
}

// Global thread-safe system info
static SYSTEM_INFO: OnceLock<Mutex<System>> = OnceLock::new();

fn get_system_info() -> &'static Mutex<System> {
    SYSTEM_INFO.get_or_init(|| {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        Mutex::new(sys)
    })
}

#[derive(serde::Serialize, Clone)]
struct PtyOutput {
    #[serde(rename = "sessionId")]
    session_id: String,
    data: String,
}

#[derive(serde::Serialize, Clone)]
struct PtyExit {
    #[serde(rename = "sessionId")]
    session_id: String,
}

// ==========================================
// PTY Command RPCs
// ==========================================

#[tauri::command]
fn spawn_pty(
    app: AppHandle,
    session_id: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<Option<u32>, String> {
    {
        let sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
        if sessions.len() >= 32 {
            return Err("MAX_PTY_SESSIONS limit (32) reached. Please close some terminals before opening more.".to_string());
        }
    }

    let pty_system = NativePtySystem::default();
    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    // On Windows, CLI commands like `npx`, `aider`, `gemini`, etc., are script wrappers (.cmd, .bat, .ps1).
    // Spawning them directly via CreateProcess yields OS error 193 ("%1 is not a valid Win32 application").
    // We wrap custom commands on Windows inside `cmd.exe /c` so the shell handles script resolution.
    let (shell_cmd, final_args) = if cfg!(target_os = "windows") {
        if let Some(cmd) = command {
            let mut wrapped_args = vec!["/c".to_string(), cmd];
            if let Some(a) = args {
                wrapped_args.extend(a);
            }
            ("cmd.exe".to_string(), wrapped_args)
        } else {
            ("powershell.exe".to_string(), Vec::new())
        }
    } else {
        let cmd = command.unwrap_or_else(|| "/bin/bash".to_string());
        let a = args.unwrap_or_default();
        (cmd, a)
    };

    let mut cmd_builder = CommandBuilder::new(&shell_cmd);
    for arg in final_args {
        cmd_builder.arg(&arg);
    }

    // Set current working directory
    if let Some(cwd_path) = cwd {
        cmd_builder.cwd(&cwd_path);
    }

    // Append environment variables
    if let Some(env_map) = env {
        for (k, v) in env_map {
            cmd_builder.env(&k, &v);
        }
    }

    // Spawn the shell process inside slave PTY
    let child = pair
        .slave
        .spawn_command(cmd_builder)
        .map_err(|e| e.to_string())?;
    let process_id = child.process_id();
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let master = pair.master;

    // Asynchronously poll stdout in a native thread
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();

    // 1. Create a bounded channel with capacity 1024 to create backpressure
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1024);

    // 2. PTY Reader Thread (Blocking)
    let thread_session_id = session_id_clone.clone();
    std::thread::spawn(move || {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut buffer = [0u8; 65536];
            let mut backpressure_events = 0;

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break, // EOF, PTY closed
                    Ok(n) => {
                        // Try to send immediately. If full, backpressure activated!
                        let data = buffer[..n].to_vec();
                        if let Err(tokio::sync::mpsc::error::TrySendError::Full(returned_data)) =
                            tx.try_send(data.clone())
                        {
                            backpressure_events += 1;
                            if backpressure_events % 100 == 1 {
                                println!(
                                    "[Telemetry] Session {} hit backpressure {} times.",
                                    thread_session_id, backpressure_events
                                );
                            }
                            // Fallback to blocking send to ensure zero data loss
                            if tx.blocking_send(returned_data).is_err() {
                                break;
                            }
                        } else if tx.is_closed() {
                            break;
                        }
                    }
                    Err(_) => break, // Reader broken
                }
            }
            if backpressure_events > 0 {
                println!(
                    "[Telemetry] Session {} finished. Experienced backpressure {} times.",
                    thread_session_id, backpressure_events
                );
            }
        }));
    });

    // 3. Batching / Emitter Task (Async)
    tauri::async_runtime::spawn(async move {
        // Setup 60Hz interval (~16.6ms) for Visible, hidden will hoard more
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(16));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        let mut buffer: Vec<u8> = Vec::new();

        // Ensure visibility is registered by default
        get_visibilities()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(session_id_clone.clone(), "Visible".to_string());

        let mut first_chunk_arrival: Option<Instant> = None;
        let mut last_second_reset = Instant::now();
        let mut bytes_this_sec = 0;
        let mut events_this_sec = 0;
        let mut events_per_sec = 0;
        let mut bytes_per_sec = 0;

        let mut emit_durations = Vec::new();

        loop {
            // Update per-second metrics
            if last_second_reset.elapsed().as_millis() >= 1000 {
                events_per_sec = events_this_sec;
                bytes_per_sec = bytes_this_sec;
                events_this_sec = 0;
                bytes_this_sec = 0;
                last_second_reset = Instant::now();
                emit_durations.clear(); // Reset max/avg window every second
            }

            // Sync metrics to global state
            {
                let mut metrics = TERMINAL_METRICS.lock().unwrap_or_else(|e| e.into_inner());
                let m = metrics
                    .entry(session_id_clone.clone())
                    .or_insert_with(BackendMetrics::default);
                m.pending_bytes = buffer.len();
                m.oldest_pending_age_ms = if buffer.is_empty() {
                    0
                } else {
                    first_chunk_arrival
                        .map(|t| t.elapsed().as_millis() as u64)
                        .unwrap_or(0)
                };
                m.events_per_second = events_per_sec;
                m.bytes_per_second = bytes_per_sec;

                if !emit_durations.is_empty() {
                    let sum: u128 = emit_durations
                        .iter()
                        .map(|d: &Duration| d.as_micros())
                        .sum();
                    m.emit_avg_ms = (sum as f64 / emit_durations.len() as f64) / 1000.0;
                    m.emit_max_ms = (emit_durations
                        .iter()
                        .map(|d: &Duration| d.as_micros())
                        .max()
                        .unwrap_or(0) as f64)
                        / 1000.0;
                } else {
                    m.emit_avg_ms = 0.0;
                    m.emit_max_ms = 0.0;
                }
            }

            tokio::select! {
                // Wait for interval tick
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        let vis = get_visibilities().lock().unwrap_or_else(|e| e.into_inner()).get(&session_id_clone).cloned().unwrap_or_else(|| "Visible".to_string());

                        let should_emit = match vis.as_str() {
                            "Visible" => true, // Emit 60Hz
                            "Hidden" | "Background" => buffer.len() > 1024 * 512, // Hoard up to 512KB to save CPU
                            _ => true,
                        };

                        if should_emit {
                            if let Some(dur) = emit_buffer(&app_clone, &session_id_clone, &mut buffer) {
                                emit_durations.push(dur);
                            }
                            first_chunk_arrival = None;
                        }
                    }
                }

                // Wait for new data from PTY
                msg = rx.recv() => {
                    match msg {
                        Some(data) => {
                            if buffer.is_empty() {
                                first_chunk_arrival = Some(Instant::now());
                            }
                            bytes_this_sec += data.len();
                            events_this_sec += 1;

                            buffer.extend(data);

                            // Explicit Backpressure Policy: MAX_BUFFER_SIZE = 10MB per terminal
                            let max_buffer_size = 10 * 1024 * 1024;
                            if buffer.len() > max_buffer_size {
                                let drop_amount = buffer.len() - (max_buffer_size / 2);
                                buffer.drain(0..drop_amount);
                                println!("[Warning] Session {} hit MAX_BUFFER_SIZE. Dropped {} oldest bytes.", session_id_clone, drop_amount);
                            }

                            // Safety threshold for hidden terminals: start emitting if buffer gets too large
                            if buffer.len() > 1024 * 512 {
                                if let Some(dur) = emit_buffer(&app_clone, &session_id_clone, &mut buffer) {
                                    emit_durations.push(dur);
                                }
                                first_chunk_arrival = None;
                            }
                        }
                        None => {
                            // Channel closed (Reader thread exited). Flush remaining & exit.
                            if !buffer.is_empty() {
                                emit_buffer(&app_clone, &session_id_clone, &mut buffer);
                            }

                            // Emit terminal exit notification
                            let _ = app_clone.emit("terminal:exit", PtyExit {
                                session_id: session_id_clone,
                            });
                            break;
                        }
                    }
                }
            }
        }
    });

    // Save PTY session
    let mut sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());

    // 🔥 THE FIX: Explicitly kill the old process before overwriting it.
    // In Rust portable-pty, dropping the Child struct does not kill the OS process.
    // Without this, the orphaned process and its reader thread continue running and
    // emitting `terminal:stdout` events, causing duplicated terminal rendering in the frontend.
    if let Some(mut old_session) = sessions.remove(&session_id) {
        let _ = old_session.child.kill();
    }

    sessions.insert(
        session_id.clone(),
        PtySession {
            writer,
            master,
            child,
        },
    );

    Ok(process_id)
}

// Helper to emit and clear buffer with UTF-8 Splice Safety, up to MAX_CHUNK_SIZE
fn emit_buffer(app: &AppHandle, session_id: &str, buffer: &mut Vec<u8>) -> Option<Duration> {
    if buffer.is_empty() {
        return None;
    }

    let start = Instant::now();
    let max_chunk_size = 256 * 1024; // 256KB limit per payload

    let chunk_len = std::cmp::min(buffer.len(), max_chunk_size);

    // Safety against slicing a multi-byte unicode character
    match std::str::from_utf8(&buffer[..chunk_len]) {
        Ok(valid_str) => {
            let _ = app.emit(
                "terminal:stdout",
                PtyOutput {
                    session_id: session_id.to_string(),
                    data: valid_str.to_string(),
                },
            );
            buffer.drain(..chunk_len);
        }
        Err(e) => {
            let valid_len = e.valid_up_to();
            if valid_len > 0 {
                let valid_str = unsafe { std::str::from_utf8_unchecked(&buffer[..valid_len]) };
                let _ = app.emit(
                    "terminal:stdout",
                    PtyOutput {
                        session_id: session_id.to_string(),
                        data: valid_str.to_string(),
                    },
                );
                buffer.drain(..valid_len); // Leave incomplete bytes for next tick
            } else {
                // If the very first bytes form an incomplete UTF-8 sequence,
                // we must wait for more data to complete it.
                return None;
            }
        }
    }

    Some(start.elapsed())
}

#[tauri::command]
fn get_terminal_metrics() -> HashMap<String, BackendMetrics> {
    TERMINAL_METRICS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[tauri::command]
fn set_terminal_visibility(session_id: String, visibility: String) {
    get_visibilities()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(session_id, visibility);
}

#[tauri::command]
fn write_pty(session_id: String, data: String) -> Result<(), String> {
    let mut sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(session) = sessions.get_mut(&session_id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("PTY Session not found for ID: {}", session_id))
    }
}

#[tauri::command]
fn resize_pty(session_id: String, mut rows: u16, mut cols: u16) -> Result<(), String> {
    // 🛠️ THE FIX: Enforce safety floors for small grid views
    if cols < 2 {
        cols = 2;
    }
    if rows < 1 {
        rows = 1;
    }

    let sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(session) = sessions.get(&session_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        println!(
            "Successfully resized backend PTY '{}' to {}x{}",
            session_id, cols, rows
        );
        Ok(())
    } else {
        Err(format!("PTY Session not found for ID: {}", session_id))
    }
}

#[tauri::command]
fn kill_pty(session_id: String) -> Result<(), String> {
    let mut sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
        Ok(())
    } else {
        Err(format!("PTY Session not found for ID: {}", session_id))
    }
}

#[tauri::command]
fn kill_all_ptys() -> Result<(), String> {
    let mut sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    for (_, mut session) in sessions.drain() {
        let _ = session.child.kill();
    }
    Ok(())
}

// ==========================================
// Workspace Config Storage RPCs
// ==========================================

#[tauri::command]
fn select_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Select Project Folder")
        .pick_folder();

    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

fn get_config_path(app: &AppHandle, filename: &str) -> Result<PathBuf, String> {
    let mut path = app.path().app_config_dir().map_err(|e| e.to_string())?;

    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    path.push(filename);
    Ok(path)
}

#[tauri::command]
fn save_config(app: AppHandle, filename: &str, content: &str) -> Result<(), String> {
    let path = get_config_path(&app, filename)?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_config(app: AppHandle, filename: &str) -> Result<String, String> {
    let path = get_config_path(&app, filename)?;
    if !path.exists() {
        if filename == "session.json" {
            return Ok("{}".to_string());
        }
        return Ok("{}".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn spawn_browser_webview(
    app_handle: AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let parsed_url = url
        .parse::<tauri::Url>()
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let main_window = app_handle
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let (pos, size) = browser_webview_bounds(&main_window, x, y, width, height);

    // If owned webview window already exists, navigate and reposition it.
    if let Some(browser_window) = app_handle.get_webview_window(BROWSER_WEBVIEW_LABEL) {
        browser_window
            .navigate(parsed_url)
            .map_err(|e| e.to_string())?;
        log_debug_pos(
            "reposition_window",
            &main_window,
            x,
            y,
            width,
            height,
            pos,
            size,
        );
        browser_window
            .set_position(pos)
            .map_err(|e| e.to_string())?;
        browser_window.set_size(size).map_err(|e| e.to_string())?;
        browser_window.show().map_err(|e| e.to_string())?;
    } else {
        log_debug_pos("spawn_window", &main_window, x, y, width, height, pos, size);

        let browser_window = WebviewWindowBuilder::new(
            &app_handle,
            BROWSER_WEBVIEW_LABEL,
            WebviewUrl::External(parsed_url),
        )
        .on_page_load(|window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = window.emit("browser-webview-navigation-finished", ());
            }
        })
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(width, height)
        .parent(&main_window)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| format!("Failed to build browser webview window: {}", e))?;

        browser_window
            .set_position(pos)
            .map_err(|e| e.to_string())?;
        browser_window.set_size(size).map_err(|e| e.to_string())?;
    }

    // Update managed state
    if let Some(state) = app_handle.try_state::<BrowserStateWrapper>() {
        if let Ok(mut bs) = state.0.lock() {
            bs.created = true;
            bs.current_url = url;
        }
    }

    Ok(())
}

#[tauri::command]
async fn sync_browser_webview_layout(
    app_handle: AppHandle,
    visible: bool,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let main_window = app_handle
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    if let Some(browser_window) = app_handle.get_webview_window(BROWSER_WEBVIEW_LABEL) {
        if visible {
            let (pos, size) = browser_webview_bounds(&main_window, x, y, width, height);
            log_debug_pos("sync_window", &main_window, x, y, width, height, pos, size);

            browser_window
                .set_position(pos)
                .map_err(|e| e.to_string())?;
            browser_window.set_size(size).map_err(|e| e.to_string())?;
            browser_window.show().map_err(|e| e.to_string())?;
        } else {
            browser_window.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn destroy_browser_webview(app_handle: AppHandle) -> Result<(), String> {
    println!("DEBUG: destroy_browser_webview called");
    if let Some(browser_window) = app_handle.get_webview_window(BROWSER_WEBVIEW_LABEL) {
        println!("DEBUG: Found browser window, calling destroy()");
        match browser_window.destroy() {
            Ok(_) => println!("DEBUG: browser_window.destroy() returned Ok"),
            Err(e) => println!("DEBUG: browser_window.destroy() returned Err: {}", e),
        }
    } else {
        println!("DEBUG: Browser window not found under label '{}'", BROWSER_WEBVIEW_LABEL);
    }
    // Update managed state
    if let Some(state) = app_handle.try_state::<BrowserStateWrapper>() {
        if let Ok(mut bs) = state.0.lock() {
            bs.created = false;
            bs.current_url.clear();
        }
    }
    Ok(())
}

#[tauri::command]
fn open_browser_devtools(app_handle: AppHandle, label: String) -> Result<(), String> {
    #[cfg(any(debug_assertions, feature = "devtools"))]
    if let Some(wv) = app_handle.get_webview(&label) {
        wv.open_devtools();
    }
    Ok(())
}

#[tauri::command]
fn inject_picker_into_webview(app_handle: AppHandle, script: String) -> Result<(), String> {
    if let Some(browser_wv) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
        browser_wv
            .eval(&script)
            .map_err(|e| format!("Failed to inject picker script: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn remove_picker_from_webview(app_handle: AppHandle) -> Result<(), String> {
    if let Some(browser_wv) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
        browser_wv
            .eval("if (window.__nexoraPickerCleanup) { window.__nexoraPickerCleanup(); }")
            .map_err(|e| format!("Failed to remove picker: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn relay_picked_element(app_handle: AppHandle, data: String) -> Result<(), String> {
    app_handle
        .emit("nexora-element-picked", data)
        .map_err(|e| format!("Failed to relay element data: {}", e))?;
    Ok(())
}

#[tauri::command]
fn check_cli_tool(command: String) -> bool {
    let check_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    let mut cmd = std::process::Command::new(check_cmd);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd.arg(&command)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String, // Absolute path
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[tauri::command]
fn list_directory(dir_path: String) -> Result<Vec<FileNode>, String> {
    let path = std::path::Path::new(&dir_path);
    if !path.exists() {
        return Err("Directory does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let entry_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // 🚀 CRITICAL IGNORE RULE: Filter system/dependency dirs for maximum performance
        if file_name == ".git"
            || file_name == "node_modules"
            || file_name == "target"
            || file_name == "dist"
            || file_name == "build"
        {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let is_dir = metadata.is_dir();
        let size = if is_dir { None } else { Some(metadata.len()) };

        entries.push(FileNode {
            name: file_name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            size,
        });
    }

    // Sort: directories first, then files alphabetically (case-insensitive)
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_project_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct SystemMetrics {
    cpu: f32,
    ram_gb: f32,
}

#[tauri::command]
fn get_system_metrics() -> SystemMetrics {
    let mut sys = get_system_info().lock().unwrap_or_else(|e| e.into_inner());
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu = sys.global_cpu_usage();
    let ram_gb = sys.used_memory() as f32 / 1024.0 / 1024.0 / 1024.0;

    SystemMetrics { cpu, ram_gb }
}

#[tauri::command]
fn exit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::env::set_var(
        "TAURI_WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-web-security",
    );
    tauri::Builder::default()
        .manage(BrowserStateWrapper(Mutex::new(BrowserState::default())))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialize Swarm SQLite Database
            if let Err(e) = swarm_db::init_db(app.handle()) {
                eprintln!("Failed to initialize swarm db: {}", e);
                app.handle()
                    .manage(swarm_db::DbState(std::sync::Mutex::new(None)));
            }

            // Start Stalled Agent Watchdog
            swarm_lifecycle::start_agent_watchdog(app.handle().clone());

            // Start Resource Lock Watchdog
            swarm_lifecycle::start_lock_watchdog(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            exit_app,
            spawn_browser_webview,
            sync_browser_webview_layout,
            destroy_browser_webview,
            open_browser_devtools,
            inject_picker_into_webview,
            remove_picker_from_webview,
            relay_picked_element,
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            kill_all_ptys,
            select_folder,
            save_config,
            load_config,
            check_cli_tool,
            read_project_file,
            write_project_file,
            list_directory,
            set_terminal_visibility,
            get_terminal_metrics,
            get_system_metrics,
            swarm_worktrees::validate_git_repository,
            swarm_worktrees::create_worktree,
            swarm_worktrees::remove_worktree,
            swarm_worktrees::cleanup_worktrees,
            swarm_ownership::validate_ownership,
            swarm_ownership::acquire_lock,
            swarm_ownership::release_lock,
            swarm_ownership::heartbeat_lock,
            swarm_ownership::get_resource_locks,
            swarm_lifecycle::start_task_execution,
            swarm_lifecycle::finish_task_execution,
            swarm_lifecycle::recover_swarm_state,
            swarm_lifecycle::spawn_agent_session,
            swarm_lifecycle::debug_simulate_agent_completion,
            swarm_lifecycle::pause_execution,
            swarm_lifecycle::resume_execution,
            swarm_validation::run_validation_async,
            swarm_agents::get_all_agents,
            swarm_agents::register_agent,
            swarm_agents::update_agent_status,
            swarm_queries::get_validation_run,
            swarm_queries::get_artifacts,
            swarm_queries::get_execution_logs,
            swarm_queries::get_execution_metadata,
            swarm_queries::get_merge_candidate,
            swarm_queries::review_merge_candidate,
            swarm_queries::read_artifact,
            // Phase 5: Swarm Control Center
            swarm_queries::list_executions,
            swarm_queries::terminate_execution,
            swarm_queries::get_execution_events,
            swarm_queries::save_execution_draft,
            swarm_queries::list_execution_drafts,
            swarm_queries::discard_execution_draft,
            swarm_queries::list_execution_snapshots,
            swarm_worktrees::revert_execution_snapshot,
            swarm_validation::save_validation_profile,
            swarm_validation::get_validation_profile,
            swarm_merge::apply_merge_candidate,
            swarm_changeset::create_changeset_draft,
            swarm_changeset::add_file_to_changeset,
            swarm_changeset::add_review_comment,
            swarm_changeset::update_file_status,
            swarm_changeset::get_changeset_details,
            swarm_changeset::get_all_changesets,
            swarm_changeset::apply_changeset_transaction,
            swarm_changeset::rollback_changeset,
            swarm_changeset::validate_changeset_shadow
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
