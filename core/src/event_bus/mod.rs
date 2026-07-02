use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
pub enum NexoraEvent {
    CommandStarted { command: String, args: Vec<String> },
    CommandFinished { command: String, duration_ms: u128, success: bool },
    PluginLoaded { plugin_id: String },
    WorkspaceChanged { old_path: String, new_path: String },
    ModelSwitched { old_model: String, new_model: String },
    MemoryUpdated { key: String, action: String },
    DesktopConnected { address: String },
    ErrorEncountered { code: String, message: String },
}

pub type SubscriberFn = Arc<dyn Fn(&NexoraEvent) + Send + Sync + 'static>;

#[derive(Clone, Default)]
pub struct EventBus {
    subscribers: Arc<Mutex<Vec<SubscriberFn>>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            subscribers: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn subscribe<F>(&self, subscriber: F)
    where
        F: Fn(&NexoraEvent) + Send + Sync + 'static,
    {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(Arc::new(subscriber));
        }
    }

    pub fn publish(&self, event: &NexoraEvent) {
        if let Ok(subs) = self.subscribers.lock() {
            for sub in subs.iter() {
                (sub)(event);
            }
        }
    }
}
