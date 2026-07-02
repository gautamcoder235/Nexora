pub struct AgentRuntime {
    pub credential_manager: crate::config::credentials::CredentialManager,
    pub session_manager: crate::ai::session::SessionManager,
    pub intent_analyzer: crate::ai::intent::IntentAnalyzer,
    pub tool_registry: crate::ai::tools::ToolRegistry,
}

impl AgentRuntime {
    pub fn new() -> Self {
        Self {
            credential_manager: crate::config::credentials::CredentialManager::new(),
            session_manager: crate::ai::session::SessionManager::new(),
            intent_analyzer: crate::ai::intent::IntentAnalyzer::new(),
            tool_registry: crate::ai::tools::ToolRegistry::new(),
        }
    }
    
    pub async fn init(&self) {
        let _ = self.credential_manager.load_from_config().await;
    }
    
    pub async fn chat(&self, provider: &str, model: &str, prompt: &str) -> String {
        use futures::StreamExt;
        
        let mut stream = self.chat_stream(provider, model, prompt);
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
        use crate::ai::provider::factory::ProviderFactory;
        use async_stream::stream;
        
        let provider_owned = provider.to_string();
        let model_owned = model.to_string();
        let prompt_owned = prompt.to_string();
        let cred_mgr = self.credential_manager.clone();
        
        let s = stream! {
            // First load from config lazily if needed, then get config
            let _ = cred_mgr.load_from_config().await;
            
            let config = match cred_mgr.get_provider_config(&provider_owned, &model_owned).await {
                Some(c) => c,
                None => {
                    yield Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("API Key for provider '{}' not found in config.toml or environment variables", provider_owned))) as Box<dyn std::error::Error + Send + Sync>);
                    return;
                }
            };
            
            let provider_impl = match ProviderFactory::create_provider(&config) {
                Some(p) => p,
                None => {
                    yield Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("Provider '{}' is not supported by ProviderFactory", provider_owned))) as Box<dyn std::error::Error + Send + Sync>);
                    return;
                }
            };
            
            let mut inner_stream = provider_impl.generate(&prompt_owned, &model_owned);
            use futures::StreamExt;
            while let Some(chunk) = inner_stream.next().await {
                yield chunk;
            }
        };
        
        Box::pin(s)
    }
}
