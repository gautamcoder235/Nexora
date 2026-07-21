use std::sync::Mutex;
use crate::team::models::TeamMessage;

pub struct MessageManager {
    messages: Mutex<Vec<TeamMessage>>,
}

impl MessageManager {
    pub fn new() -> Self {
        MessageManager {
            messages: Mutex::new(Vec::new()),
        }
    }

    pub fn add_message(&self, msg: TeamMessage) {
        let mut guard = self.messages.lock().unwrap();
        guard.push(msg);
        
        // Cap history at 5000 messages to prevent memory bloat
        if guard.len() > 5000 {
            guard.remove(0);
        }
    }

    pub fn clear_messages(&self) {
        let mut guard = self.messages.lock().unwrap();
        guard.clear();
    }

    pub fn get_messages(&self) -> Vec<TeamMessage> {
        let guard = self.messages.lock().unwrap();
        guard.clone()
    }
}
