use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CommsTelemetry {
    pub status: Option<String>,     // "idle" | "running" | "error"
    pub task: Option<String>,       // brief task description
    pub message: Option<String>,    // the actual content
    pub to: Option<String>,         // routing target: agent_id | "all" | null
    pub from: Option<String>,       // auto-filled by watcher from filename
}

#[derive(Serialize, Clone, Debug)]
pub struct CommsEventPayload {
    pub agent_id: String,           // source agent who wrote the line
    pub lines: Vec<CommsTelemetry>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InboxMessage {
    pub from: String,
    pub from_label: String,
    pub message: String,
    pub task: Option<String>,
    pub timestamp: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct InboxEventPayload {
    pub agent_id: String,           // target agent whose inbox changed
    pub lines: Vec<InboxMessage>,
}

// Global thread-safe offset tracking registry
fn get_offsets() -> &'static Mutex<HashMap<PathBuf, u64>> {
    static OFFSETS: OnceLock<Mutex<HashMap<PathBuf, u64>>> = OnceLock::new();
    OFFSETS.get_or_init(|| Mutex::new(HashMap::new()))
}

// Global thread-safe watcher handle
fn get_watcher() -> &'static Mutex<Option<RecommendedWatcher>> {
    static WATCHER: OnceLock<Mutex<Option<RecommendedWatcher>>> = OnceLock::new();
    WATCHER.get_or_init(|| Mutex::new(None))
}

fn process_inbox_changes(path: &Path, agent_id: &str, app: &AppHandle) -> Result<(), String> {
    let mut offsets = get_offsets().lock().map_err(|e| e.to_string())?;
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Ok(()), // File might have been deleted/cleared
    };

    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let file_size = metadata.len();
    let current_offset = *offsets.get(path).unwrap_or(&0);

    if file_size <= current_offset {
        return Ok(());
    }

    let mut reader = BufReader::new(file);
    reader.seek(SeekFrom::Start(current_offset)).map_err(|e| e.to_string())?;

    let mut new_lines = Vec::new();
    let mut line = String::new();
    while reader.read_line(&mut line).map_err(|e| e.to_string())? > 0 {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            if let Ok(msg) = serde_json::from_str::<InboxMessage>(trimmed) {
                new_lines.push(msg);
            }
        }
        line.clear();
    }

    offsets.insert(path.to_path_buf(), file_size);
    drop(offsets);

    if !new_lines.is_empty() {
        let payload = InboxEventPayload {
            agent_id: agent_id.to_string(),
            lines: new_lines,
        };
        let _ = app.emit("agent:inbox", payload);
    }

    Ok(())
}

fn process_file_changes(path: &Path, app: &AppHandle) -> Result<(), String> {
    let file_name = path.file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid filename".to_string())?;

    if !file_name.ends_with(".jsonl") {
        return Ok(());
    }

    if file_name.ends_with("_inbox.jsonl") {
        let agent_id = file_name.trim_end_matches("_inbox.jsonl").to_string();
        return process_inbox_changes(path, &agent_id, app);
    }

    let agent_id = file_name.trim_end_matches(".jsonl").to_string();

    let mut offsets = get_offsets().lock().map_err(|e| e.to_string())?;

    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Ok(()), // File might have been deleted/cleared
    };

    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let file_size = metadata.len();
    let current_offset = *offsets.get(path).unwrap_or(&0);

    if file_size <= current_offset {
        return Ok(());
    }

    let mut reader = BufReader::new(file);
    reader.seek(SeekFrom::Start(current_offset)).map_err(|e| e.to_string())?;

    let mut new_lines = Vec::new();
    let mut line = String::new();
    while reader.read_line(&mut line).map_err(|e| e.to_string())? > 0 {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            if let Ok(mut telemetry) = serde_json::from_str::<CommsTelemetry>(trimmed) {
                telemetry.from = Some(agent_id.clone());
                new_lines.push(telemetry);
            }
        }
        line.clear();
    }

    offsets.insert(path.to_path_buf(), file_size);
    drop(offsets);

    if !new_lines.is_empty() {
        let payload = CommsEventPayload {
            agent_id: agent_id.clone(),
            lines: new_lines,
        };
        let _ = app.emit("agent:comms", payload);
    }

    Ok(())
}

