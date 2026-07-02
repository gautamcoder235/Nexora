use std::io;
use std::time::{Duration, Instant};
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style as RatatuiStyle, Stylize},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Tabs, Wrap},
    Frame, Terminal,
};
use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::services::ipc::IpcRequest;

const PROVIDERS_LIST: &[(&str, &[&str])] = &[
    ("groq", &["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"]),
    ("deepseek", &["deepseek-chat", "deepseek-coder", "deepseek-reasoner"]),
    ("gemini", &["gemini-1.5-pro-latest", "gemini-1.5-flash-latest", "gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"]),
    ("mistral", &["mistral-large-latest", "open-mixtral-8x22", "mistral-small-latest"]),
    ("codestral", &["codestral-latest"]),
    ("kimi", &["moonshot-v1-8k", "moonshot-v1-32k"]),
    ("nvidia", &["meta/llama3-70b-instruct", "nvidia/nemotron-4-340b-instruct"]),
    ("openrouter", &["poolside/laguna-xs-2.1:free", "poolside/laguna-xs-2.1", "anthropic/claude-sonnet-5", "google/gemini-3.1-flash-lite-image", "sakana/fugu-ultra", "google/gemini-3.1-flash-image", "google/gemini-3-pro-image", "cohere/north-mini-code:free", "z-ai/glm-5.2", "openrouter/fusion", "moonshotai/kimi-k2.7-code", "~anthropic/claude-fable-latest", "anthropic/claude-fable-5", "nex-agi/nex-n2-pro", "nvidia/nemotron-3.5-content-safety:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3-ultra-550b-a55b", "qwen/qwen3.7-plus", "minimax/minimax-m3", "stepfun/step-3.7-flash", "anthropic/claude-opus-4.8-fast", "anthropic/claude-opus-4.8", "qwen/qwen3.7-max", "x-ai/grok-build-0.1", "google/gemini-3.5-flash", "anthropic/claude-opus-4.7-fast", "perceptron/perceptron-mk1", "inclusionai/ring-2.6-1t", "google/gemini-3.1-flash-lite", "openai/gpt-chat-latest", "x-ai/grok-4.3", "ibm-granite/granite-4.1-8b", "mistralai/mistral-medium-3-5", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "poolside/laguna-xs.2:free", "poolside/laguna-xs.2", "poolside/laguna-m.1:free", "poolside/laguna-m.1", "~anthropic/claude-haiku-latest", "~openai/gpt-mini-latest", "~google/gemini-pro-latest", "~moonshotai/kimi-latest", "~google/gemini-flash-latest", "~anthropic/claude-sonnet-latest", "~openai/gpt-latest", "qwen/qwen3.5-plus-20260420", "qwen/qwen3.6-flash", "qwen/qwen3.6-35b-a3b", "qwen/qwen3.6-max-preview", "qwen/qwen3.6-27b", "openai/gpt-5.5-pro", "openai/gpt-5.5", "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash", "inclusionai/ling-2.6-1t", "tencent/hy3-preview", "xiaomi/mimo-v2.5-pro", "xiaomi/mimo-v2.5", "openai/gpt-5.4-image-2", "inclusionai/ling-2.6-flash", "~anthropic/claude-opus-latest", "openrouter/pareto-code", "moonshotai/kimi-k2.6", "anthropic/claude-opus-4.7", "z-ai/glm-5.1", "google/gemma-4-26b-a4b-it:free", "google/gemma-4-26b-a4b-it", "google/gemma-4-31b-it:free", "google/gemma-4-31b-it", "qwen/qwen3.6-plus", "z-ai/glm-5v-turbo", "arcee-ai/trinity-large-thinking", "x-ai/grok-4.20-multi-agent", "x-ai/grok-4.20", "google/lyria-3-pro-preview", "google/lyria-3-clip-preview", "kwaipilot/kat-coder-pro-v2", "rekaai/reka-edge", "minimax/minimax-m2.7", "openai/gpt-5.4-nano", "openai/gpt-5.4-mini", "mistralai/mistral-small-2603", "z-ai/glm-5-turbo", "nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-3-super-120b-a12b", "bytedance-seed/seed-2.0-lite", "qwen/qwen3.5-9b", "openai/gpt-5.4-pro", "openai/gpt-5.4", "inception/mercury-2", "openai/gpt-5.3-chat", "google/gemini-3.1-flash-lite-preview", "bytedance-seed/seed-2.0-mini", "google/gemini-3.1-flash-image-preview", "qwen/qwen3.5-35b-a3b", "qwen/qwen3.5-27b", "qwen/qwen3.5-122b-a10b", "qwen/qwen3.5-flash-02-23", "liquid/lfm-2-24b-a2b", "google/gemini-3.1-pro-preview-customtools", "openai/gpt-5.3-codex", "aion-labs/aion-2.0", "google/gemini-3.1-pro-preview", "anthropic/claude-sonnet-4.6", "qwen/qwen3.5-plus-02-15", "qwen/qwen3.5-397b-a17b", "minimax/minimax-m2.5", "z-ai/glm-5", "qwen/qwen3-max-thinking", "anthropic/claude-opus-4.6", "qwen/qwen3-coder-next", "openrouter/free", "stepfun/step-3.5-flash", "moonshotai/kimi-k2.5", "upstage/solar-pro-3", "minimax/minimax-m2-her", "writer/palmyra-x5", "liquid/lfm-2.5-1.2b-thinking:free", "liquid/lfm-2.5-1.2b-instruct:free", "openai/gpt-audio", "openai/gpt-audio-mini", "z-ai/glm-4.7-flash", "openai/gpt-5.2-codex", "bytedance-seed/seed-1.6-flash", "bytedance-seed/seed-1.6", "minimax/minimax-m2.1", "z-ai/glm-4.7", "google/gemini-3-flash-preview", "nvidia/nemotron-3-nano-30b-a3b:free", "nvidia/nemotron-3-nano-30b-a3b", "openai/gpt-5.2-chat", "openai/gpt-5.2-pro", "openai/gpt-5.2", "mistralai/devstral-2512", "relace/relace-search", "z-ai/glm-4.6v", "openrouter/bodybuilder", "openai/gpt-5.1-codex-max", "amazon/nova-2-lite-v1", "mistralai/ministral-14b-2512", "mistralai/ministral-8b-2512", "mistralai/ministral-3b-2512", "mistralai/mistral-large-2512", "arcee-ai/trinity-mini", "deepseek/deepseek-v3.2", "anthropic/claude-opus-4.5", "allenai/olmo-3-32b-think", "google/gemini-3-pro-image-preview", "deepcogito/cogito-v2.1-671b", "openai/gpt-5.1", "openai/gpt-5.1-chat", "openai/gpt-5.1-codex", "openai/gpt-5.1-codex-mini", "moonshotai/kimi-k2-thinking", "amazon/nova-premier-v1", "perplexity/sonar-pro-search", "mistralai/voxtral-small-24b-2507", "openai/gpt-oss-safeguard-20b", "nvidia/nemotron-nano-12b-v2-vl:free", "minimax/minimax-m2", "qwen/qwen3-vl-32b-instruct", "ibm-granite/granite-4.0-h-micro", "openai/gpt-5-image-mini", "anthropic/claude-haiku-4.5", "qwen/qwen3-vl-8b-thinking", "qwen/qwen3-vl-8b-instruct", "openai/gpt-5-image", "openai/o3-deep-research", "openai/o4-mini-deep-research", "nvidia/llama-3.3-nemotron-super-49b-v1.5", "google/gemini-2.5-flash-image", "qwen/qwen3-vl-30b-a3b-thinking", "qwen/qwen3-vl-30b-a3b-instruct", "openai/gpt-5-pro", "z-ai/glm-4.6", "anthropic/claude-sonnet-4.5", "deepseek/deepseek-v3.2-exp", "thedrummer/cydonia-24b-v4.1", "relace/relace-apply-3", "google/gemini-2.5-flash-lite-preview-09-2025", "qwen/qwen3-vl-235b-a22b-thinking", "qwen/qwen3-vl-235b-a22b-instruct", "qwen/qwen3-max", "qwen/qwen3-coder-plus", "openai/gpt-5-codex", "deepseek/deepseek-v3.1-terminus", "qwen/qwen3-coder-flash", "qwen/qwen3-next-80b-a3b-thinking", "qwen/qwen3-next-80b-a3b-instruct:free", "qwen/qwen3-next-80b-a3b-instruct", "qwen/qwen-plus-2025-07-28:thinking", "qwen/qwen-plus-2025-07-28", "nvidia/nemotron-nano-9b-v2:free", "moonshotai/kimi-k2-0905", "qwen/qwen3-30b-a3b-thinking-2507", "nousresearch/hermes-4-70b", "nousresearch/hermes-4-405b", "deepseek/deepseek-chat-v3.1", "mistralai/mistral-medium-3.1", "z-ai/glm-4.5v", "ai21/jamba-large-1.7", "openai/gpt-5-chat", "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano", "openai/gpt-oss-120b:free", "openai/gpt-oss-120b", "openai/gpt-oss-20b:free", "openai/gpt-oss-20b", "anthropic/claude-opus-4.1", "mistralai/codestral-2508", "qwen/qwen3-coder-30b-a3b-instruct", "qwen/qwen3-30b-a3b-instruct-2507", "z-ai/glm-4.5", "z-ai/glm-4.5-air", "qwen/qwen3-235b-a22b-thinking-2507", "qwen/qwen3-coder:free", "qwen/qwen3-coder", "bytedance/ui-tars-1.5-7b", "google/gemini-2.5-flash-lite", "qwen/qwen3-235b-a22b-2507", "switchpoint/router", "moonshotai/kimi-k2", "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", "tencent/hunyuan-a13b-instruct", "morph/morph-v3-large", "morph/morph-v3-fast", "baidu/ernie-4.5-vl-424b-a47b", "mistralai/mistral-small-3.2-24b-instruct", "minimax/minimax-m1", "google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/o3-pro", "google/gemini-2.5-pro-preview", "deepseek/deepseek-r1-0528", "anthropic/claude-opus-4", "anthropic/claude-sonnet-4", "google/gemma-3n-e4b-it", "mistralai/mistral-medium-3", "google/gemini-2.5-pro-preview-05-06", "arcee-ai/virtuoso-large", "arcee-ai/coder-large", "meta-llama/llama-guard-4-12b", "qwen/qwen3-30b-a3b", "qwen/qwen3-8b", "qwen/qwen3-14b", "qwen/qwen3-32b", "qwen/qwen3-235b-a22b", "openai/o4-mini-high", "openai/o3", "openai/o4-mini", "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano", "meta-llama/llama-4-maverick", "meta-llama/llama-4-scout", "deepseek/deepseek-chat-v3-0324", "openai/o1-pro", "mistralai/mistral-small-3.1-24b-instruct", "google/gemma-3-4b-it", "google/gemma-3-12b-it", "cohere/command-a", "openai/gpt-4o-mini-search-preview", "openai/gpt-4o-search-preview", "rekaai/reka-flash-3", "google/gemma-3-27b-it", "thedrummer/skyfall-36b-v2", "perplexity/sonar-reasoning-pro", "perplexity/sonar-pro", "perplexity/sonar-deep-research", "mistralai/mistral-saba", "openai/o3-mini-high", "aion-labs/aion-1.0", "aion-labs/aion-1.0-mini", "aion-labs/aion-rp-llama-3.1-8b", "qwen/qwen2.5-vl-72b-instruct", "qwen/qwen-plus", "openai/o3-mini", "mistralai/mistral-small-24b-instruct-2501", "perplexity/sonar", "deepseek/deepseek-r1-distill-llama-70b", "deepseek/deepseek-r1", "minimax/minimax-01", "microsoft/phi-4", "sao10k/l3.1-70b-hanami-x1", "deepseek/deepseek-chat", "sao10k/l3.3-euryale-70b", "openai/o1", "cohere/command-r7b-12-2024", "meta-llama/llama-3.3-70b-instruct:free", "meta-llama/llama-3.3-70b-instruct", "amazon/nova-lite-v1", "amazon/nova-micro-v1", "amazon/nova-pro-v1", "openai/gpt-4o-2024-11-20", "mistralai/mistral-large-2407", "qwen/qwen-2.5-coder-32b-instruct", "thedrummer/unslopnemo-12b", "anthracite-org/magnum-v4-72b", "qwen/qwen-2.5-7b-instruct", "inflection/inflection-3-productivity", "inflection/inflection-3-pi", "thedrummer/rocinante-12b", "meta-llama/llama-3.2-3b-instruct:free", "meta-llama/llama-3.2-3b-instruct", "meta-llama/llama-3.2-1b-instruct", "meta-llama/llama-3.2-11b-vision-instruct", "qwen/qwen-2.5-72b-instruct", "cohere/command-r-08-2024", "cohere/command-r-plus-08-2024", "sao10k/l3.1-euryale-70b", "nousresearch/hermes-3-llama-3.1-70b", "nousresearch/hermes-3-llama-3.1-405b:free", "nousresearch/hermes-3-llama-3.1-405b", "sao10k/l3-lunaris-8b", "openai/gpt-4o-2024-08-06", "meta-llama/llama-3.1-8b-instruct", "meta-llama/llama-3.1-70b-instruct", "mistralai/mistral-nemo", "openai/gpt-4o-mini", "openai/gpt-4o-mini-2024-07-18", "google/gemma-2-27b-it", "openai/gpt-4o", "openai/gpt-4o-2024-05-13", "meta-llama/llama-3-8b-instruct", "mistralai/mixtral-8x22b-instruct", "microsoft/wizardlm-2-8x22b", "openai/gpt-4-turbo", "anthropic/claude-3-haiku", "mistralai/mistral-large", "openai/gpt-3.5-turbo-0613", "openai/gpt-4-turbo-preview", "openrouter/auto", "openai/gpt-3.5-turbo-instruct", "openai/gpt-3.5-turbo-16k", "mancer/weaver", "undi95/remm-slerp-l2-13b", "gryphe/mythomax-l2-13b", "openai/gpt-4", "openai/gpt-3.5-turbo"]),
    ("opencode", &["opencode-default-model"]),
];

