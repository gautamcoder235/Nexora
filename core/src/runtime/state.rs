use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Serialize, Deserialize};

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ChatState {
    pub active_session_id: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub root_path: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct PermissionsState {
    pub granted_paths: Vec<String>,
    pub granted_commands: Vec<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct SessionsState {
    pub sessions: Vec<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TasksState {
    pub active_tasks: usize,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub chat: ChatState,
    pub workspace: WorkspaceState,
    pub permissions: PermissionsState,
    pub sessions: SessionsState,
    pub tasks: TasksState,
}

#[derive(Clone, Default)]
pub struct StateStore {
    state: Arc<RwLock<AppState>>,
}

impl StateStore {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(AppState::default())),
        }
    }

    pub async fn get_state(&self) -> AppState {
        self.state.read().await.clone()
    }

    pub async fn update<F>(&self, updater: F)
    where
        F: FnOnce(&mut AppState),
    {
        let mut state = self.state.write().await;
        updater(&mut state);
    }
}
