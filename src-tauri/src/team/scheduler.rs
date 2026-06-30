use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

use crate::team::task_types::{
    TaskSpec, TaskState, read_task_state, update_task_state as update_fs_task_state, get_task_dir
};
use crate::team::bus::{EventBus, SwarmEvent};
use crate::team::resource_manager::{verify_resource_availability, increment_active_task_count};
use crate::team::budget_engine::is_budget_available;

pub fn run_scheduler_tick(
    app_handle: &AppHandle,
    project_path: &str,
) -> Result<(), String> {
    // 1. Check budget limits
    match is_budget_available(project_path) {
        Ok(false) => {
            println!("[Scheduler] Tick skipped: daily budget limit reached.");
            return Ok(());
        }
        Err(e) => {
            println!("[Scheduler] Budget check error: {}", e);
        }
        _ => {}
    }

    let tasks_dir = Path::new(project_path).join(".nexora").join("tasks");
    if !tasks_dir.exists() || !tasks_dir.is_dir() {
        return Ok(());
    }

    // 2. Read all tasks to update QUEUED -> READY
    let mut queued_tasks = Vec::new();
    let mut ready_tasks = Vec::new();
    let mut completed_task_ids = std::collections::HashSet::new();

    let entries = fs::read_dir(&tasks_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let task_id = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            
            if let Ok(state) = read_task_state(project_path, &task_id) {
                if state.status == "COMPLETED" {
                    completed_task_ids.insert(task_id.clone());
                } else if state.status == "QUEUED" {
                    queued_tasks.push(task_id.clone());
                } else if state.status == "READY" {
                    ready_tasks.push(task_id.clone());
                }
            }
        }
    }

    // 3. For each QUEUED task, check dependencies
    for task_id in queued_tasks {
        let spec_path = get_task_dir(project_path, &task_id).join("spec.json");
        if spec_path.exists() {
            if let Ok(spec_content) = fs::read_to_string(&spec_path) {
                if let Ok(spec) = serde_json::from_str::<TaskSpec>(&spec_content) {
                    let mut deps_satisfied = true;
                    for dep in &spec.dependencies {
                        if !completed_task_ids.contains(dep) {
                            deps_satisfied = false;
                            break;
                        }
                    }

                    if deps_satisfied {
                        println!("[Scheduler] Dependencies met for task: {}. Transitioning to READY.", task_id);
                        update_fs_task_state(project_path, &task_id, TaskState::Ready)?;
                        
                        let event_bus = app_handle.state::<EventBus>();
                        let _ = event_bus.dispatch(
                            project_path,
                            SwarmEvent::TaskStatusChanged {
                                task_id: task_id.clone(),
                                status: "READY".to_string(),
                            },
                            app_handle,
                        );

                        ready_tasks.push(task_id);
                    }
                }
            }
        }
    }

    if ready_tasks.is_empty() {
        return Ok(());
    }

    // 4. Sort READY tasks by priority
    let mut sorted_ready = Vec::new();
    for task_id in ready_tasks {
        let spec_path = get_task_dir(project_path, &task_id).join("spec.json");
        if spec_path.exists() {
            if let Ok(spec_content) = fs::read_to_string(&spec_path) {
                if let Ok(spec) = serde_json::from_str::<TaskSpec>(&spec_content) {
                    sorted_ready.push((task_id, spec));
                }
            }
        }
    }

    sorted_ready.sort_by_key(|(_, spec)| {
        match spec.priority.to_lowercase().as_str() {
            "critical" => 0,
            "high" => 1,
            "normal" => 2,
            "low" => 3,
            "background" => 4,
            _ => 5,
        }
    });

    // 5. Try to schedule tasks
    for (task_id, spec) in sorted_ready {
        // Check resource limits
        match verify_resource_availability("balanced".to_string()) {
            Ok(true) => {
                println!("[Scheduler] Dispatching task: {}", task_id);

                // Increment active task count
                increment_active_task_count();

                // Transition to EXECUTING
                update_fs_task_state(project_path, &task_id, TaskState::Executing)?;

                // Dispatch event
                let event_bus = app_handle.state::<EventBus>();
                let _ = event_bus.dispatch(
                    project_path,
                    SwarmEvent::TaskStatusChanged {
                        task_id: task_id.clone(),
                        status: "EXECUTING".to_string(),
                    },
                    app_handle,
                );

                // Instantiate runtime
                let mut runtime: Box<dyn crate::team::runtime::WorkerRuntime> = match spec.worker.runtime.to_lowercase().as_str() {
                    "aider" => Box::new(crate::team::runtime::AiderRuntime),
                    "claude_code" => Box::new(crate::team::runtime::ClaudeRuntime),
                    "antigravity" => Box::new(crate::team::runtime::AntigravityRuntime),
                    _ => Box::new(crate::team::runtime::AiderRuntime),
                };

                let session_id = format!("session-{}", task_id);
                if let Err(e) = runtime.start(
                    app_handle.clone(),
                    session_id,
                    project_path.to_string(),
                    task_id.clone(),
                    None,
                    None,
                ) {
                    eprintln!("[Scheduler] Failed to start runtime for task {}: {}", task_id, e);
                }
            }
            _ => {
                println!("[Scheduler] Tick paused: resources exhausted.");
                break; // Stop launching further tasks
            }
        }
    }

    Ok(())
}