#[tauri::command]
pub fn init_agent_comms(workspace_path: String) -> Result<String, String> {
    let comms_dir = PathBuf::from(&workspace_path).join(".nexora").join("comms");
    if !comms_dir.exists() {
        fs::create_dir_all(&comms_dir).map_err(|e| e.to_string())?;
    }
    let abs_path = fs::canonicalize(&comms_dir).map_err(|e| e.to_string())?;
    let path_str = abs_path.to_string_lossy().to_string();
    let cleaned_path = if path_str.starts_with(r"\\?\") {
        path_str[4..].to_string()
    } else {
        path_str
    };
    Ok(cleaned_path)
}

#[tauri::command]
pub async fn start_agent_comms_watcher(app: AppHandle, workspace_path: String) -> Result<(), String> {
    let comms_dir = PathBuf::from(&workspace_path).join(".nexora").join("comms");
    
    let mut watcher_lock = get_watcher().lock().map_err(|e| e.to_string())?;
    if watcher_lock.is_some() {
        *watcher_lock = None;
    }

    if !comms_dir.exists() {
        fs::create_dir_all(&comms_dir).map_err(|e| e.to_string())?;
    }

    // Initialize offsets to current file sizes to avoid double reading past logs on restart
    let mut offsets = get_offsets().lock().map_err(|e| e.to_string())?;
    if let Ok(entries) = fs::read_dir(&comms_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                if let Ok(metadata) = entry.metadata() {
                    offsets.insert(path, metadata.len());
                }
            }
        }
    }
    drop(offsets);

    let app_clone = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            for path in event.paths {
                let app_inner = app_clone.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(300)).await;
                    let _ = process_file_changes(&path, &app_inner);
                });
            }
        }
    }).map_err(|e| e.to_string())?;

    watcher.watch(&comms_dir, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
    *watcher_lock = Some(watcher);

    Ok(())
}

#[tauri::command]
pub fn stop_agent_comms_watcher() -> Result<(), String> {
    let mut watcher_lock = get_watcher().lock().map_err(|e| e.to_string())?;
    *watcher_lock = None;
    Ok(())
}

#[tauri::command]
pub fn write_agent_inbox(workspace_path: String, agent_id: String, content: String) -> Result<(), String> {
    let comms_dir = PathBuf::from(&workspace_path).join(".nexora").join("comms");
    if !comms_dir.exists() {
        fs::create_dir_all(&comms_dir).map_err(|e| e.to_string())?;
    }
    let inbox_file = comms_dir.join(format!("{}_inbox.jsonl", agent_id));
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&inbox_file)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_agent_comms(workspace_path: String, agent_id: String) -> Result<(), String> {
    let comms_dir = PathBuf::from(&workspace_path).join(".nexora").join("comms");
    let outbox_file = comms_dir.join(format!("{}.jsonl", agent_id));
    let inbox_file = comms_dir.join(format!("{}_inbox.jsonl", agent_id));

    if outbox_file.exists() {
        let _ = fs::write(&outbox_file, "");
    }
    if inbox_file.exists() {
        let _ = fs::write(&inbox_file, "");
    }

    let mut offsets = get_offsets().lock().map_err(|e| e.to_string())?;
    offsets.insert(outbox_file, 0);

    Ok(())
}

#[tauri::command]
pub fn read_agent_comms(workspace_path: String, agent_id: String, last_offset: u64) -> Result<(Vec<String>, u64), String> {
    let comms_dir = PathBuf::from(&workspace_path).join(".nexora").join("comms");
    let outbox_file = comms_dir.join(format!("{}.jsonl", agent_id));

    if !outbox_file.exists() {
        return Ok((Vec::new(), 0));
    }

    let file = fs::File::open(&outbox_file).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let file_size = metadata.len();

    if file_size <= last_offset {
        return Ok((Vec::new(), last_offset));
    }

    let mut reader = BufReader::new(file);
    reader.seek(SeekFrom::Start(last_offset)).map_err(|e| e.to_string())?;

    let mut new_lines = Vec::new();
    let mut line = String::new();
    while reader.read_line(&mut line).map_err(|e| e.to_string())? > 0 {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            new_lines.push(trimmed.to_string());
        }
        line.clear();
    }

    Ok((new_lines, file_size))
}
