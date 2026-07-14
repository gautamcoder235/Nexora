use std::sync::mpsc::{channel, Sender, Receiver};
use std::sync::OnceLock;
use std::thread;
use std::path::PathBuf;

pub static SCHEDULER_SENDER: OnceLock<Sender<SchedulerTask>> = OnceLock::new();

pub enum SchedulerTask {
    Initialize {
        git_path: PathBuf,
        app_data_dir: PathBuf,
        project_id: String,
        project_path: String,
        resp_tx: Sender<Result<String, String>>,
    },
    CreateCheckpoint {
        git_path: PathBuf,
        app_data_dir: PathBuf,
        project_id: String,
        project_path: String,
        name: String,
        resp_tx: Sender<Result<String, String>>,
    },
    CreateSnapshot {
        git_path: PathBuf,
        project_path: String,
        source: String,
        description: Option<String>,
        session_id: Option<String>,
        resp_tx: Sender<Result<String, String>>,
    },
    Restore {
        git_path: PathBuf,
        app_data_dir: PathBuf,
        project_id: String,
        project_path: String,
        commit_hash: String,
        files: Option<Vec<String>>,
        resp_tx: Sender<Result<(), String>>,
    },
    Backup {
        git_path: PathBuf,
        app_data_dir: PathBuf,
        project_id: String,
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
        SchedulerTask::Initialize { git_path, app_data_dir, project_id, project_path, resp_tx } => {
            let res = super::manager::initialize_project_sync(&git_path, &app_data_dir, &project_id, &project_path);
            let _ = resp_tx.send(res);
        }
        SchedulerTask::CreateCheckpoint { git_path, app_data_dir, project_id, project_path, name, resp_tx } => {
            let res = super::manager::create_checkpoint_sync(&git_path, &app_data_dir, &project_id, &project_path, &name);
            let _ = resp_tx.send(res);
        }
        SchedulerTask::CreateSnapshot { git_path, project_path, source, description, session_id, resp_tx } => {
            let res = super::manager::create_snapshot_sync(&git_path, &project_path, &source, description, session_id);
            let _ = resp_tx.send(res);
        }
        SchedulerTask::Restore { git_path, app_data_dir, project_id, project_path, commit_hash, files, resp_tx } => {
            let res = super::manager::restore_commit_sync(&git_path, &app_data_dir, &project_id, &project_path, &commit_hash, files);
            let _ = resp_tx.send(res);
        }
        SchedulerTask::Backup { git_path, app_data_dir, project_id, project_path, resp_tx } => {
            let res = super::backup_service::backup_project(&git_path, &app_data_dir, &project_id, &project_path);
            let _ = resp_tx.send(res);
        }
    }
}
