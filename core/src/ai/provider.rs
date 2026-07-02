use std::error::Error;

pub trait ModelProvider {
    // Basic async signature for model generation
    async fn generate(&self, prompt: &str) -> Result<String, Box<dyn Error + Send + Sync>>;
}

pub struct ProviderManager {
    // Scaffolding
}

impl ProviderManager {
    pub fn new() -> Self {
        Self {}
    }
}
