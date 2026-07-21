use tauri::{command, AppHandle, Manager};
use crate::memory::models::{TimelineEntry, HunkSelection, MissingProject};

#[command]
pub fn memory_initialize(app: AppHandle, project_path: String) -> Result<String, String> {
    let res = super::manager::initialize_project(&app, &project_path);
    
    // Auto-initialize the Team Swarm runtime for this workspace
    let project_path_clone = project_path.clone();
    tokio::spawn(async move {
        if let Ok(rt) = crate::team::get_runtime() {
            let (tx, rx) = tokio::sync::oneshot::channel();
            if let Ok(_) = rt.get_tx().send(crate::team::runtime::TeamCommand::Initialize {
                workspace_path: project_path_clone,
                responder: tx,
            }).await {
                let _ = rx.await;
            }
        }
    });

    res
}

#[command]
pub fn memory_create_checkpoint(app: AppHandle, project_path: String, name: String) -> Result<String, String> {
    super::manager::create_checkpoint(&app, &project_path, &name)
}

#[command]
pub fn memory_snapshot(
    app: AppHandle,
    project_path: String,
    source: String,
    description: Option<String>,
    session_id: Option<String>,
) -> Result<String, String> {
    super::manager::create_snapshot(&app, &project_path, &source, description, session_id)
}

#[command]
pub fn memory_restore(app: AppHandle, project_path: String, commit_hash: String, files: Option<Vec<String>>) -> Result<(), String> {
    super::manager::restore_commit(&app, &project_path, &commit_hash, files)
}

#[command]
pub fn memory_review_change(project_path: String, commit_hash: String, status: String) -> Result<(), String> {
    super::manager::review_change(&project_path, &commit_hash, &status)
}

#[command]
pub fn memory_apply_hunks(app: AppHandle, project_path: String, commit_hash: String, approved_hunks: Vec<HunkSelection>) -> Result<(), String> {
    super::manager::apply_hunks(&app, &project_path, &commit_hash, approved_hunks)
}

#[command]
pub fn memory_read_version(app: AppHandle, project_path: String, commit_hash: String, file_path: String) -> Result<String, String> {
    super::manager::read_commit_version(&app, &project_path, &commit_hash, &file_path)
}

#[command]
pub fn memory_get_diff(app: AppHandle, project_path: String, from_commit: String, to_commit: String) -> Result<String, String> {
    super::manager::get_diff(&app, &project_path, &from_commit, &to_commit)
}

#[command]
pub fn memory_get_history(project_path: String) -> Result<Vec<TimelineEntry>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let db_sender = super::database_worker::DB_WORKER_SENDER.get().ok_or("DB Worker not active")?;
    db_sender.send(super::database_worker::DatabaseTask::GetTimeline {
        project_path,
        resp_tx: tx,
    }).map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

#[command]
pub fn memory_read_version_file(app: AppHandle, project_path: String, commit_hash: String, file_path: String) -> Result<String, String> {
    super::manager::read_commit_version(&app, &project_path, &commit_hash, &file_path)
}

#[command]
pub fn memory_is_initialized(project_path: String) -> Result<bool, String> {
    let git_dir = std::path::Path::new(&project_path).join(".nexora").join("repo");
    Ok(git_dir.exists())
}

#[command]
pub fn backup_project_command(app: AppHandle, project_path: String) -> Result<(), String> {
    let git_path = super::git_provider::resolve_git_binary(&app)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let project_id = super::backup_service::get_or_create_project_id(&app, &project_path)?;
    super::backup_service::backup_project(&git_path, &app_data_dir, &project_id, &project_path)
}

#[command]
pub fn restore_project_command(app: AppHandle, project_id: String, target_path: String) -> Result<(), String> {
    let git_path = super::git_provider::resolve_git_binary(&app)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    super::backup_service::restore_project(&git_path, &app_data_dir, &project_id, &target_path)
}

#[command]
pub fn check_missing_projects(app_handle: AppHandle) -> Result<Vec<MissingProject>, String> {
    let db_state = app_handle.state::<crate::database::DbState>();
    let mut missing = Vec::new();

    let guard = db_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = guard.as_ref() {
        let mut stmt = conn.prepare("SELECT id, name, root_path FROM repositories WHERE deleted_at IS NULL").map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let id: String = row.get(0).map_err(|e| e.to_string())?;
            let name: String = row.get(1).map_err(|e| e.to_string())?;
            let root_path: String = row.get(2).map_err(|e| e.to_string())?;

            let path = std::path::Path::new(&root_path);
            if !path.exists() {
                let mut status = "missing".to_string();
                let mut last_backup = "Never".to_string();

                let app_dir = app_handle.path().app_data_dir().unwrap_or_default();
                let vault_dir = app_dir.join("RecoveryVault").join("Projects").join(&id);
                if vault_dir.exists() {
                    let git_path = super::git_provider::resolve_git_binary(&app_handle).unwrap_or_default();
                    if let Ok(meta) = super::backup_service::verify_backup_integrity(&git_path, &vault_dir) {
                        status = "healthy".to_string();
                        last_backup = meta.timestamp;
                    } else {
                        let mut has_healthy_gen = false;
                        for gen_idx in 1..=3 {
                            let gen_dir = vault_dir.join("history").join(format!("gen-{}", gen_idx));
                            if gen_dir.exists() && super::backup_service::verify_backup_integrity(&git_path, &gen_dir).is_ok() {
                                has_healthy_gen = true;
                                break;
                            }
                        }
                        status = if has_healthy_gen { "healthy".to_string() } else { "corrupted".to_string() };
                    }
                }

                missing.push(MissingProject {
                    id,
                    name,
                    original_path: root_path,
                    last_backup,
                    status,
                });
            }
        }
    }

    Ok(missing)
}

#[command]
pub fn memory_run_integrity_check(app: AppHandle, project_path: String) -> Result<crate::memory::integrity::HealthStatus, String> {
    let git_path = super::git_provider::resolve_git_binary(&app)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let project_id = super::backup_service::get_or_create_project_id(&app, &project_path)?;
    super::integrity::run_integrity_scan(&git_path, &app_data_dir, &project_id, &project_path)
}

#[command]
pub fn memory_run_repair(app: AppHandle, project_path: String) -> Result<(), String> {
    let git_path = super::git_provider::resolve_git_binary(&app)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let project_id = super::backup_service::get_or_create_project_id(&app, &project_path)?;
    super::integrity::execute_repair(&git_path, &app_data_dir, &project_id, &project_path)
}

#[command]
pub fn memory_run_maintenance(app: AppHandle, project_path: String) -> Result<(), String> {
    super::manager::run_git_maintenance(&app, &project_path)
}
