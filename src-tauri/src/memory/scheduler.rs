use std::sync::mpsc::{channel, Sender, Receiver};
use std::sync::OnceLock;
use std::thread;
use tauri::AppHandle;

pub static SCHEDULER_SENDER: OnceLock<Sender<SchedulerTask>> = OnceLock::new();

pub enum SchedulerTask {
    Initialize {
        app_handle: AppHandle,
        project_path: String,
        resp_tx: Sender<Result<String, String>>,
    },
    CreateCheckpoint {
        app_handle: AppHandle,
        project_path: String,
        name: String,
        resp_tx: Sender<Result<String, String>>,
    },
    CreateSnapshot {
        app_handle: AppHandle,
        project_path: String,
        source: String,
        description: Option<String>,
        session_id: Option<String>,
        resp_tx: Sender<Result<String, String>>,
    },
    Restore {
        app_handle: AppHandle,
        project_path: String,
        commit_hash: String,
        files: Option<Vec<String>>,
        resp_tx: Sender<Result<(), String>>,
    },
    Backup {
        app_handle: AppHandle,
        project_path: String,
        resp_tx: Sender<Result<(), String>>,
    },
}

pub fn start_scheduler_worker() {
    let (tx, rx): (Sender<SchedulerTask>, Receiver<SchedulerTask>) = channel();
    let _ = SCHEDULER_SENDER.set(tx);

    thread::spawn(move || {
        for task in rx {
            execute_scheduler_task(task);
        }
    });
}

fn execute_scheduler_task(task: SchedulerTask) {
    match task {
        SchedulerTask::Initialize { app_handle, project_path, resp_tx } => {
            let res = super::manager::initialize_project_sync(&app_handle, &project_path);
            let _ = resp_tx.send(res);
        }
        SchedulerTask::CreateCheckpoint { app_handle, project_path, name, resp_tx } => {
            let res = super::manager::create_checkpoint_sync(&app_handle, &project_path, &name);
            let _ = resp_tx.send(res);
        }
        SchedulerTask::CreateSnapshot { app_handle, project_path, source, description, session_id, resp_tx } => {
            let res = super::manager::create_snapshot_sync(&app_handle, &project_path, &source, description, session_id);
            let _ = resp_tx.send(res);
        }
        SchedulerTask::Restore { app_handle, project_path, commit_hash, files, resp_tx } => {
            let res = super::manager::restore_commit_sync(&app_handle, &project_path, &commit_hash, files);
            let _ = resp_tx.send(res);
        }
        SchedulerTask::Backup { app_handle, project_path, resp_tx } => {
            let res = super::backup_service::backup_project(&app_handle, &project_path);
            let _ = resp_tx.send(res);
        }
    }
}