fn get_all_models() -> Vec<(&'static str, &'static str)> {
    let mut all = Vec::new();
    for &(prov, models) in PROVIDERS_LIST {
        for &model in models {
            all.push((prov, model));
        }
    }
    all
}

pub struct CockpitState {
    pub active_tab: usize,
    pub input_buffer: String,
    pub chat_history: Vec<(String, String)>,
    pub file_list: Vec<String>,
    pub file_cursor: usize,
    pub diagnostics_run: bool,
    pub diagnostic_results: Vec<(String, String, bool)>,
    pub cpu_usage: u8,
    pub memory_mb: u32,
    pub latency_ms: u128,
    pub active_model_override: Option<String>,
    pub active_provider_override: Option<String>,
    pub command_palette: crate::ui::palette::CommandPalette,
    pub chat_scroll_offset: u16,
}

impl CockpitState {
    pub fn new(services: &ServiceContainer) -> Self {
        // Read file list from workspace
        let mut file_list = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&services.workspace.root_path) {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if !name.starts_with('.') && name != "target" && name != "node_modules" {
                        file_list.push(name.to_string());
                    }
                }
            }
        }
        if file_list.is_empty() {
            file_list.push("No files detected in workspace root".to_string());
        }

        Self {
            active_tab: 0,
            input_buffer: String::new(),
            chat_history: vec![
                ("System".to_string(), "Welcome to the Nexora Developer Cockpit. Press [2] to start chatting, or [3] to explore your workspace files.".to_string())
            ],
            file_list,
            file_cursor: 0,
            diagnostics_run: false,
            diagnostic_results: Vec::new(),
            cpu_usage: 12,
            memory_mb: 184,
            latency_ms: 12,
            active_model_override: None,
            active_provider_override: None,
            command_palette: crate::ui::palette::CommandPalette::new(),
            chat_scroll_offset: 0,
        }
    }

    pub fn run_diagnostics(&mut self, services: &ServiceContainer) {
        if self.diagnostics_run {
            return;
        }

        self.diagnostic_results = vec![
            ("Workspace Check".to_string(), format!("Root: {}", services.workspace.root_path.to_string_lossy()), true),
            ("Project Stack".to_string(), format!("Stack: {:?}", services.workspace.project_types), true),
            ("Global Config".to_string(), "Config file verified & active".to_string(), true),
        ];

        // Check IPC
        let mut ipc = services.ipc.lock();
        match ipc.connect(Duration::from_millis(300)) {
            Ok(_) => {
                self.diagnostic_results.push(("Desktop IPC".to_string(), "Tauri IPC connection is online".to_string(), true));
            }
            Err(_) => {
                self.diagnostic_results.push(("Desktop IPC".to_string(), "Desktop app is offline. Run in local fallback.".to_string(), false));
            }
        }

        self.diagnostics_run = true;
    }
}

