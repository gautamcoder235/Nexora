pub mod hidden_command;
pub mod memory;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};
use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::time::{Duration, Instant};
use sysinfo::System;

pub mod database;
pub mod drivers;
pub mod ucte;

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
    static ref PTY_LAST_OUTPUT: Mutex<HashMap<String, (Instant, Option<String>, Option<String>)>> = Mutex::new(HashMap::new());
    static ref POWERSHELL_POOL: Mutex<Vec<PtySession>> = Mutex::new(Vec::new());
    static ref CMD_POOL: Mutex<Vec<PtySession>> = Mutex::new(Vec::new());
    static ref BASH_POOL: Mutex<Vec<PtySession>> = Mutex::new(Vec::new());
    static ref ZSH_POOL: Mutex<Vec<PtySession>> = Mutex::new(Vec::new());
    static ref PERF_TIMINGS: Mutex<HashMap<String, u64>> = Mutex::new(HashMap::new());
}

pub fn record_perf_timing(key: &str, duration_ms: u64) {
    if let Ok(mut map) = PERF_TIMINGS.lock() {
        map.insert(key.to_string(), duration_ms);
        println!("[Telemetry] Latency measurement: {} = {}ms", key, duration_ms);
    }
}

pub fn update_pty_heartbeat(session_id: &str, project_path: Option<String>, task_id: Option<String>) {
    if let Ok(mut map) = PTY_LAST_OUTPUT.lock() {
        map.insert(session_id.to_string(), (Instant::now(), project_path, task_id));
    }
}

