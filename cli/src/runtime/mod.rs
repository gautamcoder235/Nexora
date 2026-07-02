use std::sync::Arc;
use std::collections::HashMap;
use nexora_core::config::ConfigContext;
use nexora_core::cache::CacheManager;
use nexora_core::event_bus::EventBus;
use nexora_core::metrics::MetricsCollector;
use nexora_core::workspace::WorkspaceContext;
use nexora_core::theme::{Theme, ThemeName};
use nexora_core::error::NexoraError;
use crate::services::ipc::{IpcConnection, NativeIpcConnection, MockIpcConnection};

pub struct ServiceContainer {
    pub config: Arc<ConfigContext>,
    pub cache: Arc<CacheManager>,
    pub event_bus: Arc<EventBus>,
    pub metrics: Arc<MetricsCollector>,
    pub workspace: Arc<WorkspaceContext>,
    pub theme: Arc<Theme>,
    pub ipc: Arc<parking_lot::Mutex<Box<dyn IpcConnection>>>,
}

impl ServiceContainer {
    pub fn bootstrap(cli_profile_override: Option<String>, cli_overrides: HashMap<String, String>) -> Result<Self, NexoraError> {
        let metrics = Arc::new(MetricsCollector::new());
        let event_bus = Arc::new(EventBus::new());
        let cache = Arc::new(CacheManager::new());
        let workspace = Arc::new(WorkspaceContext::detect());

        // Resolve Config layers
        let config = Arc::new(ConfigContext::load(cli_profile_override, cli_overrides)?);

        // Resolve Theme
        let theme_str = config.get_value("theme").unwrap_or_else(|| "neon-dark".to_string());
        let theme_name = match theme_str.as_str() {
            "light" => ThemeName::Light,
            "high-contrast" => ThemeName::HighContrast,
            "minimal" => ThemeName::Minimal,
            "no-color" => ThemeName::NoColor,
            "ci" => ThemeName::CiMode,
            _ => ThemeName::NeonDark,
        };
        let theme = Arc::new(Theme::new(theme_name));

        // Resolve IPC Connection
        #[cfg(windows)]
        let ipc_pipe = config.get_value("ipc.pipe_name").unwrap_or_else(|| "nexora-ipc".to_string());
        #[cfg(not(windows))]
        let ipc_socket = config.get_value("ipc.socket_path").unwrap_or_else(|| "/tmp/nexora.sock".to_string());

        let ipc_connection: Box<dyn IpcConnection> = if std::env::var("NEXORA_MOCK_IPC").is_ok() {
            Box::new(MockIpcConnection::new())
        } else {
            #[cfg(windows)]
            {
                Box::new(NativeIpcConnection::new(&ipc_pipe))
            }
            #[cfg(not(windows))]
            {
                Box::new(NativeIpcConnection::new(&ipc_socket))
            }
        };

        let ipc = Arc::new(parking_lot::Mutex::new(ipc_connection));

        metrics.record_startup_complete();

        Ok(Self {
            config,
            cache,
            event_bus,
            metrics,
            workspace,
            theme,
            ipc,
        })
    }
}