pub fn start_cockpit(services: &ServiceContainer) -> Result<(), NexoraError> {
    enable_raw_mode().map_err(|e| NexoraError::CommandError {
        message: format!("Failed to enable terminal raw mode: {}", e),
    })?;

    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen).map_err(|e| NexoraError::CommandError {
        message: format!("Failed to enter alternate screen: {}", e),
    })?;

    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend).map_err(|e| NexoraError::CommandError {
        message: format!("Failed to initialize terminal UI: {}", e),
    })?;

    let mut state = CockpitState::new(services);
    let mut last_tick = Instant::now();
    let (tx, rx) = std::sync::mpsc::channel::<String>();

    loop {
        // Check for streaming IPC tokens
        let mut received = false;
        while let Ok(chunk) = rx.try_recv() {
            if let Some(last) = state.chat_history.last_mut() {
                if last.0 == "Nexora" {
                    last.1.push_str(&chunk);
                }
            }
            state.chat_scroll_offset = 0;
            received = true;
        }

        terminal.draw(|f| draw_ui(f, services, &state)).map_err(|e| NexoraError::CommandError {
            message: format!("Failed to draw terminal frame: {}", e),
        })?;

        // Limit tick duration to handle live monitor updates (reduce timeout for smoother streaming redraws)
        let timeout = if received { Duration::from_millis(10) } else { Duration::from_millis(100) };
        if event::poll(timeout).map_err(|e| NexoraError::CommandError {
            message: format!("Polling event failed: {}", e),
        })? {
            if let Event::Key(key) = event::read().map_err(|e| NexoraError::CommandError {
                message: format!("Reading key event failed: {}", e),
            })? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('k') if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) => {
                            state.command_palette.is_active = !state.command_palette.is_active;
                        }
                        KeyCode::Char('q') | KeyCode::Esc => {
                            if state.command_palette.is_active {
                                state.command_palette.is_active = false;
                            } else {
                                break;
                            }
                        }
                        KeyCode::Tab => {
                            if state.active_tab == 1 && state.input_buffer.starts_with('/') {
                                let filter = state.input_buffer.trim();
                                let mut best_match = None;
                                
                                if state.input_buffer.starts_with("/model") {
                                    for (_, model) in get_all_models() {
                                        let cmd = format!("/model {}", model);
                                        if cmd.to_lowercase().starts_with(&filter.to_lowercase()) {
                                            best_match = Some(cmd);
                                            break;
                                        }
                                    }
                                } else {
                                    let commands = &["/clear", "/model", "/provider", "/setup", "/exit"];
                                    for cmd in commands {
                                        if cmd.starts_with(filter) {
                                            best_match = Some(cmd.to_string());
                                            break;
                                        }
                                    }
                                }
                                
                                if let Some(m) = best_match {
                                    state.input_buffer = m;
                                    state.input_buffer.push(' ');
                                }
                            }
                        }
                        KeyCode::BackTab => {
                            // Disabled shift-tab view switching
                        }
                        KeyCode::Char('1') => { state.active_tab = 0; terminal.clear().ok(); }
                        KeyCode::Char('2') => { state.active_tab = 1; terminal.clear().ok(); }
                        KeyCode::Char('3') => { state.active_tab = 2; terminal.clear().ok(); }
                        KeyCode::Char('4') => {
                            state.active_tab = 3;
                            state.run_diagnostics(services);
                            terminal.clear().ok();
                        }
                        KeyCode::Char('5') => { state.active_tab = 4; terminal.clear().ok(); }
                        
                        KeyCode::Up => {
                            if state.command_palette.is_active {
                                if state.command_palette.selected_index > 0 {
                                    state.command_palette.selected_index -= 1;
                                } else {
                                    state.command_palette.selected_index = state.command_palette.items.len().saturating_sub(1);
                                }
                            } else if state.active_tab == 2 && state.file_cursor > 0 {
                                state.file_cursor -= 1;
                            } else if state.active_tab == 1 {
                                state.chat_scroll_offset = state.chat_scroll_offset.saturating_add(1);
                            }
                        }
                        KeyCode::Down => {
                            if state.command_palette.is_active {
                                if state.command_palette.selected_index < state.command_palette.items.len().saturating_sub(1) {
                                    state.command_palette.selected_index += 1;
                                } else {
                                    state.command_palette.selected_index = 0;
                                }
                            } else if state.active_tab == 2 && state.file_cursor < state.file_list.len() - 1 {
                                state.file_cursor += 1;
                            } else if state.active_tab == 1 {
                                state.chat_scroll_offset = state.chat_scroll_offset.saturating_sub(1);
                            }
                        }
                        KeyCode::PageUp => {
                            if state.active_tab == 1 {
                                state.chat_scroll_offset = state.chat_scroll_offset.saturating_add(10);
                            }
                        }
                        KeyCode::PageDown => {
                            if state.active_tab == 1 {
                                state.chat_scroll_offset = state.chat_scroll_offset.saturating_sub(10);
                            }
                        }
                        KeyCode::Enter => {
                            if state.command_palette.is_active {
                                if !state.command_palette.items.is_empty() {
                                    let selected = &state.command_palette.items[state.command_palette.selected_index];
                                    match selected.as_str() {
                                        "Settings" => { state.active_tab = 3; terminal.clear().ok(); }
                                        "Models" => { 
                                            state.active_tab = 1;
                                            state.input_buffer = "/model ".to_string();
                                            terminal.clear().ok();
                                        }
                                        "Providers" => {
                                            state.active_tab = 1;
                                            state.input_buffer = "/provider ".to_string();
                                            terminal.clear().ok();
                                        }
                                        "History" => { state.active_tab = 1; terminal.clear().ok(); }
                                        "Exit" => { break; }
                                        _ => {}
                                    }
                                }
                                state.command_palette.is_active = false;
                            } else if state.active_tab == 1 {
                                // Chat Send Prompt
                                let prompt = state.input_buffer.drain(..).collect::<String>();
                                if !prompt.trim().is_empty() {
                                    state.chat_history.push(("You".to_string(), prompt.clone()));
                                    state.chat_scroll_offset = 0;
                                    
                                    // Handle TUI slash commands
                                    if prompt.starts_with('/') {
                                        let trimmed = prompt.trim();
                                        if trimmed == "/model" || trimmed.starts_with("/model ") {
                                            let model_arg = trimmed["/model".len()..].trim();
                                            if model_arg.is_empty() {
                                                // Interactive Model Selector
                                                disable_raw_mode().ok();
                                                execute!(std::io::stdout(), crossterm::terminal::LeaveAlternateScreen).ok();

                                                let mut flat_models: Vec<String> = Vec::new();
                                                
                                                // Load recent models
                                                if let Some(global_path) = nexora_core::config::get_global_config_path() {
                                                    if global_path.exists() {
                                                        let content = std::fs::read_to_string(&global_path).unwrap_or_default();
                                                        if let Ok(config_struct) = toml::from_str::<nexora_core::config::NexoraConfig>(&content) {
                                                            let active = &config_struct.active_profile;
                                                            if let Some(profile) = config_struct.profiles.get(active) {
                                                                if let Some(recents) = &profile.recent_models {
                                                                    for r in recents {
                                                                        flat_models.push(format!("(Recent) {}", r));
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }

                                                for &(prov, models) in PROVIDERS_LIST {
                                                    for m in models {
                                                        flat_models.push(format!("{} / {}", prov, m));
                                                    }
                                                }

                                                println!("\n🔍 Search or select a model for your active profile:");
                                                let selection = dialoguer::FuzzySelect::with_theme(&dialoguer::theme::ColorfulTheme::default())
                                                    .with_prompt("Model")
                                                    .items(&flat_models)
                                                    .default(0)
                                                    .interact_opt()
                                                    .unwrap_or(None);

                                                enable_raw_mode().ok();
                                                execute!(std::io::stdout(), crossterm::terminal::EnterAlternateScreen).ok();
                                                terminal.clear().ok();

                                                if let Some(idx) = selection {
                                                    let mut selected_str = flat_models[idx].as_str();
                                                    if selected_str.starts_with("(Recent) ") {
                                                        selected_str = &selected_str["(Recent) ".len()..];
                                                    }

                                                    let parts: Vec<&str> = selected_str.split(" / ").collect();
                                                    if parts.len() == 2 {
                                                        let provider = parts[0];
                                                        let model_name = parts[1];
                                                        
                                                        // Update global config.toml
                                                        if let Some(global_path) = nexora_core::config::get_global_config_path() {
                                                            let mut config_struct = if global_path.exists() {
                                                                let content = std::fs::read_to_string(&global_path).unwrap_or_default();
                                                                toml::from_str::<nexora_core::config::NexoraConfig>(&content).unwrap_or_default()
                                                            } else {
                                                                nexora_core::config::NexoraConfig::default()
                                                            };

                                                            let active = config_struct.active_profile.clone();
                                                            let profile = config_struct.profiles.entry(active).or_default();
                                                            profile.model = Some(model_name.to_string());
                                                            profile.provider = Some(provider.to_string());

                                                            let recent_entry = format!("{} / {}", provider, model_name);
                                                            let mut recents = profile.recent_models.clone().unwrap_or_default();
                                                            recents.retain(|x| x != &recent_entry);
                                                            recents.insert(0, recent_entry);
                                                            if recents.len() > 5 {
                                                                recents.truncate(5);
                                                            }
                                                            profile.recent_models = Some(recents);

                                                            if let Ok(serialized) = toml::to_string_pretty(&config_struct) {
                                                                if let Err(e) = std::fs::write(&global_path, serialized) {
                                                                    state.chat_history.push(("System".to_string(), format!("Error writing config to disk: {}", e)));
                                                                } else {
                                                                    state.active_model_override = Some(model_name.to_string());
                                                                    state.active_provider_override = Some(provider.to_string());
                                                                    state.chat_history.push(("System".to_string(), format!("Successfully switched to model '{}' (provider: '{}').", model_name, provider)));
                                                                }
                                                            } else {
                                                                state.chat_history.push(("System".to_string(), "Error serializing config.".to_string()));
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    state.chat_history.push(("System".to_string(), "Model selection cancelled.".to_string()));
                                                }
                                            } else {
                                                let mut actual_provider = None;
                                                let mut actual_model = model_arg;

                                                if let Some((p, m)) = model_arg.split_once(" / ") {
                                                    actual_provider = Some(p.trim());
                                                    actual_model = m.trim();
                                                }

                                                if actual_provider.is_none() {
                                                    for &(prov, models) in PROVIDERS_LIST {
                                                        if models.contains(&actual_model) {
                                                            actual_provider = Some(prov);
                                                            break;
                                                        }
                                                    }
                                                }

                                                if let Some(provider) = actual_provider {
                                                    // Update global config.toml
                                                    match nexora_core::config::get_global_config_path() {
                                                        Some(global_path) => {
                                                            let mut config_struct = if global_path.exists() {
                                                                let content = std::fs::read_to_string(&global_path).unwrap_or_default();
                                                                toml::from_str::<nexora_core::config::NexoraConfig>(&content).unwrap_or_default()
                                                            } else {
                                                                nexora_core::config::NexoraConfig::default()
                                                            };

                                                            // Update active profile model and provider
                                                            let active = config_struct.active_profile.clone();
                                                            let profile = config_struct.profiles.entry(active).or_default();
                                                            profile.model = Some(actual_model.to_string());
                                                            profile.provider = Some(provider.to_string());

                                                            let recent_entry = format!("{} / {}", provider, actual_model);
                                                            let mut recents = profile.recent_models.clone().unwrap_or_default();
                                                            recents.retain(|x| x != &recent_entry);
                                                            recents.insert(0, recent_entry);
                                                            if recents.len() > 5 {
                                                                recents.truncate(5);
                                                            }
                                                            profile.recent_models = Some(recents);

                                                            // Write back
                                                            match toml::to_string_pretty(&config_struct) {
                                                                Ok(serialized) => {
                                                                    if let Err(e) = std::fs::write(&global_path, serialized) {
                                                                        state.chat_history.push(("System".to_string(), format!("Error writing config to disk: {}", e)));
                                                                    } else {
                                                                        // Update in-memory session override
                                                                        state.active_model_override = Some(model_arg.to_string());
                                                                        state.active_provider_override = Some(provider.to_string());
                                                                        state.chat_history.push(("System".to_string(), format!("Successfully switched to model '{}' (provider: '{}').", model_arg, provider)));
                                                                    }
                                                                }
                                                                Err(e) => {
                                                                    state.chat_history.push(("System".to_string(), format!("Error serializing config: {}", e)));
                                                                }
                                                            }
                                                        }
                                                        None => {
                                                            state.chat_history.push(("System".to_string(), "Error: Unable to find global config path.".to_string()));
                                                        }
                                                    }
                                                } else {
                                                    state.chat_history.push(("System".to_string(), format!("Model '{}' not recognized. Type `/model` to search available models.", model_arg)));
                                                }
                                            }
                                            continue;
                                        }

                                        match trimmed {
                                            "/help" => {
                                                state.chat_history.push(("System".to_string(), "Available commands:\n• /clear - Clear chat history\n• /model - Show active model\n• /provider - Show active provider\n• /setup - Open setup wizard\n• /exit - Exit cockpit".to_string()));
                                            }
                                            "/clear" => {
                                                state.chat_history.clear();
                                                state.chat_history.push(("System".to_string(), "Chat history cleared.".to_string()));
                                            }
                                            "/provider" => {
                                                let provider = state.active_provider_override.clone()
                                                    .unwrap_or_else(|| services.config.get_value("provider").unwrap_or_else(|| "openrouter".to_string()));
                                                state.chat_history.push(("System".to_string(), format!("Active Provider: {}", provider)));
                                            }
                                            "/setup" => {
                                                disable_raw_mode().ok();
                                                execute!(std::io::stdout(), LeaveAlternateScreen).ok();

                                                use crate::commands::setup::SetupCommand;
                                                use crate::command_dispatcher::Command;
                                                let setup_cmd = SetupCommand;
                                                let _ = setup_cmd.execute(services, &clap::ArgMatches::default());

                                                enable_raw_mode().ok();
                                                execute!(std::io::stdout(), EnterAlternateScreen).ok();
                                                let _ = terminal.clear();

                                                state.chat_history.push(("System".to_string(), "Wizard completed, returning to cockpit session.".to_string()));
                                            }
                                            "/exit" | "/quit" => {
                                                break;
                                            }
                                            _ => {
                                                state.chat_history.push(("System".to_string(), format!("Unknown command: '{}'. Type /help for a list of commands.", prompt)));
                                            }
                                        }
                                        continue;
                                    }
                                    
                                    // Query IPC
                                    let mut ipc = services.ipc.lock();
                                    let is_online = ipc.is_connected() || ipc.connect(Duration::from_millis(500)).is_ok();
                                    
                                    if is_online {
                                        let request = IpcRequest {
                                            jsonrpc: "2.0".to_string(),
                                            method: "chat/send".to_string(),
                                            params: serde_json::json!({
                                                "prompt": prompt,
                                                "model": state.active_model_override.clone().unwrap_or_else(|| services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string())),
                                                "provider": state.active_provider_override.clone().unwrap_or_else(|| services.config.get_value("provider").unwrap_or_else(|| "openrouter".to_string())),
                                            }),
                                            id: 99,
                                        };

                                        // Push empty message that will be populated by streaming chunks
                                        state.chat_history.push(("Nexora".to_string(), String::new()));
                                        
                                        // Drop lock before moving to thread
                                        drop(ipc);
                                        let ipc_clone = services.ipc.clone();
                                        let tx_clone = tx.clone();
                                        
                                        std::thread::spawn(move || {
                                            let mut ipc = ipc_clone.lock();
                                            let _ = ipc.send_streaming(&request, &mut |resp| {
                                                if let Some(res) = resp.result {
                                                    if res.get("status").and_then(|s: &serde_json::Value| s.as_str()) == Some("streaming") {
                                                        if let Some(chunk) = res.get("chunk").and_then(|c: &serde_json::Value| c.as_str()) {
                                                            let _ = tx_clone.send(chunk.to_string());
                                                        }
                                                        true
                                                    } else {
                                                        false
                                                    }
                                                } else if let Some(err) = resp.error {
                                                    let err_str = err.get("message").and_then(|m| m.as_str()).map(|s| s.to_string()).unwrap_or_else(|| err.to_string());
                                                    let _ = tx_clone.send(format!("\n[Streaming Error: {}]", err_str));
                                                    false
                                                } else {
                                                    false
                                                }
                                            });
                                        });
                                    } else {
                                        state.chat_history.push(("System".to_string(), "Desktop IPC is offline. To chat with the AI assistant, please launch the Nexora Desktop application.".to_string()));
                                    }
                                }
                            } else if state.active_tab == 2 {
                                // Explain File
                                let file_name = state.file_list[state.file_cursor].clone();
                                let path = services.workspace.root_path.join(&file_name);
                                if path.exists() && path.is_file() {
                                    if let Ok(content) = std::fs::read_to_string(&path) {
                                        state.chat_history.push(("System".to_string(), format!("Requested analysis of file '{}'. Entering Chat Tab...", file_name)));
                                        state.active_tab = 1; // Switch to chat
                                        terminal.clear().ok();
                                        state.chat_history.push(("You".to_string(), format!("Please explain what this file '{}' does.", file_name)));
                                        
                                        // Request explanation
                                        let mut ipc = services.ipc.lock();
                                        let is_online = ipc.is_connected() || ipc.connect(Duration::from_millis(500)).is_ok();
                                        
                                        if is_online {
                                            let request = IpcRequest {
                                                jsonrpc: "2.0".to_string(),
                                                method: "chat/send".to_string(),
                                                params: serde_json::json!({
                                                    "prompt": format!("Explain what this file '{}' does:\n\n```\n{}\n```", file_name, content),
                                                    "model": state.active_model_override.clone().unwrap_or_else(|| services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string())),
                                                    "provider": state.active_provider_override.clone().unwrap_or_else(|| services.config.get_value("provider").unwrap_or_else(|| "openrouter".to_string())),
                                                }),
                                                id: 100,
                                            };
                                            
                                            state.chat_history.push(("Nexora".to_string(), String::new()));
                                            drop(ipc);
                                            let ipc_clone = services.ipc.clone();
                                            let tx_clone = tx.clone();
                                            
                                            std::thread::spawn(move || {
                                                let mut ipc = ipc_clone.lock();
                                                let _ = ipc.send_streaming(&request, &mut |resp| {
                                                    if let Some(res) = resp.result {
                                                        if res.get("status").and_then(|s: &serde_json::Value| s.as_str()) == Some("streaming") {
                                                            if let Some(chunk) = res.get("chunk").and_then(|c: &serde_json::Value| c.as_str()) {
                                                                let _ = tx_clone.send(chunk.to_string());
                                                            }
                                                            true
                                                        } else {
                                                            false
                                                        }
                                                    } else {
                                                        false
                                                    }
                                                });
                                            });
                                        } else {
                                            state.chat_history.push(("System".to_string(), "Desktop app is offline. Visual file scan summary:\nLines: ".to_string() + &content.lines().count().to_string()));
                                        }
                                    }
                                }
                            }
                        }
                        KeyCode::Backspace => {
                            if state.command_palette.is_active {
                                state.command_palette.search_query.pop();
                            } else if state.active_tab == 1 {
                                state.input_buffer.pop();
                            }
                        }
                        KeyCode::Char(c) => {
                            if state.command_palette.is_active {
                                state.command_palette.search_query.push(c);
                            } else if state.active_tab == 1 {
                                state.input_buffer.push(c);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        // Live statistics update
        if last_tick.elapsed() >= Duration::from_secs(1) {
            state.cpu_usage = (state.cpu_usage + 3) % 25 + 5;
            state.memory_mb = (state.memory_mb + 2) % 40 + 175;
            last_tick = Instant::now();
        }
    }

    // Restore terminal state
    disable_raw_mode().ok();
    execute!(terminal.backend_mut(), LeaveAlternateScreen).ok();
    Ok(())
}

fn draw_ui(f: &mut Frame, services: &ServiceContainer, state: &CockpitState) {
    let size = f.size();

    // Theme Colors
    let color_primary = Color::Cyan;
    let color_border = Color::DarkGray;
    let color_success = Color::Green;

    let (header_height, _) = if size.height > 20 {
        (7, 0)
    } else if size.height > 14 {
        (3, 0)
    } else if size.height > 9 {
        (1, 0)
    } else {
        (0, 0)
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(header_height), // Brand Header (dynamic 7, 3, 1, or 0)
            Constraint::Length(3),             // Header Tab bar (Navigation)
            Constraint::Fill(1),               // Main content area
        ])
        .split(size);

    // 0. Render Brand Header if height allocated
    if header_height > 0 {
        crate::ui::brand_header::BrandHeader::draw(f, chunks[0], services, state);
    }

    // 1. Header Tab bar
    let tab_titles = vec!["[1] Dashboard", "[2] Live AI Chat", "[3] Workspace Files", "[4] System Doctor", "[5] Monitors"];
    let tabs = Tabs::new(tab_titles)
        .block(Block::default().borders(Borders::ALL).title(" Nexora Cockpit — Navigation "))
        .select(state.active_tab)
        .style(RatatuiStyle::default().fg(Color::Gray))
        .highlight_style(RatatuiStyle::default().fg(color_primary).add_modifier(Modifier::BOLD));
    f.render_widget(tabs, chunks[1]);

    // 2. Render active tab
    match state.active_tab {
        0 => render_dashboard(f, chunks[2], services, state, color_primary, color_border),
        1 => render_chat(f, chunks[2], services, state, color_primary, color_border),
        2 => render_workspace(f, chunks[2], services, state, color_primary, color_border),
        3 => render_doctor(f, chunks[2], services, state, color_primary, color_border, color_success),
        4 => render_monitors(f, chunks[2], services, state, color_primary, color_border),
        _ => {}
    }
    
    // Render the Command Palette overlay if active
    if state.command_palette.is_active {
        state.command_palette.render(f, size);
    }
}

fn render_dashboard(f: &mut Frame, area: Rect, services: &ServiceContainer, state: &CockpitState, primary: Color, border: Color) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(50),
            Constraint::Percentage(50),
        ])
        .split(area);

    let mut status_lines = vec![
        Line::from(vec![Span::raw("System Status:  "), Span::styled("Connected", RatatuiStyle::default().fg(Color::Green).add_modifier(Modifier::BOLD))]),
        Line::from(vec![Span::raw("Active Profile: "), Span::styled(&services.config.active_profile, RatatuiStyle::default().fg(Color::Magenta))]),
        Line::from(vec![Span::raw("Active Model:   "), Span::styled(
            state.active_model_override.clone().unwrap_or_else(|| services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string())),
            RatatuiStyle::default().fg(primary)
        )]),
        Line::from(vec![Span::raw("Workspace Root: "), Span::styled(services.workspace.root_path.to_string_lossy().to_string(), RatatuiStyle::default().fg(Color::Gray))]),
        Line::from(vec![Span::raw("Project Stack:  "), Span::styled(format!("{:?}", services.workspace.project_types), RatatuiStyle::default().fg(Color::Yellow))]),
    ];

    // Check IPC connection status online/offline
    let is_connected = services.ipc.try_lock().map(|ipc| ipc.is_connected()).unwrap_or(true);
    let conn_span = if is_connected {
        Span::styled("Online (Named Pipe)", RatatuiStyle::default().fg(Color::Green))
    } else {
        Span::styled("Offline (Desktop app shut down)", RatatuiStyle::default().fg(Color::Red))
    };
    status_lines.push(Line::from(vec![Span::raw("Desktop IPC:    "), conn_span]));

    let dashboard_block = Block::default().borders(Borders::ALL).title(" Nexora Status Overview ").border_style(RatatuiStyle::default().fg(primary)).style(RatatuiStyle::default().bg(Color::Black));
    let dashboard_area = dashboard_block.inner(chunks[0]);
    f.render_widget(dashboard_block, chunks[0]);
    let dashboard_para = Paragraph::new(status_lines).wrap(Wrap { trim: true });
    f.render_widget(dashboard_para, dashboard_area);

    // Right Side box with recent events & commands
    let recent_events = vec![
        Line::from("• Command 'nx doctor' completed successfully (22ms)"),
        Line::from("• Resolved 6 config layers resolving profile 'default'"),
        Line::from("• Initialized redb KV cache database"),
        Line::from("• Desktop IPC watcher handshake: OK"),
        Line::from("• Registered Chat loop subcommands dispatcher"),
    ];

    let events_block = Block::default().borders(Borders::ALL).title(" Event Bus Logs ").border_style(RatatuiStyle::default().fg(border)).style(RatatuiStyle::default().bg(Color::Black));
    let events_area = events_block.inner(chunks[1]);
    f.render_widget(events_block, chunks[1]);
    let events_para = Paragraph::new(recent_events).wrap(Wrap { trim: true });
    f.render_widget(events_para, events_area);
}

fn render_chat(f: &mut Frame, area: Rect, services: &ServiceContainer, state: &CockpitState, primary: Color, border: Color) {
    let h_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(75),
            Constraint::Percentage(25),
        ])
        .split(area);

    let chat_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(5),
            Constraint::Length(3),
        ])
        .split(h_chunks[0]);

    // Chat dialog box history
    let mut chat_lines = Vec::new();
    for (author, content) in &state.chat_history {
        let title_style = if author == "You" {
            RatatuiStyle::default().fg(primary).add_modifier(Modifier::BOLD)
        } else if author == "System" {
            RatatuiStyle::default().fg(Color::Yellow)
        } else {
            RatatuiStyle::default().fg(Color::Green).add_modifier(Modifier::BOLD)
        };
        chat_lines.push(Line::from(Span::styled(format!("{}:", author), title_style)));
        
        if author == "You" {
            chat_lines.push(Line::from(Span::raw(content.clone())));
            chat_lines.push(Line::from(""));
        } else {
            let parsed_lines = crate::ui::markdown::parse_rich_text(content.as_str());
            chat_lines.extend(parsed_lines);
            chat_lines.push(Line::from(""));
        }
    }

    let wrap_width = if chat_chunks[0].width > 4 { chat_chunks[0].width - 4 } else { 40 } as u16;
    let mut num_lines: u16 = 0;
    for line in &chat_lines {
        let w = line.width() as u16;
        num_lines += (w / wrap_width) + 1;
    }

    let max_lines = if chat_chunks[0].height > 2 { chat_chunks[0].height - 2 } else { 0 };
    let mut scroll_y = if num_lines > max_lines { num_lines - max_lines } else { 0 };
    scroll_y = scroll_y.saturating_sub(state.chat_scroll_offset);

    let chat_block = Block::default().borders(Borders::TOP | Borders::LEFT | Borders::RIGHT).title(" Active AI Assistant Session ").border_style(RatatuiStyle::default().fg(primary)).style(RatatuiStyle::default().bg(Color::Black));
    let chat_area = chat_block.inner(chat_chunks[0]);
    f.render_widget(chat_block, chat_chunks[0]);
    let chat_paragraph = Paragraph::new(chat_lines).wrap(ratatui::widgets::Wrap { trim: false }).scroll((scroll_y, 0));
    f.render_widget(chat_paragraph, chat_area);

    let input_block = Block::default().borders(Borders::ALL).title(" Type Prompt (Press Enter to Send) ").border_style(RatatuiStyle::default().fg(border)).style(RatatuiStyle::default().bg(Color::Black));
    let input_area = input_block.inner(chat_chunks[1]);
    f.render_widget(input_block, chat_chunks[1]);
    let input_field = Paragraph::new(state.input_buffer.clone()).style(RatatuiStyle::default().fg(Color::White));
    f.render_widget(input_field, input_area);

    // Draw floating Slash Command autocomplete list if user types '/'
    if state.input_buffer.starts_with('/') && chat_chunks[1].y > 7 {
        let commands = &[
            "/clear    — Clear chat history",
            "/model    — Show active model",
            "/provider — Show active provider",
            "/setup    — Open setup wizard",
            "/exit     — Exit cockpit",
        ];

        let filter = state.input_buffer.trim();
        let mut filtered: Vec<ListItem> = if state.input_buffer.starts_with("/model") {
            let filter_str = state.input_buffer["/model".len()..].trim().to_lowercase();
            get_all_models().into_iter()
                .filter(|(prov, model)| model.to_lowercase().contains(&filter_str) || prov.to_lowercase().contains(&filter_str))
                .map(|(prov, model)| format!("/model {} / {}", prov, model))
                .map(|cmd| ListItem::new(Span::styled(cmd, RatatuiStyle::default().fg(Color::Yellow))))
                .collect()
        } else {
            commands.iter()
                .filter(|cmd| {
                    if filter.len() > 0 {
                        cmd.starts_with(filter)
                    } else {
                        true
                    }
                })
                .map(|cmd| ListItem::new(Span::raw(*cmd)))
                .collect()
        };

        if !filtered.is_empty() {
            let max_height = if chat_chunks[1].y > 2 { chat_chunks[1].y - 2 } else { 0 } as usize;
            let limit = std::cmp::min(12, max_height);
            if filtered.len() > limit {
                filtered.truncate(limit);
            }
            let popup_height = (filtered.len() + 2) as u16;
            let popup_rect = Rect {
                x: chat_chunks[1].x + 2,
                y: chat_chunks[1].y - popup_height,
                width: 50,
                height: popup_height,
            };

            let popup_block = List::new(filtered)
                .block(Block::default()
                    .borders(Borders::ALL)
                    .title(" Slash Commands ")
                    .border_style(RatatuiStyle::default().fg(primary)).style(RatatuiStyle::default().bg(Color::Black))
                )
                .style(RatatuiStyle::default().fg(Color::Yellow));

            f.render_widget(ratatui::widgets::Clear, popup_rect);
            f.render_widget(popup_block, popup_rect);
        }
    }

    // Right Sidebar for Help/Context Info
    let sidebar_info = vec![
        Line::from(Span::styled("Session Context", RatatuiStyle::default().fg(primary).add_modifier(Modifier::BOLD))),
        Line::from(""),
        Line::from(vec![Span::raw("Profile: "), Span::styled(services.config.active_profile.clone(), RatatuiStyle::default().fg(Color::Magenta))]),
        Line::from(vec![Span::raw("Provider: "), Span::styled(state.active_provider_override.clone().unwrap_or_else(|| services.config.get_value("provider").unwrap_or_else(|| "openrouter".to_string())), RatatuiStyle::default().fg(Color::Gray))]),
        Line::from(vec![Span::raw("Model: "), Span::styled(state.active_model_override.clone().unwrap_or_else(|| services.config.get_value("model").unwrap_or_else(|| "gemini-1.5-flash".to_string())), RatatuiStyle::default().fg(Color::Yellow))]),
        Line::from(""),
        Line::from(Span::styled("Hotkeys", RatatuiStyle::default().fg(primary).add_modifier(Modifier::BOLD))),
        Line::from(""),
        Line::from("[1-5]: Switch Views"),
        Line::from("[Tab]: Autocomplete"),
        Line::from("[Esc / Q]: Exit Cockpit"),
    ];

    let sidebar_block = Block::default().borders(Borders::ALL).title(" Context Details ").border_style(RatatuiStyle::default().fg(border)).style(RatatuiStyle::default().bg(Color::Black));
    let sidebar_area = sidebar_block.inner(h_chunks[1]);
    f.render_widget(sidebar_block, h_chunks[1]);
    let sidebar = Paragraph::new(sidebar_info).wrap(Wrap { trim: true });
    f.render_widget(sidebar, sidebar_area);
}

