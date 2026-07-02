use crate::config::credentials::ProviderConfig;
use crate::ai::provider::ModelProvider;
use crate::ai::provider::openai::GenericOpenAIProvider;
use std::sync::Arc;

pub struct ProviderFactory;

impl ProviderFactory {
    pub fn create_provider(config: &ProviderConfig) -> Option<Arc<dyn ModelProvider>> {
        match config.provider_name.as_str() {
            "openai" | "openrouter" | "groq" | "mistral" | "deepseek" | "together" | "fireworks" => {
                let base_url = match config.provider_name.as_str() {
                    "openai" => "https://api.openai.com/v1/chat/completions",
                    "openrouter" => "https://openrouter.ai/api/v1/chat/completions",
                    "groq" => "https://api.groq.com/openai/v1/chat/completions",
                    "mistral" => "https://api.mistral.ai/v1/chat/completions",
                    "deepseek" => "https://api.deepseek.com/chat/completions",
                    "together" => "https://api.together.xyz/v1/chat/completions",
                    "fireworks" => "https://api.fireworks.ai/inference/v1/chat/completions",
                    _ => unreachable!(),
                };

                Some(Arc::new(GenericOpenAIProvider::new(
                    base_url,
                    "", // Env var no longer needed with new credential manager
                    "Bearer {}",
                )))
            }
            "anthropic" => {
                // Return anthropic provider implementation
                None 
            }
            "gemini" => {
                // Return gemini provider implementation
                None
            }
            "ollama" | "lmstudio" | "opencode" => {
                // Local providers
                None
            }
            _ => None,
        }
    }
}
