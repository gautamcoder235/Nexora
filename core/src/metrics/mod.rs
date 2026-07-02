use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Debug, Clone, serde::Serialize)]
pub struct MetricEntry {
    pub name: String,
    pub value: u128, // duration in microseconds or counter count
    pub description: String,
}

#[derive(Clone, Default)]
pub struct MetricsCollector {
    entries: Arc<Mutex<HashMap<String, MetricEntry>>>,
    start_time: Arc<Mutex<Option<Instant>>>,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            start_time: Arc::new(Mutex::new(Some(Instant::now()))),
        }
    }

    pub fn record_startup_complete(&self) {
        if let Ok(mut start_time_opt) = self.start_time.lock() {
            if let Some(start) = *start_time_opt {
                let duration = start.elapsed().as_micros();
                self.record("startup", duration, "CLI execution startup time".to_string());
                *start_time_opt = None; // Reset so we don't record startup twice
            }
        }
    }

    pub fn record(&self, name: &str, value: u128, description: String) {
        if let Ok(mut map) = self.entries.lock() {
            map.insert(
                name.to_string(),
                MetricEntry {
                    name: name.to_string(),
                    value,
                    description,
                },
            );
        }
    }

    pub fn increment(&self, name: &str, description: String) {
        if let Ok(mut map) = self.entries.lock() {
            let entry = map.entry(name.to_string()).or_insert(MetricEntry {
                name: name.to_string(),
                value: 0,
                description,
            });
            entry.value += 1;
        }
    }

    pub fn get_metrics(&self) -> Vec<MetricEntry> {
        if let Ok(map) = self.entries.lock() {
            map.values().cloned().collect()
        } else {
            Vec::new()
        }
    }

    pub fn time_action<F, R>(&self, name: &str, description: String, action: F) -> R
    where
        F: FnOnce() -> R,
    {
        let start = Instant::now();
        let result = action();
        let elapsed = start.elapsed().as_micros();
        self.record(name, elapsed, description);
        result
    }
}