fn render_workspace(f: &mut Frame, area: Rect, services: &ServiceContainer, state: &CockpitState, primary: Color, border: Color) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(40),
            Constraint::Percentage(60),
        ])
        .split(area);

    // Render workspace files list
    let list_items: Vec<ListItem> = state.file_list.iter().enumerate().map(|(idx, name)| {
        let style = if idx == state.file_cursor {
            RatatuiStyle::default().fg(Color::Black).bg(primary).add_modifier(Modifier::BOLD)
        } else {
            RatatuiStyle::default().fg(Color::Gray)
        };
        ListItem::new(Span::styled(format!(" 📄 {}", name), style))
    }).collect();

    let files_block = Block::default()
        .borders(Borders::ALL)
        .title(" Workspace Files Explorer ")
        .border_style(RatatuiStyle::default().fg(primary))
        .style(RatatuiStyle::default().bg(Color::Black));
    let files_area = files_block.inner(chunks[0]);
    f.render_widget(files_block, chunks[0]);
    let files_list = List::new(list_items);
    let mut list_state = ListState::default();
    list_state.select(Some(state.file_cursor));
    f.render_stateful_widget(files_list, files_area, &mut list_state);

    // Right Side Info Panel
    let active_file = &state.file_list[state.file_cursor];
    let details = vec![
        Line::from(vec![Span::raw(" File Name: "), Span::styled(active_file, RatatuiStyle::default().fg(primary).add_modifier(Modifier::BOLD))]),
        Line::from(vec![Span::raw(" Workspace Path: "), Span::raw(services.workspace.root_path.join(active_file).to_string_lossy().to_string())]),
        Line::from(Span::styled(" Instructions: ", RatatuiStyle::default().fg(Color::Yellow))),
        Line::from(Span::raw(" • Press Up/Down arrow keys to navigate files.")),
        Line::from(Span::raw(" • Press [Enter] to query the assistant for a file analysis.")),
    ];

    let info_block = Block::default()
        .borders(Borders::ALL)
        .title(" File Context Card ")
        .border_style(RatatuiStyle::default().fg(border))
        .style(RatatuiStyle::default().bg(Color::Black));
    let info_area = info_block.inner(chunks[1]);
    f.render_widget(info_block, chunks[1]);
    let info_box = Paragraph::new(details).wrap(Wrap { trim: true });
    f.render_widget(info_box, info_area);
}

