use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::team::task_types::{TaskSpec, TaskState, initialize_task_structure, update_task_state};
use crate::team::project_manager::{increment_project_task_count, update_project_active_tasks};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", content = "payload")]
pub enum SwarmCommand {
    CreateTask {
        project_path: String,
        spec: TaskSpec,
    },
    StartTask {
        project_path: String,
        task_id: String,
    },
    CancelTask {
        project_path: String,
        task_id: String,
    },
    ApproveMerge {
        project_path: String,
        task_id: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", content = "payload")]
pub enum SwarmEvent {
    TaskCreated {
        task_id: String,
        spec: TaskSpec,
    },
    TaskStarted {
        task_id: String,
    },
    TaskCompleted {
        task_id: String,
    },
    TaskFailed {
        task_id: String,
        error: String,
    },
    TaskStatusChanged {
        task_id: String,
        status: String,
    },
}

pub struct CommandBus {
    queue: Mutex<VecDeque<SwarmCommand>>,
}

pub struct EventBus {}

impl CommandBus {
    pub fn new() -> Self {
        CommandBus {
            queue: Mutex::new(VecDeque::new()),
        }
    }

    pub fn enqueue(&self, command: SwarmCommand, app_handle: &AppHandle) -> Result<(), String> {
        // Enqueue
        {
            let mut q = self.queue.lock().map_err(|e| e.to_string())?;
            q.push_back(command.clone());
        }

        // Process immediately for now, synchronizing state to filesystem
        self.process_next(app_handle)?;
        Ok(())
    }

    pub fn dequeue(&self) -> Option<SwarmCommand> {
        let mut q = self.queue.lock().ok()?;
        q.pop_front()
    }

    pub fn process_next(&self, app_handle: &AppHandle) -> Result<(), String> {
        let command = match self.dequeue() {
            Some(cmd) => cmd,
            None => return Ok(()),
        };

        // Write command to .nexora/state/commands.jsonl for persistent logging
        let project_path = match &command {
            SwarmCommand::CreateTask { project_path, .. } => project_path,
            SwarmCommand::StartTask { project_path, .. } => project_path,
            SwarmCommand::CancelTask { project_path, .. } => project_path,
            SwarmCommand::ApproveMerge { project_path, .. } => project_path,
        };

        log_command_to_file(project_path, &command)?;

        match command {
            SwarmCommand::CreateTask { project_path, spec } => {
                // Initialize task structure
                initialize_task_structure(&project_path, &spec)?;
                increment_project_task_count(&project_path)?;

                // Dispatch event
                let event_bus = app_handle.state::<EventBus>();
                event_bus.dispatch(
                    &project_path,
                    SwarmEvent::TaskCreated {
                        task_id: spec.task_id.clone(),
                        spec,
                    },
                    app_handle,
                )?;
            }
            SwarmCommand::StartTask { project_path, task_id } => {
                update_task_state(&project_path, &task_id, TaskState::Executing)?;
                update_project_active_tasks(&project_path, 1)?;

                // Dispatch event
                let event_bus = app_handle.state::<EventBus>();
                event_bus.dispatch(
                    &project_path,
                    SwarmEvent::TaskStarted { task_id },
                    app_handle,
                )?;
            }
            SwarmCommand::CancelTask { project_path, task_id } => {
                update_task_state(&project_path, &task_id, TaskState::Cancelled)?;
                update_project_active_tasks(&project_path, -1)?;

                // Dispatch event
                let event_bus = app_handle.state::<EventBus>();
                event_bus.dispatch(
                    &project_path,
                    SwarmEvent::TaskStatusChanged {
                        task_id,
                        status: "CANCELLED".to_string(),
                    },
                    app_handle,
                )?;
            }
            SwarmCommand::ApproveMerge { project_path, task_id } => {
                crate::team::merge_engine::merge_task_changes(app_handle, &project_path, &task_id)?;
                update_project_active_tasks(&project_path, -1)?;

                // Dispatch event
                let event_bus = app_handle.state::<EventBus>();
                event_bus.dispatch(
                    &project_path,
                    SwarmEvent::TaskCompleted { task_id },
                    app_handle,
                )?;
            }
        }

        Ok(())
    }
}

impl EventBus {
    pub fn new() -> Self {
        EventBus {}
    }

    pub fn dispatch(&self, project_path: &str, event: SwarmEvent, app_handle: &AppHandle) -> Result<(), String> {
        // Log event to console
        println!("[EventBus] Dispatching event: {:?}", event);

        // Persistent log to .nexora/state/events.jsonl
        log_event_to_file(project_path, &event)?;

        // Emit globally to Tauri frontend listeners
        app_handle
            .emit("swarm-event", &event)
            .map_err(|e| format!("Failed to emit Tauri event: {}", e))?;

        Ok(())
    }
}

#[derive(Serialize)]
struct LoggedEnvelope<T> {
    timestamp: i64,
    data: T,
}

fn log_command_to_file(project_path: &str, command: &SwarmCommand) -> Result<(), String> {
    let state_dir = Path::new(project_path).join(".nexora").join("state");
    fs::create_dir_all(&state_dir).map_err(|e| e.to_string())?;
    
    let path = state_dir.join("commands.jsonl");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let envelope = LoggedEnvelope {
        timestamp: now,
        data: command,
    };

    let mut line = serde_json::to_string(&envelope).map_err(|e| e.to_string())?;
    line.push('\n');
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

fn log_event_to_file(project_path: &str, event: &SwarmEvent) -> Result<(), String> {
    let state_dir = Path::new(project_path).join(".nexora").join("state");
    fs::create_dir_all(&state_dir).map_err(|e| e.to_string())?;
    
    let path = state_dir.join("events.jsonl");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let envelope = LoggedEnvelope {
        timestamp: now,
        data: event,
    };

    let mut line = serde_json::to_string(&envelope).map_err(|e| e.to_string())?;
    line.push('\n');
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

// ==========================================
// Tauri Commands
// ==========================================

#[tauri::command]
pub fn send_swarm_command(
    app_handle: AppHandle,
    command_bus: tauri::State<'_, CommandBus>,
    command: SwarmCommand,
) -> Result<(), String> {
    command_bus.enqueue(command, &app_handle)
}
