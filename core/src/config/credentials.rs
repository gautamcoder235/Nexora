use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub provider_name: String,
    pub api_key: String,
    pub endpoint: Option<String>,
    pub model: String,
    pub organization: Option<String>,
}

#[derive(Clone, Default)]
pub struct CredentialManager {
    keys: Arc<RwLock<HashMap<String, String>>>,
}

impl CredentialManager {
    pub fn new() -> Self {
        Self {
            keys: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn load_from_config(&self) -> anyhow::Result<()> {
        if let Some(config_path) = crate::config::get_global_config_path() {
            // Load from config.toml
            if config_path.exists() {
                let content = std::fs::read_to_string(&config_path)?;
                if let Ok(config) = toml::from_str::<crate::config::NexoraConfig>(&content) {
                    let mut keys = self.keys.write().await;
                    
                    // Iterate through profiles and map their provider to their api_key
                    for (_, profile) in config.profiles {
                        if let (Some(provider), Some(api_key)) = (profile.provider, profile.api_key) {
                            keys.insert(provider, api_key);
                        }
                    }
                }
            }
            
            // Hot-reload from global .env so the daemon picks up `nx setup` changes
            if let Some(parent) = config_path.parent() {
                let env_path = parent.join(".env");
                if env_path.exists() {
                    if let Ok(env_content) = std::fs::read_to_string(&env_path) {
                        let mut keys = self.keys.write().await;
                        for line in env_content.lines() {
                            let trimmed = line.trim();
                            if trimmed.is_empty() || trimmed.starts_with('#') { continue; }
                            if let Some((env_key, val)) = trimmed.split_once('=') {
                                let val_clean = val.trim().trim_matches('"').trim_matches('\'');
                                // E.g. OPENROUTER_API_KEY -> openrouter
                                if env_key.ends_with("_API_KEY") {
                                    let provider = env_key.replace("_API_KEY", "").to_lowercase();
                                    keys.insert(provider, val_clean.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    pub async fn get_provider_config(&self, provider: &str, model: &str) -> Option<ProviderConfig> {
        let keys = self.keys.read().await;
        // Priority: 1. In-memory map (loaded from config), 2. Environment variable fallback
        let api_key = keys.get(provider)
            .cloned()
            .or_else(|| {
                let env_key = format!("{}_API_KEY", provider.to_uppercase());
                std::env::var(&env_key).ok()
            });

        api_key.map(|key| ProviderConfig {
            provider_name: provider.to_string(),
            api_key: key,
            endpoint: None,
            model: model.to_string(),
            organization: None,
        })
    }
}