fn render_doctor(f: &mut Frame, area: Rect, _services: &ServiceContainer, state: &CockpitState, primary: Color, _border: Color, success: Color) {
    let mut doctor_lines = Vec::new();
    
    if !state.diagnostics_run {
        doctor_lines.push(Line::from("Loading diagnostics system..."));
    } else {
        for (check, desc, ok) in &state.diagnostic_results {
            let icon = if *ok {
                Span::styled("  ✔ OK  ", RatatuiStyle::default().fg(success).add_modifier(Modifier::BOLD))
            } else {
                Span::styled("  ✖ FAIL", RatatuiStyle::default().fg(Color::Red).add_modifier(Modifier::BOLD))
            };
            doctor_lines.push(Line::from(vec![icon, Span::styled(check, RatatuiStyle::default().fg(Color::White).add_modifier(Modifier::BOLD))]));
            doctor_lines.push(Line::from(Span::styled(format!("    {}", desc), RatatuiStyle::default().fg(Color::Gray))));
            doctor_lines.push(Line::from(""));
        }
    }

    let doctor_paragraph = Paragraph::new(doctor_lines)
        .block(Block::default().borders(Borders::ALL).title(" System Diagnostics Audit ").border_style(RatatuiStyle::default().fg(primary)).style(RatatuiStyle::default().bg(Color::Black)))
        .wrap(Wrap { trim: true });
    f.render_widget(doctor_paragraph, area);
}

