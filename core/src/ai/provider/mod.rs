pub mod openrouter;
pub mod openai;

use std::error::Error;
use std::collections::HashMap;
use futures::stream::BoxStream;
use openai::GenericOpenAIProvider;

pub trait ModelProvider: Send + Sync {
    /// Streams tokens back as they are generated
    fn generate<'a>(&'a self, prompt: &'a str, model: &'a str) -> BoxStream<'a, Result<String, Box<dyn Error + Send + Sync>>>;
}

pub struct ProviderManager {
    providers: HashMap<String, Box<dyn ModelProvider>>,
}

impl ProviderManager {
    pub fn new() -> Self {
        let mut providers: HashMap<String, Box<dyn ModelProvider>> = HashMap::new();

        // Register OpenRouter
        providers.insert("openrouter".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://openrouter.ai/api/v1/chat/completions",
            "OPENROUTER_API_KEY",
            "Bearer {}",
        )));

        // Register NVIDIA NIM
        providers.insert("nvidia".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            "NVIDIA_NIM_API_KEY",
            "Bearer {}",
        )));

        // Register Mistral
        providers.insert("mistral".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://api.mistral.ai/v1/chat/completions",
            "MISTRAL_API_KEY",
            "Bearer {}",
        )));

        // Register Codestral (Mistral)
        providers.insert("codestral".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://codestral.mistral.ai/v1/chat/completions",
            "CODESTRAL_API_KEY",
            "Bearer {}",
        )));

        // Register DeepSeek
        providers.insert("deepseek".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://api.deepseek.com/chat/completions",
            "DEEPSEEK_API_KEY",
            "Bearer {}",
        )));

        // Register Kimi (Moonshot)
        providers.insert("kimi".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://api.moonshot.cn/v1/chat/completions",
            "KIMI_API_KEY",
            "Bearer {}",
        )));

        // Register OpenCode
        providers.insert("opencode".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://api.opencode.com/v1/chat/completions", // Assuming generic endpoint
            "OPENCODE_API_KEY",
            "Bearer {}",
        )));

        // Register Gemini (using Google's OpenAI compatible endpoint)
        providers.insert("gemini".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            "GEMINI_API_KEY",
            "Bearer {}",
        )));

        // Register Groq
        providers.insert("groq".to_string(), Box::new(GenericOpenAIProvider::new(
            "https://api.groq.com/openai/v1/chat/completions",
            "GROQ_API_KEY",
            "Bearer {}",
        )));

        Self { providers }
    }
    
    pub fn get_provider(&self, provider_name: &str) -> &dyn ModelProvider {
        self.providers
            .get(provider_name)
            .map(|b| b.as_ref())
            .unwrap_or_else(|| self.providers.get("openrouter").unwrap().as_ref())
    }
}
