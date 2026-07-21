use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityInfo {
    pub id: String,
    pub name: String,
    pub required_tools: Vec<String>,
    pub recommended_model: String,
    pub prompt_template: String,
    pub validation_pipeline: String,
}

pub struct CapabilityService {
    registry: HashMap<String, CapabilityInfo>,
}

impl CapabilityService {
    pub fn new() -> Self {
        let mut registry = HashMap::new();
        
        registry.insert("rust".to_string(), CapabilityInfo {
            id: "rust".to_string(),
            name: "Rust Systems Coding".to_string(),
            required_tools: vec!["cargo".to_string(), "rustc".to_string()],
            recommended_model: "claude-3-5-sonnet".to_string(),
            prompt_template: "You are an expert Rust systems developer. Follow Cargo linting rules.".to_string(),
            validation_pipeline: "cargo check && cargo test".to_string(),
        });

        registry.insert("react".to_string(), CapabilityInfo {
            id: "react".to_string(),
            name: "React Frontend Layouts".to_string(),
            required_tools: vec!["npm".to_string(), "node".to_string()],
            recommended_model: "claude-3-5-flash".to_string(),
            prompt_template: "You are an expert React UI layout engineer. Apply glassmorphic styles.".to_string(),
            validation_pipeline: "npm run build".to_string(),
        });

        CapabilityService { registry }
    }

    pub fn get_capability(&self, id: &str) -> Option<CapabilityInfo> {
        self.registry.get(id).cloned()
    }

    pub fn list_capabilities(&self) -> Vec<CapabilityInfo> {
        self.registry.values().cloned().collect()
    }
}
