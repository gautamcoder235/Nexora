use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IntentType {
    CodeModification,
    CodeAnalysis,
    SystemCommand,
    GeneralChat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Intent {
    pub intent_type: IntentType,
    pub confidence: f32,
    pub primary_targets: Vec<String>,
    pub required_tools: Vec<String>,
}

pub struct IntentAnalyzer;

impl IntentAnalyzer {
    pub fn new() -> Self {
        Self
    }
    
    pub async fn analyze(&self, user_prompt: &str) -> anyhow::Result<Intent> {
        // In a full implementation, this would use an LLM or local classifier
        // For now, we stub it based on keywords
        let prompt_lower = user_prompt.to_lowercase();
        
        let intent_type = if prompt_lower.contains("refactor") || prompt_lower.contains("fix") || prompt_lower.contains("implement") {
            IntentType::CodeModification
        } else if prompt_lower.contains("explain") || prompt_lower.contains("how does") {
            IntentType::CodeAnalysis
        } else if prompt_lower.contains("run") || prompt_lower.contains("build") || prompt_lower.contains("test") {
            IntentType::SystemCommand
        } else {
            IntentType::GeneralChat
        };

        Ok(Intent {
            intent_type,
            confidence: 0.9,
            primary_targets: vec![],
            required_tools: vec![],
        })
    }
}