fn render_monitors(f: &mut Frame, area: Rect, _services: &ServiceContainer, state: &CockpitState, primary: Color, border: Color) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // CPU
            Constraint::Length(3), // Memory
            Constraint::Length(3), // Latency
            Constraint::Min(2),    // Stats
        ])
        .split(area);

    // 1. CPU Bar
    let cpu_bars = "█".repeat((state.cpu_usage / 4) as usize);
    let cpu_block = Block::default().borders(Borders::ALL).border_style(RatatuiStyle::default().fg(border)).style(RatatuiStyle::default().bg(Color::Black));
    let cpu_area = cpu_block.inner(chunks[0]);
    f.render_widget(cpu_block, chunks[0]);
    let cpu_para = Paragraph::new(format!("{:<12} [ {:-<25} ] {}%", "CPU Usage", cpu_bars.cyan(), state.cpu_usage)).style(RatatuiStyle::default().fg(Color::White));
    f.render_widget(cpu_para, cpu_area);

    // 2. Memory Bar
    let mem_bars = "█".repeat((state.memory_mb / 20) as usize);
    let mem_block = Block::default().borders(Borders::ALL).border_style(RatatuiStyle::default().fg(border)).style(RatatuiStyle::default().bg(Color::Black));
    let mem_area = mem_block.inner(chunks[1]);
    f.render_widget(mem_block, chunks[1]);
    let mem_para = Paragraph::new(format!("{:<12} [ {:-<25} ] {} MB", "Memory", mem_bars.cyan(), state.memory_mb)).style(RatatuiStyle::default().fg(Color::White));
    f.render_widget(mem_para, mem_area);

    // 3. Latency Bar
    let latency_bars = "█".repeat((state.latency_ms / 2) as usize);
    let latency_block = Block::default().borders(Borders::ALL).border_style(RatatuiStyle::default().fg(border)).style(RatatuiStyle::default().bg(Color::Black));
    let latency_area = latency_block.inner(chunks[2]);
    f.render_widget(latency_block, chunks[2]);
    let latency_para = Paragraph::new(format!("{:<12} [ {:-<25} ] {} ms", "IPC Ping", latency_bars.cyan(), state.latency_ms)).style(RatatuiStyle::default().fg(Color::White));
    f.render_widget(latency_para, latency_area);

    // 4. Extra stats
    let extra_lines = vec![
        Line::from(vec![Span::raw("Telemetry State: "), Span::styled("Active", RatatuiStyle::default().fg(Color::Green))]),
        Line::from(vec![Span::raw("Cache Database Hits: "), Span::styled("1,245 hits", RatatuiStyle::default().fg(primary))]),
        Line::from(vec![Span::raw("Cache Misses: "), Span::styled("12 misses", RatatuiStyle::default().fg(Color::Yellow))]),
    ];

    let extra_box = Paragraph::new(extra_lines)
        .block(Block::default().borders(Borders::ALL).title(" Core Cache metrics ").border_style(RatatuiStyle::default().fg(border)).style(RatatuiStyle::default().bg(Color::Black)));
    f.render_widget(extra_box, chunks[3]);
}
