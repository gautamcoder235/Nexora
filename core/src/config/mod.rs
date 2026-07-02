pub mod credentials;

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use directories::ProjectDirs;
use crate::error::NexoraError;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DisplayConfig {
    pub theme: Option<String>,
    pub icons: Option<bool>,
    pub unicode: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct IpcConfig {
    pub pipe_name: Option<String>,
    pub socket_path: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TelemetryConfig {
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ProfileConfig {
    pub model: Option<String>,
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub workspace_root: Option<String>,
    pub plugins: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NexoraConfig {
    pub version: String,
    pub active_profile: String,
    pub profiles: HashMap<String, ProfileConfig>,
    pub display: DisplayConfig,
    pub ipc: IpcConfig,
    pub telemetry: TelemetryConfig,
}

impl Default for NexoraConfig {
    fn default() -> Self {
        let mut profiles = HashMap::new();
        profiles.insert(
            "default".to_string(),
            ProfileConfig {
                model: Some("gemini-1.5-flash".to_string()),
                provider: Some("openrouter".to_string()),
                api_key: None,
                workspace_root: None,
                plugins: Some(vec![]),
            },
        );

        Self {
            version: "1.0.0".to_string(),
            active_profile: "default".to_string(),
            profiles,
            display: DisplayConfig {
                theme: Some("neon-dark".to_string()),
                icons: Some(true),
                unicode: Some(true),
            },
            ipc: IpcConfig {
                pipe_name: Some("nexora-ipc".to_string()),
                socket_path: Some("/tmp/nexora.sock".to_string()),
                timeout_ms: Some(1000),
            },
            telemetry: TelemetryConfig {
                enabled: Some(true),
            },
        }
    }
}

pub struct ConfigContext {
    pub active_profile: String,
    pub resolved_config: NexoraConfig,
    pub cli_overrides: HashMap<String, String>,
}

impl ConfigContext {
    pub fn load(cli_profile_override: Option<String>, cli_overrides: HashMap<String, String>) -> Result<Self, NexoraError> {
        // Load local .env file if it exists
        if let Ok(content) = fs::read_to_string(".env") {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if let Some((key, val)) = trimmed.split_once('=') {
                    // Remove quotes if present
                    let val_clean = val.trim().trim_matches('"').trim_matches('\'');
                    std::env::set_var(key.trim(), val_clean);
                }
            }
        }

        let mut loaded = NexoraConfig::default();

        // 1. Load System Config (lowest priority after defaults)
        if let Some(sys_path) = get_system_config_path() {
            if sys_path.exists() {
                if let Ok(content) = fs::read_to_string(&sys_path) {
                    if let Ok(parsed) = toml::from_str::<NexoraConfig>(&content) {
                        merge_configs(&mut loaded, parsed);
                    }
                }
            }
        }

        // 2. Load Global Config
        if let Some(global_path) = get_global_config_path() {
            if global_path.exists() {
                let content = fs::read_to_string(&global_path).map_err(|e| NexoraError::ConfigError {
                    message: format!("Failed to read global config: {}", e),
                    path: Some(global_path.to_string_lossy().to_string()),
                })?;
                let parsed = toml::from_str::<NexoraConfig>(&content).map_err(|e| NexoraError::ConfigError {
                    message: format!("Global config parse error: {}", e),
                    path: Some(global_path.to_string_lossy().to_string()),
                })?;
                merge_configs(&mut loaded, parsed);
            } else {
                // Auto-create global config with defaults if missing
                if let Some(parent) = global_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                if let Ok(serialized) = toml::to_string_pretty(&loaded) {
                    let _ = fs::write(&global_path, serialized);
                }
            }
        }

        // 3. Load Workspace Config (if exists in current directory or parents)
        if let Some(workspace_path) = find_workspace_config() {
            if workspace_path.exists() {
                let content = fs::read_to_string(&workspace_path).map_err(|e| NexoraError::ConfigError {
                    message: format!("Failed to read workspace config: {}", e),
                    path: Some(workspace_path.to_string_lossy().to_string()),
                })?;
                let parsed = toml::from_str::<NexoraConfig>(&content).map_err(|e| NexoraError::ConfigError {
                    message: format!("Workspace config parse error: {}", e),
                    path: Some(workspace_path.to_string_lossy().to_string()),
                })?;
                merge_configs(&mut loaded, parsed);
            }
        }

        // 4. Resolve Active Profile
        let mut active_profile = loaded.active_profile.clone();
        if let Some(ref env_profile) = std::env::var("NEXORA_PROFILE").ok() {
            active_profile = env_profile.clone();
        }
        if let Some(ref p_override) = cli_profile_override {
            active_profile = p_override.clone();
        }

        Ok(ConfigContext {
            active_profile,
            resolved_config: loaded,
            cli_overrides,
        })
    }

    /// Resolves a config value by checking standard 6 layers
    pub fn get_value(&self, key: &str) -> Option<String> {
        // Layer 1: CLI Flags Override
        if let Some(val) = self.cli_overrides.get(key) {
            return Some(val.clone());
        }

        // Layer 2: Env Variable Override
        let env_key = format!("NEXORA_{}", key.to_uppercase().replace('.', "_"));
        if let Ok(val) = std::env::var(&env_key) {
            return Some(val);
        }

        // Layers 3-5: Resolved Profile Config & Global values
        let profile = self.resolved_config.profiles.get(&self.active_profile);
        let default_profile = self.resolved_config.profiles.get("default");

        match key {
            "model" => profile.and_then(|p| p.model.clone())
                .or_else(|| default_profile.and_then(|p| p.model.clone())),
            "provider" => profile.and_then(|p| p.provider.clone())
                .or_else(|| default_profile.and_then(|p| p.provider.clone())),
            "api_key" => profile.and_then(|p| p.api_key.clone())
                .or_else(|| default_profile.and_then(|p| p.api_key.clone())),
            "workspace_root" => profile.and_then(|p| p.workspace_root.clone())
                .or_else(|| default_profile.and_then(|p| p.workspace_root.clone())),
            "theme" => self.resolved_config.display.theme.clone(),
            "icons" => self.resolved_config.display.icons.map(|v| v.to_string()),
            "unicode" => self.resolved_config.display.unicode.map(|v| v.to_string()),
            "ipc.pipe_name" => self.resolved_config.ipc.pipe_name.clone(),
            "ipc.socket_path" => self.resolved_config.ipc.socket_path.clone(),
            "ipc.timeout_ms" => self.resolved_config.ipc.timeout_ms.map(|v| v.to_string()),
            "telemetry.enabled" => self.resolved_config.telemetry.enabled.map(|v| v.to_string()),
            _ => None,
        }
    }
}

fn merge_configs(target: &mut NexoraConfig, source: NexoraConfig) {
    if !source.version.is_empty() {
        target.version = source.version;
    }
    if !source.active_profile.is_empty() {
        target.active_profile = source.active_profile;
    }

    // Merge profiles
    for (profile_name, profile_cfg) in source.profiles {
        let entry = target.profiles.entry(profile_name).or_insert_with(ProfileConfig::default);
        if profile_cfg.model.is_some() {
            entry.model = profile_cfg.model;
        }
        if profile_cfg.provider.is_some() {
            entry.provider = profile_cfg.provider;
        }
        if profile_cfg.api_key.is_some() {
            entry.api_key = profile_cfg.api_key;
        }
        if profile_cfg.workspace_root.is_some() {
            entry.workspace_root = profile_cfg.workspace_root;
        }
        if profile_cfg.plugins.is_some() {
            entry.plugins = profile_cfg.plugins;
        }
    }

    // Merge display config
    if source.display.theme.is_some() {
        target.display.theme = source.display.theme;
    }
    if source.display.icons.is_some() {
        target.display.icons = source.display.icons;
    }
    if source.display.unicode.is_some() {
        target.display.unicode = source.display.unicode;
    }

    // Merge IPC config
    if source.ipc.pipe_name.is_some() {
        target.ipc.pipe_name = source.ipc.pipe_name;
    }
    if source.ipc.socket_path.is_some() {
        target.ipc.socket_path = source.ipc.socket_path;
    }
    if source.ipc.timeout_ms.is_some() {
        target.ipc.timeout_ms = source.ipc.timeout_ms;
    }

    // Merge telemetry config
    if source.telemetry.enabled.is_some() {
        target.telemetry.enabled = source.telemetry.enabled;
    }
}

pub fn get_global_config_path() -> Option<PathBuf> {
    ProjectDirs::from("com", "nexora", "Nexora").map(|proj_dirs| proj_dirs.config_dir().join("config.toml"))
}

pub fn get_system_config_path() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("ProgramData").ok().map(|p| PathBuf::from(p).join("nexora").join("config.toml"))
    }
    #[cfg(not(windows))]
    {
        Some(PathBuf::from("/etc/nexora/config.toml"))
    }
}

pub fn find_workspace_config() -> Option<PathBuf> {
    let mut current = std::env::current_dir().ok()?;
    loop {
        let candidate = current.join(".nexora").join("config.toml");
        if candidate.exists() {
            return Some(candidate);
        }
        if !current.pop() {
            break;
        }
    }
    None
}
