pub struct AgentRuntime {
    // Scaffolding
}

impl AgentRuntime {
    pub fn new() -> Self {
        Self {}
    }
    
    pub async fn chat(&self, provider: &str, model: &str, prompt: &str) -> String {
        use crate::ai::provider::ProviderManager;
        use futures::StreamExt;
        
        let pm = ProviderManager::new();
        let provider_impl = pm.get_provider(provider);
        
        let mut stream = provider_impl.generate(prompt, model);
        let mut full_response = String::new();
        
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(text) => full_response.push_str(&text),
                Err(e) => {
                    full_response.push_str(&format!("\n[Error: {}]", e));
                    break;
                }
            }
        }
        
        full_response
    }

    pub fn chat_stream<'a>(&'a self, provider: &'a str, model: &'a str, prompt: &'a str) -> futures::stream::BoxStream<'a, Result<String, Box<dyn std::error::Error + Send + Sync>>> {
        use crate::ai::provider::ProviderManager;
        
        // In a real app we'd keep ProviderManager in AgentRuntime state
        let pm = Box::leak(Box::new(ProviderManager::new()));
        let provider_impl = pm.get_provider(provider);
        
        provider_impl.generate(prompt, model)
    }
}
