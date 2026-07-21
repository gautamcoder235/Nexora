use tauri::{AppHandle, Emitter};
use std::sync::Mutex;
use crate::team::models::SystemEvent;

pub struct EventBus {
    app_handle: Option<AppHandle>,
    history: Mutex<Vec<SystemEvent>>,
}

impl EventBus {
    pub fn new(app_handle: Option<AppHandle>) -> Self {
        EventBus {
            app_handle,
            history: Mutex::new(Vec::new()),
        }
    }

    pub fn emit(&self, event: SystemEvent) {
        // 1. Determine selective Tauri event name
        let tauri_event_name = match event.event_type.as_str() {
            t if t.contains("agent") => "team://agent",
            t if t.contains("task") || t.contains("dependency") => "team://task",
            t if t.contains("message") || t.contains("directive") => "team://message",
            t if t.contains("lock") => "team://workspace",
            t if t.contains("resource") => "team://runtime",
            t if t.contains("scheduler") => "team://scheduler",
            _ => "team://runtime",
        };

        println!("[EventBus] [{}] Emitting event on {}: {}", event.priority, tauri_event_name, event.message);

        // 2. Dispatch to Tauri if available
        if let Some(ref handle) = self.app_handle {
            let _ = handle.emit(tauri_event_name, event.clone());
        }

        // 3. Add to rolling event history (capped at 10,000 events)
        if let Ok(mut hist) = self.history.lock() {
            hist.push(event);
            if hist.len() > 10000 {
                hist.remove(0);
            }
        }
    }

    pub fn get_history(&self) -> Vec<SystemEvent> {
        if let Ok(hist) = self.history.lock() {
            hist.clone()
        } else {
            Vec::new()
        }
    }
}
