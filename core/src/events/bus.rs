use tokio::sync::broadcast;

#[derive(Clone, Debug)]
pub enum PlatformEvent {
    SystemStarted,
    SystemStopped,
    JobCreated { job_id: String },
    JobUpdated { job_id: String, status: String },
    StateUpdated { store: String },
}

#[derive(Clone)]
pub struct EventBus {
    sender: broadcast::Sender<PlatformEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<PlatformEvent> {
        self.sender.subscribe()
    }

    pub fn publish(&self, event: PlatformEvent) -> Result<usize, broadcast::error::SendError<PlatformEvent>> {
        self.sender.send(event)
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(1024)
    }
}