pub fn remove_pty_heartbeat(session_id: &str) {
    if let Ok(mut map) = PTY_LAST_OUTPUT.lock() {
        map.remove(session_id);
    }
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

pub fn get_active_pty_count() -> usize {
    if let Ok(guard) = get_sessions().lock() {
        guard.len()
    } else {
        0
    }
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
// PTY Command RPCs & Telemetry
// ==========================================

fn create_raw_pty_session(_app: AppHandle, shell_type: &str) -> Result<PtySession, String> {
    let pty_system = NativePtySystem::default();
    let size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let (shell_cmd, final_args) = match shell_type {
        "powershell" => {
            let ps_script = r#"function prompt { $val = if ($global:LastExitCode -ne $null) { $global:LastExitCode } else { 0 }; [Console]::Write("`e]133;D;$val`a"); [Console]::Write("`e]133;A`a"); $orig = "PS $($ExecutionContext.SessionState.Path.CurrentLocation)> "; [Console]::Write("`e]133;B`a"); return $orig }"#;
            ("powershell.exe".to_string(), vec!["-NoExit".to_string(), "-Command".to_string(), ps_script.to_string()])
        }
        "cmd" => {
            ("cmd.exe".to_string(), Vec::new())
        }
        "bash" => {
            // Interactive Bash with OSC 133 semantic zones
            let bash_script = r#"
if [ -f ~/.bashrc ]; then
    . ~/.bashrc
fi
__nexora_prompt_command() {
    local EXIT="$?"
    printf "\x1b]133;D;%s\x07" "$EXIT"
    printf "\x1b]133;A\x07"
}
if [[ -z "$PROMPT_COMMAND" ]]; then
    PROMPT_COMMAND="__nexora_prompt_command"
else
    PROMPT_COMMAND="__nexora_prompt_command; $PROMPT_COMMAND"
fi
__nexora_preexec() {
    if [[ "$BASH_COMMAND" == "__nexora_prompt_command"* ]]; then
        return
    fi
    printf "\x1b]133;B\x07"
    printf "\x1b]133;C\x07"
}
trap '__nexora_preexec' DEBUG
"#;
            let temp_file = std::env::temp_dir().join("nexora_bash_prewarm");
            let _ = std::fs::write(&temp_file, bash_script);
            ("/bin/bash".to_string(), vec!["--init-file".to_string(), temp_file.to_string_lossy().to_string()])
        }
        "zsh" => {
            let zsh_script = r#"
if [ -f ~/.zshrc ]; then
    source ~/.zshrc
fi
__nexora_precmd() {
    local EXIT="$?"
    printf "\x1b]133;D;%s\x07" "$EXIT"
    printf "\x1b]133;A\x07"
}
__nexora_preexec() {
    printf "\x1b]133;B\x07"
    printf "\x1b]133;C\x07"
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd __nexora_precmd
add-zsh-hook preexec __nexora_preexec
"#;
            let temp_dir = std::env::temp_dir().join("nexora_zsh_prewarm");
            let _ = std::fs::create_dir_all(&temp_dir);
            let zshrc_path = temp_dir.join(".zshrc");
            let _ = std::fs::write(&zshrc_path, zsh_script);
            ("/bin/zsh".to_string(), Vec::new())
        }
        _ => return Err(format!("Unknown shell type {}", shell_type)),
    };

    let mut cmd_builder = CommandBuilder::new(&shell_cmd);
    for arg in final_args {
        cmd_builder.arg(&arg);
    }
    
    if shell_type == "zsh" {
        let temp_dir = std::env::temp_dir().join("nexora_zsh_prewarm");
        cmd_builder.env("ZDOTDIR", temp_dir.to_string_lossy().as_ref());
    }

    let child = pair.slave.spawn_command(cmd_builder).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let master = pair.master;

    Ok(PtySession {
        writer,
        master,
        child,
    })
}

fn replenish_pool(app_handle: AppHandle, shell_type: &str) {
    let limit = 1;
    let current_len = match shell_type {
        "powershell" => POWERSHELL_POOL.lock().unwrap().len(),
        "cmd" => CMD_POOL.lock().unwrap().len(),
        "bash" => BASH_POOL.lock().unwrap().len(),
        "zsh" => ZSH_POOL.lock().unwrap().len(),
        _ => return,
    };
    if current_len >= limit {
        return;
    }

    let app_handle_clone = app_handle.clone();
    let shell_type_str = shell_type.to_string();
    tauri::async_runtime::spawn(async move {
        match create_raw_pty_session(app_handle_clone, &shell_type_str) {
            Ok(session) => {
                match shell_type_str.as_str() {
                    "powershell" => POWERSHELL_POOL.lock().unwrap().push(session),
                    "cmd" => CMD_POOL.lock().unwrap().push(session),
                    "bash" => BASH_POOL.lock().unwrap().push(session),
                    "zsh" => ZSH_POOL.lock().unwrap().push(session),
                    _ => {}
                }
            }
            Err(e) => {
                eprintln!("[PTY Pool] Failed to prewarm shell {}: {}", shell_type_str, e);
            }
        }
    });
}

pub fn prewarm_pty_pools(app_handle: AppHandle) {
    let os = std::env::consts::OS;
    if os == "windows" {
        replenish_pool(app_handle.clone(), "powershell");
        replenish_pool(app_handle.clone(), "cmd");
    } else {
        replenish_pool(app_handle.clone(), "bash");
        replenish_pool(app_handle.clone(), "zsh");
    }
}

#[tauri::command]
fn get_perf_timings() -> HashMap<String, u64> {
    PERF_TIMINGS.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

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
    project_path: Option<String>,
    task_id: Option<String>,
) -> Result<Option<u32>, String> {
    spawn_pty_internal(app, session_id, command, args, cwd, env, rows, cols, project_path, task_id)
}

fn start_pty_event_loop(
    app: AppHandle,
    session_id: String,
    mut reader: Box<dyn std::io::Read + Send>,
    project_path: Option<String>,
    task_id: Option<String>,
) {
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();

    // 1. Create a bounded channel with capacity 1024 to create backpressure
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1024);

    // 2. PTY Reader Thread (Blocking)
    let thread_session_id = session_id.clone();
    let thread_project_path = project_path.clone();
    let thread_task_id = task_id.clone();
    std::thread::spawn(move || {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut buffer = [0u8; 65536];
            let mut backpressure_events = 0;

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break, // EOF, PTY closed
                    Ok(n) => {
                        // Hook up PTY output logs directly to logs/builder.log
                        if let (Some(ref p_path), Some(ref t_id)) = (&thread_project_path, &thread_task_id) {
                            let log_file_path = std::path::Path::new(p_path)
                                .join(".nexora")
                                .join("tasks")
                                .join(t_id)
                                .join("logs")
                                .join("builder.log");
                            if let Ok(mut file) = std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(log_file_path)
                            {
                                use std::io::Write;
                                let _ = file.write_all(&buffer[..n]);
                            }
                        }

                        // Update PTY Heartbeat
                        update_pty_heartbeat(&thread_session_id, thread_project_path.clone(), thread_task_id.clone());

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
}

pub fn spawn_pty_internal(
    app: AppHandle,
    session_id: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    rows: Option<u16>,
    cols: Option<u16>,
    project_path: Option<String>,
    task_id: Option<String>,
) -> Result<Option<u32>, String> {
    let start_time = Instant::now();
    {
        let sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
        if sessions.len() >= 32 {
            return Err("MAX_PTY_SESSIONS limit (32) reached. Please close some terminals before opening more.".to_string());
        }
    }

    let mut claimed_session = None;
    let shell_type = if cfg!(target_os = "windows") {
        "powershell"
    } else {
        let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        if user_shell.contains("zsh") {
            "zsh"
        } else {
            "bash"
        }
    };

    // If default interactive shell is requested, pull from typed PTY pool
    if command.is_none() && args.is_none() {
        match shell_type {
            "powershell" => {
                if let Ok(mut p) = POWERSHELL_POOL.lock() {
                    if !p.is_empty() {
                        claimed_session = Some(p.remove(0));
                    }
                }
            }
            "cmd" => {
                if let Ok(mut p) = CMD_POOL.lock() {
                    if !p.is_empty() {
                        claimed_session = Some(p.remove(0));
                    }
                }
            }
            "bash" => {
                if let Ok(mut p) = BASH_POOL.lock() {
                    if !p.is_empty() {
                        claimed_session = Some(p.remove(0));
                    }
                }
            }
            "zsh" => {
                if let Ok(mut p) = ZSH_POOL.lock() {
                    if !p.is_empty() {
                        claimed_session = Some(p.remove(0));
                    }
                }
            }
            _ => {}
        }

        if claimed_session.is_some() {
            println!("[PTY Pool] Claimed prewarmed PTY session for {}", shell_type);
        }

        // Asynchronously replenish pool
        replenish_pool(app.clone(), shell_type);
    }

    let (writer, master, child, process_id) = if let Some(mut session) = claimed_session {
        // Resize master
        let size = PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        };
        let _ = session.master.resize(size);

        // Change directory to cwd if provided
        if let Some(ref cwd_path) = cwd {
            let cd_cmd = if cfg!(target_os = "windows") {
                format!("cd \"{}\"\r\n", cwd_path)
            } else {
                format!("cd \"{}\"\n", cwd_path)
            };
            let _ = session.writer.write_all(cd_cmd.as_bytes());
            let _ = session.writer.flush();
        }

        let pid = session.child.process_id();
        let dur = start_time.elapsed().as_millis() as u64;
        record_perf_timing("PTY Spawning (Warm)", dur);
        (session.writer, session.master, session.child, pid)
    } else {
        // Spawn brand new PTY session (Cold start path)
        let pty_system = NativePtySystem::default();
        let size = PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

        let mut zsh_temp_dir: Option<PathBuf> = None;

        let (shell_cmd, final_args) = if cfg!(target_os = "windows") {
            if let Some(cmd) = command {
                let mut wrapped_args = vec!["/c".to_string(), cmd];
                if let Some(a) = args {
                    wrapped_args.extend(a);
                }
                ("cmd.exe".to_string(), wrapped_args)
            } else {
                let ps_script = r#"function prompt { $val = if ($global:LastExitCode -ne $null) { $global:LastExitCode } else { 0 }; [Console]::Write("`e]133;D;$val`a"); [Console]::Write("`e]133;A`a"); $orig = "PS $($ExecutionContext.SessionState.Path.CurrentLocation)> "; [Console]::Write("`e]133;B`a"); return $orig }"#;
                ("powershell.exe".to_string(), vec!["-NoExit".to_string(), "-Command".to_string(), ps_script.to_string()])
            }
        } else {
            if let Some(cmd) = command {
                (cmd, args.unwrap_or_default())
            } else {
                let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
                if user_shell.contains("zsh") {
                    let zsh_script = r#"
if [ -f ~/.zshrc ]; then
    source ~/.zshrc
fi
__nexora_precmd() {
    local EXIT="$?"
    printf "\x1b]133;D;%s\x07" "$EXIT"
    printf "\x1b]133;A\x07"
}
__nexora_preexec() {
    printf "\x1b]133;B\x07"
    printf "\x1b]133;C\x07"
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd __nexora_precmd
add-zsh-hook preexec __nexora_preexec
"#;
                    let temp_dir = std::env::temp_dir().join(format!("nexora_zsh_{}", session_id));
                    let _ = std::fs::create_dir_all(&temp_dir);
                    let zshrc_path = temp_dir.join(".zshrc");
                    let _ = std::fs::write(&zshrc_path, zsh_script);
                    zsh_temp_dir = Some(temp_dir);
                    (user_shell, Vec::new())
                } else {
                    let bash_script = r#"
if [ -f ~/.bashrc ]; then
    . ~/.bashrc
fi
__nexora_prompt_command() {
    local EXIT="$?"
    printf "\x1b]133;D;%s\x07" "$EXIT"
    printf "\x1b]133;A\x07"
}
if [[ -z "$PROMPT_COMMAND" ]]; then
    PROMPT_COMMAND="__nexora_prompt_command"
else
    PROMPT_COMMAND="__nexora_prompt_command; $PROMPT_COMMAND"
fi
__nexora_preexec() {
    if [[ "$BASH_COMMAND" == "__nexora_prompt_command"* ]]; then
        return
    fi
    printf "\x1b]133;B\x07"
    printf "\x1b]133;C\x07"
}
trap '__nexora_preexec' DEBUG
"#;
                    let temp_file = std::env::temp_dir().join(format!("nexora_bash_{}", session_id));
                    let _ = std::fs::write(&temp_file, bash_script);
                    (user_shell, vec!["--init-file".to_string(), temp_file.to_string_lossy().to_string()])
                }
            }
        };

        let mut cmd_builder = CommandBuilder::new(&shell_cmd);
        for arg in final_args {
            cmd_builder.arg(&arg);
        }

        if let Some(cwd_path) = cwd {
            cmd_builder.cwd(&cwd_path);
        }

        if let Some(env_map) = env {
            for (k, v) in env_map {
                cmd_builder.env(&k, &v);
            }
        }

        if let Some(ref z_dir) = zsh_temp_dir {
            cmd_builder.env("ZDOTDIR", z_dir.to_string_lossy().as_ref());
        }

        let child: Box<dyn Child + Send> = pair.slave.spawn_command(cmd_builder).map_err(|e| e.to_string())?;
        let pid = child.process_id();
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let master = pair.master;

        let dur = start_time.elapsed().as_millis() as u64;
        record_perf_timing("PTY Spawning (Cold)", dur);
        (writer, master, child, pid)
    };

    // Spin up standard stdout event loop
    let reader: Box<dyn std::io::Read + Send> = master.try_clone_reader().map_err(|e| e.to_string())?;
    start_pty_event_loop(app, session_id.clone(), reader, project_path, task_id);

    // Save PTY session inside sessions map
    let mut sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut old_session) = sessions.remove(&session_id) {
        let _ = old_session.child.kill();
    }

    sessions.insert(
        session_id,
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
fn get_pty_process_info(session_id: String) -> Result<serde_json::Value, String> {
    let sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    let session = match sessions.get(&session_id) {
        Some(s) => s,
        None => return Ok(serde_json::json!({
            "has_active_child": false,
            "shell_pid": 0,
            "children": []
        })),
    };

    let shell_pid = match session.child.process_id() {
        Some(pid) => pid,
        None => return Ok(serde_json::json!({
            "has_active_child": false,
            "shell_pid": 0,
            "children": []
        })),
    };

    let mut sys = sysinfo::System::new();
    sys.refresh_all();

    let mut children = Vec::new();
    let mut has_active_child = false;

    let sys_shell_pid = sysinfo::Pid::from(shell_pid as usize);

    for (pid, process) in sys.processes() {
        if let Some(parent_pid) = process.parent() {
            if parent_pid == sys_shell_pid {
                let pid_str = pid.to_string();
                let pid_u32 = pid_str.parse::<u32>().unwrap_or(0);
                
                has_active_child = true;
                children.push(serde_json::json!({
                    "pid": pid_u32,
                    "name": process.name().to_string_lossy().to_string(),
                }));
            }
        }
    }

    Ok(serde_json::json!({
        "has_active_child": has_active_child,
        "shell_pid": shell_pid,
        "children": children
    }))
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
    remove_pty_heartbeat(&session_id);
    let mut sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
        
        let temp_dir_zsh = std::env::temp_dir().join(format!("nexora_zsh_{}", session_id));
        let _ = std::fs::remove_dir_all(temp_dir_zsh);
        let temp_file_bash = std::env::temp_dir().join(format!("nexora_bash_{}", session_id));
        let _ = std::fs::remove_file(temp_file_bash);
        
        Ok(())
    } else {
        Err(format!("PTY Session not found for ID: {}", session_id))
    }
}

#[tauri::command]
fn kill_all_ptys() -> Result<(), String> {
    let mut sessions = get_sessions().lock().unwrap_or_else(|e| e.into_inner());
    for (session_id, mut session) in sessions.drain() {
        let _ = session.child.kill();
        remove_pty_heartbeat(&session_id);
        
        let temp_dir_zsh = std::env::temp_dir().join(format!("nexora_zsh_{}", session_id));
        let _ = std::fs::remove_dir_all(temp_dir_zsh);
        let temp_file_bash = std::env::temp_dir().join(format!("nexora_bash_{}", session_id));
        let _ = std::fs::remove_file(temp_file_bash);
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
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let parsed_url = url
        .parse::<tauri::Url>()
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let main_window = app_handle
        .get_window("main")
        .ok_or("Main window not found")?;

    let pos = tauri::PhysicalPosition::new(x, y);
    let size = tauri::PhysicalSize::new(width, height);

    // If child webview already exists, navigate and reposition/resize it.
    if let Some(browser_wv) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
        let mut should_navigate = true;
        if let Some(state) = app_handle.try_state::<BrowserStateWrapper>() {
            if let Ok(bs) = state.0.lock() {
                if bs.created && bs.current_url == url {
                    should_navigate = false;
                }
            }
        }

        if should_navigate {
            browser_wv
                .navigate(parsed_url)
                .map_err(|e| e.to_string())?;
        }
        browser_wv
            .set_position(pos)
            .map_err(|e| e.to_string())?;
        browser_wv.set_size(size).map_err(|e| e.to_string())?;
    } else {
        let app_handle_clone = app_handle.clone();
        let webview_builder = tauri::webview::WebviewBuilder::new(
            BROWSER_WEBVIEW_LABEL,
            tauri::WebviewUrl::External(parsed_url),
        )
        .on_page_load(move |_, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let url_str = payload.url().as_str().to_string();

                // Update managed state with the navigated URL
                if let Some(state) = app_handle_clone.try_state::<BrowserStateWrapper>() {
                    if let Ok(mut bs) = state.0.lock() {
                        bs.current_url = url_str.clone();
                    }
                }

                let _ = app_handle_clone.emit("browser-webview-url-changed", url_str);
                let _ = app_handle_clone.emit("browser-webview-navigation-finished", ());
            }
        });

        main_window
            .add_child(webview_builder, pos, size)
            .map_err(|e| format!("Failed to add child webview: {}", e))?;
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
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if let Some(browser_wv) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
        if visible {
            let pos = tauri::PhysicalPosition::new(x, y);
            let size = tauri::PhysicalSize::new(width, height);
            browser_wv
                .set_position(pos)
                .map_err(|e| e.to_string())?;
            browser_wv.set_size(size).map_err(|e| e.to_string())?;
        } else {
            // Hide by moving offscreen and setting size to 0
            let pos = tauri::PhysicalPosition::new(-40000, -40000);
            let size = tauri::PhysicalSize::new(0, 0);
            let _ = browser_wv.set_position(pos);
            let _ = browser_wv.set_size(size);
        }
    }
    Ok(())
}

#[tauri::command]
async fn destroy_browser_webview(app_handle: AppHandle) -> Result<(), String> {
    if let Some(browser_wv) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
        // Move offscreen and set size to 0 to simulate destruction/hiding
        let pos = tauri::PhysicalPosition::new(-40000, -40000);
        let size = tauri::PhysicalSize::new(0, 0);
        let _ = browser_wv.set_position(pos);
        let _ = browser_wv.set_size(size);
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
async fn browser_go_back(app_handle: AppHandle) -> Result<(), String> {
    if let Some(browser_wv) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
        browser_wv.eval("window.history.back()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_go_forward(app_handle: AppHandle) -> Result<(), String> {
    if let Some(browser_wv) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
        browser_wv.eval("window.history.forward()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_reload(app_handle: AppHandle) -> Result<(), String> {
    if let Some(browser_wv) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
        browser_wv.eval("window.location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn launch_electron_browser(app_handle: tauri::AppHandle, url: Option<String>) -> Result<(), String> {

    use tokio::io::AsyncWriteExt;
    use std::time::Duration;

    // Check if the control server is already running (hidden in the background)
    if check_electron_ping().await {
        if let Ok(Ok(mut stream)) = tokio::time::timeout(Duration::from_millis(50), tokio::net::TcpStream::connect("127.0.0.1:30120")).await {
            let _ = stream.write_all(b"GET /show HTTP/1.1\r\nHost: 127.0.0.1:30120\r\nConnection: close\r\n\r\n").await;
        }
        
        // If a URL was specified, navigate to it
        if let Some(u) = url.as_ref() {
            if !u.trim().is_empty() {
                if let Ok(Ok(mut stream)) = tokio::time::timeout(Duration::from_millis(50), tokio::net::TcpStream::connect("127.0.0.1:30120")).await {
                    let mut encoded = String::new();
                    for b in u.trim().bytes() {
                        match b {
                            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                                encoded.push(b as char);
                            }
                            _ => {
                                encoded.push_str(&format!("%{:02X}", b));
                            }
                        }
                    }
                    let req = format!(
                        "GET /navigate?url={} HTTP/1.1\r\nHost: 127.0.0.1:30120\r\nConnection: close\r\n\r\n",
                        encoded
                    );
                    let _ = stream.write_all(req.as_bytes()).await;
                }
            }
        }
        return Ok(());
    }
    
    let mut electron_dir = None;

    // 1. Try to check if we are in production resources
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let prod_dir = resource_dir.join("electron-browser");
        if prod_dir.exists() {
            electron_dir = Some(prod_dir);
        } else {
            // Check with "_up_" prefix which Tauri v2 adds for relative directory bundle resources
            let up_dir = resource_dir.join("_up_").join("electron-browser");
            if up_dir.exists() {
                electron_dir = Some(up_dir);
            }
        }
    }

    // 2. Try current working directory pop logic
    if electron_dir.is_none() {
        let mut current_dir = std::env::current_dir().unwrap_or_default();
        if current_dir.ends_with("src-tauri") {
            current_dir.pop();
        }
        let dev_dir = current_dir.join("electron-browser");
        if dev_dir.exists() {
            electron_dir = Some(dev_dir);
        }
    }

    // 3. Try to locate relative to the current executable path
    if electron_dir.is_none() {
        if let Ok(mut exe_dir) = std::env::current_exe() {
            exe_dir.pop(); // Remove file name
            let mut check_dir = exe_dir.clone();
            for _ in 0..4 {
                let check_path = check_dir.join("electron-browser");
                if check_path.exists() {
                    electron_dir = Some(check_path);
                    break;
                }
                check_dir.pop();
            }
        }
    }

    let electron_dir = electron_dir.ok_or_else(|| {
        let cwd = std::env::current_dir().unwrap_or_default();
        let exe = std::env::current_exe().unwrap_or_default();
        let res = app_handle.path().resource_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|e| format!("Error: {}", e));
        format!(
            "Could not locate electron-browser directory. Checked production resources (res: {}), cwd (cwd: {}), and exe path (exe: {}).",
            res, cwd.to_string_lossy(), exe.to_string_lossy()
        )
    })?;

    // Direct Electron executable path based on platform
    let electron_exe = if cfg!(target_os = "windows") {
        electron_dir.join("node_modules").join("electron").join("dist").join("electron.exe")
    } else if cfg!(target_os = "macos") {
        electron_dir.join("node_modules").join("electron").join("dist").join("Electron.app").join("Contents").join("MacOS").join("Electron")
    } else {
        electron_dir.join("node_modules").join("electron").join("dist").join("electron")
    };

    let mut direct_args = vec![".".to_string()];
    if let Some(u) = url.as_ref() {
        if !u.trim().is_empty() {
            direct_args.push("--".to_string());
            direct_args.push(u.trim().to_string());
        }
    }

    if electron_exe.exists() {
        // Direct spawn is sub-100ms and extremely fast
        crate::hidden_command::new_command(electron_exe)
            .args(&direct_args)
            .current_dir(&electron_dir)
            .spawn()
            .map_err(|e| format!("Failed to spawn direct Electron: {}", e))?;
    } else {
        // Fallback to npm start shell execution if node_modules structure is different
        let shell = if cfg!(target_os = "windows") { "cmd" } else { "sh" };
        let shell_arg = if cfg!(target_os = "windows") { "/C" } else { "-c" };
        
        let mut fallback_args = vec![shell_arg.to_string(), "npm start".to_string()];
        if let Some(u) = url {
            if !u.trim().is_empty() {
                fallback_args.push("--".to_string());
                fallback_args.push(u.trim().to_string());
            }
        }

        crate::hidden_command::new_command(shell)
            .args(&fallback_args)
            .current_dir(&electron_dir)
            .spawn()
            .map_err(|e| format!("Failed to launch Electron browser fallback: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn check_electron_ping() -> bool {
    use std::net::SocketAddr;
    use std::time::Duration;
    if let Ok(addr) = "127.0.0.1:30120".parse::<SocketAddr>() {
        match tokio::time::timeout(
            Duration::from_millis(50),
            tokio::net::TcpStream::connect(addr),
        )
        .await
        {
            Ok(Ok(_)) => true,
            _ => false,
        }
    } else {
        false
    }
}

#[tauri::command]
async fn notify_workspace_switch(workspace_id: String) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    use std::time::Duration;
    
    if let Ok(Ok(mut stream)) = tokio::time::timeout(Duration::from_millis(50), tokio::net::TcpStream::connect("127.0.0.1:30120")).await {
        let req = format!(
            "GET /workspace-switch?workspaceId={} HTTP/1.1\r\nHost: 127.0.0.1:30120\r\nConnection: close\r\n\r\n",
            workspace_id
        );
        let _ = stream.write_all(req.as_bytes()).await;
        Ok(())
    } else {
        Err("Electron control server not running".to_string())
    }
}

#[tauri::command]
async fn close_electron_browser() -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    use std::time::Duration;
    
    if let Ok(Ok(mut stream)) = tokio::time::timeout(Duration::from_millis(50), tokio::net::TcpStream::connect("127.0.0.1:30120")).await {
        let _ = stream.write_all(b"GET /close HTTP/1.1\r\nHost: 127.0.0.1:30120\r\nConnection: close\r\n\r\n").await;
        Ok(())
    } else {
        Err("Electron control server not running".to_string())
    }
}

#[tauri::command]
fn open_browser_devtools(_app_handle: AppHandle, _label: String) -> Result<(), String> {
    #[cfg(any(debug_assertions, feature = "devtools"))]
    if let Some(wv) = _app_handle.get_webview(&_label) {
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

    let mut cmd = crate::hidden_command::new_command(check_cmd);

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
fn is_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
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

#[tauri::command]
fn init_project_memory(
    path: String,
    arch_content: String,
    dec_content: String,
    find_content: String,
) -> Result<String, String> {
    let path_normalized = path.replace("\\", "/");
    
    let arch_path = format!("{}/architecture.md", path_normalized);
    if !std::path::Path::new(&arch_path).exists() {
        if let Some(parent) = std::path::Path::new(&arch_path).parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&arch_path, arch_content).map_err(|e| e.to_string())?;
    }
    
    let dec_path = format!("{}/decisions.md", path_normalized);
    if !std::path::Path::new(&dec_path).exists() {
        fs::write(&dec_path, dec_content).map_err(|e| e.to_string())?;
    }
    
    let find_path = format!("{}/findings.md", path_normalized);
    if !std::path::Path::new(&find_path).exists() {
        fs::write(&find_path, find_content).map_err(|e| e.to_string())?;
    }
    
    let tasks_path = format!("{}/tasks.md", path_normalized);
    if std::path::Path::new(&tasks_path).exists() {
        fs::read_to_string(&tasks_path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

#[derive(serde::Serialize)]
struct SystemMetrics {
    cpu: f32,
    ram_gb: f32,
}

fn get_git_branch_fallback(workspace_path: &str) -> Result<String, String> {
    let path = std::path::Path::new(workspace_path).join(".git").join("HEAD");
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(path) {
            let content = content.trim();
            if content.starts_with("ref: ") {
                let parts: Vec<&str> = content.split('/').collect();
                if let Some(branch) = parts.last() {
                    return Ok(branch.to_string());
                }
            } else {
                return Ok(content[..std::cmp::min(7, content.len())].to_string());
            }
        }
    }
    let git_file_path = std::path::Path::new(workspace_path).join(".git");
    if git_file_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&git_file_path) {
            if content.starts_with("gitdir: ") {
                let git_dir_path = content["gitdir: ".len()..].trim();
                let resolved_git_dir = if std::path::Path::new(git_dir_path).is_absolute() {
                    std::path::PathBuf::from(git_dir_path)
                } else {
                    std::path::Path::new(workspace_path).join(git_dir_path)
                };
                let head_path = resolved_git_dir.join("HEAD");
                if head_path.exists() {
                    if let Ok(head_content) = std::fs::read_to_string(head_path) {
                        let head_content = head_content.trim();
                        if head_content.starts_with("ref: ") {
                            let parts: Vec<&str> = head_content.split('/').collect();
                            if let Some(branch) = parts.last() {
                                return Ok(branch.to_string());
                            }
                        } else {
                            return Ok(head_content[..std::cmp::min(7, head_content.len())].to_string());
                        }
                    }
                }
            }
        }
    }
    Err("Not a git repository".to_string())
}

#[tauri::command]
fn get_git_branch(workspace_path: String) -> Result<String, String> {
    let output = crate::hidden_command::new_command("git")
        .args(&["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&workspace_path)
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                let branch = String::from_utf8_lossy(&out.stdout).trim().to_string();
                Ok(branch)
            } else {
                get_git_branch_fallback(&workspace_path)
            }
        }
        Err(_) => {
            get_git_branch_fallback(&workspace_path)
        }
    }
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
    let app = tauri::Builder::default()
        .manage(BrowserStateWrapper(Mutex::new(BrowserState::default())))
        
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Manage DbState with None connection synchronously to prevent Tauri command panics on missing state
            app_handle.manage(database::DbState(std::sync::Mutex::new(None)));
            
            // Asynchronously initialize database using tauri::async_runtime::spawn
            tauri::async_runtime::spawn(async move {
                // Phase 1: Database Initialization
                let start_db = Instant::now();
                let mut connection = None;
                
                // Get path to app data directory
                let db_path = match app_handle.path().app_data_dir() {
                    Ok(path) => path,
                    Err(e) => {
                        eprintln!("[Startup] Failed to get app data dir: {}", e);
                        return;
                    }
                };

                if !db_path.exists() {
                    if let Err(e) = std::fs::create_dir_all(&db_path) {
                        eprintln!("[Startup] Failed to create app data dir: {}", e);
                        return;
                    }
                }

                let mut db_file = db_path.clone();
                db_file.push("swarm.db");

                match rusqlite::Connection::open(&db_file) {
                    Ok(conn) => {
                        // Enable WAL mode & synchronous optimizations
                        if let Err(e) = conn.execute_batch(
                            "PRAGMA journal_mode = WAL;
                             PRAGMA busy_timeout = 5000;
                             PRAGMA synchronous = NORMAL;",
                        ) {
                            eprintln!("[Startup] Pragma setup failed: {}", e);
                        }

                        // Create repository table if not exists
                        let create_table_res = conn.execute(
                            "CREATE TABLE IF NOT EXISTS repositories (
                                id TEXT PRIMARY KEY,
                                name TEXT NOT NULL,
                                root_path TEXT NOT NULL,
                                git_branch TEXT,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                deleted_at DATETIME
                            );",
                            [],
                        );
                        if let Err(e) = create_table_res {
                            eprintln!("[Startup] Failed to create repositories table: {}", e);
                        }

                        connection = Some(conn);
                    }
                    Err(e) => {
                        eprintln!("[Startup] Failed to open SQLite DB: {}", e);
                    }
                }

                if let Some(conn) = connection {
                    if let Some(db_state) = app_handle.try_state::<database::DbState>() {
                        if let Ok(mut guard) = db_state.0.lock() {
                            *guard = Some(conn);
                        }
                    }
                }

                let db_dur = start_db.elapsed().as_millis() as u64;
                record_perf_timing("Database Initialization", db_dur);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            exit_app,
            get_perf_timings,
            spawn_browser_webview,
            sync_browser_webview_layout,
            destroy_browser_webview,
            browser_go_back,
            browser_go_forward,
            browser_reload,
            launch_electron_browser,
            check_electron_ping,
            notify_workspace_switch,
            close_electron_browser,
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
            init_project_memory,
            list_directory,
            is_directory,
            set_terminal_visibility,
            get_pty_process_info,
            get_terminal_metrics,
            get_system_metrics,
            get_git_branch,
            memory::memory_init,
            memory::memory_capture,
            memory::memory_get_pending,
            memory::memory_get_timeline,
            memory::memory_get_file_history,
            memory::memory_read_version,
            memory::memory_restore_file,
            memory::memory_approve_change,
            memory::memory_reject_change,
            memory::memory_create_checkpoint,
            memory::memory_get_checkpoints,
            memory::memory_is_initialized,
            ucte::ucte_create_snapshot,
            ucte::ucte_get_snapshot_diff,
            ucte::ucte_get_changes,
            drivers::resolve_driver_launch,
            drivers::resolve_driver_resume,
            drivers::get_registered_drivers,
            drivers::discover_session_from_line,
            drivers::has_session_record,
            drivers::cleanup_agent_state,
            drivers::register_terminal_pid,
            drivers::update_session_heartbeat
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| match event {
        tauri::RunEvent::Exit => {
            // Close spawned electron browser by calling its control server endpoint /close
            if let Ok(addr) = "127.0.0.1:30120".parse::<std::net::SocketAddr>() {
                if let Ok(mut stream) = std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(50)) {
                    use std::io::Write;
                    let _ = stream.write_all(b"GET /close HTTP/1.1\r\nHost: 127.0.0.1:30120\r\nConnection: close\r\n\r\n");
                }
            }
        }
        _ => {}
    });
}
