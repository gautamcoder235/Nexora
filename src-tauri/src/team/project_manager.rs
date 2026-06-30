use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProjectState {
    pub schema_version: u32,
    pub project_id: String,
    pub root_path: String,
    pub task_count: usize,
    pub active_tasks: usize,
    pub status: String,
}

impl Default for ProjectState {
    fn default() -> Self {
        ProjectState {
            schema_version: 1,
            project_id: "default_project".to_string(),
            root_path: "".to_string(),
            task_count: 0,
            active_tasks: 0,
            status: "active".to_string(),
        }
    }
}

fn get_project_file_path(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".nexora").join("project.json")
}

pub fn init_project(project_path: &str, project_name: &str) -> Result<ProjectState, String> {
    let path = get_project_file_path(project_path);
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let state = ProjectState {
            schema_version: 1,
            project_id: project_name.replace(" ", "_").to_lowercase(),
            root_path: project_path.to_string(),
            task_count: 0,
            active_tasks: 0,
            status: "active".to_string(),
        };
        save_project(project_path, &state)?;
        let _ = crate::team::dag::initialize_default_templates(project_path.to_string());
        return Ok(state);
    }
    load_project(project_path)
}

pub fn load_project(project_path: &str) -> Result<ProjectState, String> {
    let path = get_project_file_path(project_path);
    if !path.exists() {
        return Err("Project configuration file does not exist. Please initialize first.".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let state: ProjectState = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(state)
}

pub fn save_project(project_path: &str, state: &ProjectState) -> Result<(), String> {
    let path = get_project_file_path(project_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn increment_project_task_count(project_path: &str) -> Result<(), String> {
    let mut state = load_project(project_path)?;
    state.task_count += 1;
    save_project(project_path, &state)?;
    Ok(())
}

pub fn update_project_active_tasks(project_path: &str, delta: i32) -> Result<(), String> {
    let mut state = load_project(project_path)?;
    if delta < 0 {
        let abs_delta = delta.unsigned_abs() as usize;
        state.active_tasks = state.active_tasks.saturating_sub(abs_delta);
    } else {
        state.active_tasks = state.active_tasks.saturating_add(delta as usize);
    }
    save_project(project_path, &state)?;
    Ok(())
}

// ==========================================
// Tauri Commands
// ==========================================

#[tauri::command]
pub fn get_project_state(project_path: String) -> Result<ProjectState, String> {
    load_project(&project_path)
}

#[tauri::command]
pub fn initialize_project(project_path: String, project_name: String) -> Result<ProjectState, String> {
    init_project(&project_path, &project_name)
}
