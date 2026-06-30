use std::collections::HashMap;
use std::sync::Arc;
use crate::drivers::driver::CliDriver;
use crate::drivers::types::DriverMetadata;

use crate::drivers::claude::ClaudeDriver;
use crate::drivers::agy::AgyDriver;
use crate::drivers::codex::CodexDriver;
use crate::drivers::aider::AiderDriver;
use crate::drivers::cline::ClineDriver;
use crate::drivers::opencode::OpencodeDriver;
use crate::drivers::generic::GenericDriver;

pub struct DriverRegistry {
    drivers: HashMap<String, Arc<dyn CliDriver>>,
}

lazy_static::lazy_static! {
    pub static ref REGISTRY: DriverRegistry = DriverRegistry::new();
}

impl DriverRegistry {
    pub fn new() -> Self {
        let mut drivers: HashMap<String, Arc<dyn CliDriver>> = HashMap::new();
        
        drivers.insert("claude".to_string(), Arc::new(ClaudeDriver::new()));
        drivers.insert("agy".to_string(), Arc::new(AgyDriver::new()));
        drivers.insert("codex".to_string(), Arc::new(CodexDriver::new()));
        drivers.insert("aider".to_string(), Arc::new(AiderDriver::new()));
        drivers.insert("cline".to_string(), Arc::new(ClineDriver::new()));
        drivers.insert("opencode".to_string(), Arc::new(OpencodeDriver::new()));
        drivers.insert("generic".to_string(), Arc::new(GenericDriver::new()));

        DriverRegistry { drivers }
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn CliDriver>> {
        self.drivers.get(id).cloned()
    }

    pub fn list(&self) -> Vec<DriverMetadata> {
        self.drivers.values().map(|d| d.metadata()).collect()
    }
}
