use std::sync::Arc;
use crate::runtime::state::StateStore;
use crate::runtime::jobs::JobManager;
use crate::events::bus::EventBus;

#[derive(Clone)]
pub struct NexoraRuntime {
    pub state_store: Arc<StateStore>,
    pub job_manager: Arc<JobManager>,
    pub event_bus: Arc<EventBus>,
}

impl NexoraRuntime {
    pub fn new() -> Self {
        Self {
            state_store: Arc::new(StateStore::new()),
            job_manager: Arc::new(JobManager::new()),
            event_bus: Arc::new(EventBus::new(1024)),
        }
    }

    pub async fn start(&self) -> anyhow::Result<()> {
        // Initialization logic here
        Ok(())
    }
    
    pub async fn shutdown(&self) -> anyhow::Result<()> {
        // Shutdown logic here
        Ok(())
    }
}

impl Default for NexoraRuntime {
    fn default() -> Self {
        Self::new()
    }
}
