pub mod types;
pub mod errors;
pub mod driver;
pub mod sdk;
pub mod registry;
pub mod session_manager;

// Drivers
pub mod claude;
pub mod agy;
pub mod codex;
pub mod aider;
pub mod cline;
pub mod opencode;
pub mod generic;

#[tauri::command]
pub fn resolve_driver_launch(
    tool: String,
    session_id: String,
    cwd: String,
    custom_args: Option<Vec<String>>,
) -> Result<(String, Vec<String>, std::collections::HashMap<String, String>), String> {
    let registry = &registry::REGISTRY;
    let driver = registry.get(&tool).ok_or_else(|| format!("No driver found for tool: {}", tool))?;
    
    // Initialize session manager with current project CWD
    session_manager::SESSION_MANAGER.initialize(&cwd);
    
    let key = types::SessionKey {
        cli: tool.clone(),
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: session_id.clone(),
    };
    
    // 1. Check and reclaim lock
    if let Ok(Some(lock)) = session_manager::SESSION_MANAGER.check_and_reclaim_lock(&key) {
        return Err(format!(
            "Session {} is already active (held by pid {}). Concurrent launches on the same SessionKey are prohibited.",
            session_id, lock.pid
        ));
    }
    
    // 2. Acquire atomic lock with placeholder PID (to be updated later when process starts)
    let placeholder_pid = std::process::id();
    if let Err(e) = session_manager::SESSION_MANAGER.acquire_lock(&key, &session_id, placeholder_pid) {
        return Err(format!("Concurrent lock race: {}", e));
    }
    
    // 3. Write placeholder session in registry
    let session_info = types::SessionInfo {
        session_id: session_id.clone(),
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: session_id.clone(),
        tool: tool.clone(),
        created_at: 0,
        last_seen: 0,
        state: "launching".to_string(),
        metadata: std::collections::HashMap::new(),
    };
    session_manager::SESSION_MANAGER.add_session(key.clone(), session_info);

    // Set up isolated configuration directory and get env overrides
    let env_map = seed_isolated_config(&tool, &session_id, &cwd);
    
    let opts = types::LaunchOptions {
        session_id: session_id.clone(),
        workspace_dir: cwd.clone(),
        custom_args,
        env_overrides: Some(env_map.clone()),
    };
    
    let config = match driver.launch(opts) {
        Ok(cfg) => cfg,
        Err(e) => {
            session_manager::SESSION_MANAGER.release_lock(&key);
            return Err(e.to_string());
        }
    };
    
    // Create final session info
    let mut metadata = std::collections::HashMap::from([
        ("executable".to_string(), config.0.clone()),
        ("args".to_string(), config.1.join(" ")),
        ("pid".to_string(), placeholder_pid.to_string()),
    ]);
    
    // If the resolved args contain the terminal session_id, it means the driver's
    // launch function used it as the tool's own session key (e.g. AGY passes
    // `--conversation <terminal_id>`).  Flag this so resume knows it can safely
    // pass the terminal_id back to the tool.
    if config.1.contains(&session_id) {
        metadata.insert("uses_terminal_id_as_session".to_string(), "true".to_string());
    }
    
    let session_info = types::SessionInfo {
        session_id: session_id.clone(),
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: session_id.clone(),
        tool: tool.clone(),
        created_at: 0,
        last_seen: 0,
        state: "running".to_string(),
        metadata,
    };
    session_manager::SESSION_MANAGER.add_session(key, session_info);
    
    Ok((config.0, config.1, env_map))
}

#[tauri::command]
pub fn resolve_driver_resume(
    tool: String,
    session_id: String,
    cwd: String,
) -> Result<(String, Vec<String>, std::collections::HashMap<String, String>), String> {
    let registry = &registry::REGISTRY;
    let driver = registry.get(&tool).ok_or_else(|| format!("No driver found for tool: {}", tool))?;
    
    // Initialize session manager with current project CWD
    session_manager::SESSION_MANAGER.initialize(&cwd);
    
    let key = types::SessionKey {
        cli: tool.clone(),
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: session_id.clone(),
    };
    
    // Set up isolated configuration directory and get env overrides
    let env_map = seed_isolated_config(&tool, &session_id, &cwd);
    let capabilities = driver.capabilities();
    
    // If the driver doesn't support resume at all, always launch fresh
    if !capabilities.supports_resume {
        let opts = types::LaunchOptions {
            session_id: session_id.clone(),
            workspace_dir: cwd.clone(),
            custom_args: None,
            env_overrides: Some(env_map.clone()),
        };
        let config = driver.launch(opts).map_err(|e| e.to_string())?;
        
        let session_info = types::SessionInfo {
            session_id: session_id.clone(),
            workspace: std::path::PathBuf::from(&cwd),
            terminal_id: session_id.clone(),
            tool: tool.clone(),
            created_at: 0,
            last_seen: 0,
            state: "launching".to_string(),
            metadata: std::collections::HashMap::from([
                ("executable".to_string(), config.0.clone()),
                ("args".to_string(), config.1.join(" ")),
            ]),
        };
        session_manager::SESSION_MANAGER.add_session(key, session_info);
        return Ok((config.0, config.1, env_map));
    }
    
    // 1. LAYER 2: Try looking up in locks first (runtime truth)
    let mut resume_id = String::new();
    let lock_active = session_manager::SESSION_MANAGER.check_and_reclaim_lock(&key).unwrap_or(None);
    if let Some(ref lock) = lock_active {
        println!("[DriverResume] → Layer 2: Lock is active, reusing native_session_id: {}", lock.native_session_id);
        resume_id = lock.native_session_id.clone();
    }
    
    // 2. LAYER 2b: Try looking up in registry next (persistent truth)
    let session_record = session_manager::SESSION_MANAGER.get_session(&key);
    if resume_id.is_empty() {
        if let Some(ref rec) = session_record {
            let mut candidate = String::new();
            if let Some(native_id) = rec.metadata.get("native_session_id") {
                candidate = native_id.clone();
            } else if rec.metadata.get("uses_terminal_id_as_session").map_or(false, |v| v == "true") {
                candidate = session_id.clone();
            } else if rec.metadata.get("args").map_or(false, |args| args.contains(session_id.as_str())) {
                candidate = session_id.clone();
            }
            
            if !candidate.is_empty() {
                if !session_manager::SESSION_MANAGER.is_native_session_locked(&tool, &candidate) {
                    println!("[DriverResume] → Layer 2b: Found native_session_id={} in registry", candidate);
                    resume_id = candidate;
                } else {
                    println!("[DriverResume] Registry candidate {} is locked by another terminal. Skipping.", candidate);
                }
            }
        }
    }
    
    // 3. LAYER 3: If missing from registry/lock, fall back to directory/db scanning
    if resume_id.is_empty() {
        println!("[DriverResume] → Layer 3: Registry & Lock missing native ID, invoking fallback scanner");
        let candidates = match tool.as_str() {
            "cline" => get_cline_native_session_ids(&session_id, &cwd),
            "claude" => get_claude_native_session_ids(&session_id, &cwd),
            "codex" => get_codex_native_session_ids(&session_id, &cwd),
            "opencode" => get_opencode_native_session_ids(&session_id, &cwd),
            "agy" => get_agy_native_session_ids(&session_id, &cwd),
            _ => Vec::new(),
        };
        
        for candidate in candidates {
            if !session_manager::SESSION_MANAGER.is_native_session_locked(&tool, &candidate) {
                resume_id = candidate;
                break;
            } else {
                println!("[DriverResume] Candidate session {} is locked by another active terminal. Skipping.", candidate);
            }
        }
        
        if !resume_id.is_empty() {
            println!("[DriverResume] → Fallback scanner found native session ID: {}", resume_id);
        } else {
            println!("[DriverResume] → Fallback scanner returned no session ID, doing fresh resume/continue");
        }
    }
    
    // 4. Acquire atomic lock with placeholder PID (updates when process starts)
    let placeholder_pid = std::process::id();
    let _ = session_manager::SESSION_MANAGER.acquire_lock(&key, &resume_id, placeholder_pid);
    
    let config = match driver.resume(&resume_id, &cwd) {
        Ok(cfg) => cfg,
        Err(e) => {
            session_manager::SESSION_MANAGER.release_lock(&key);
            return Err(e.to_string());
        }
    };
    println!("[DriverResume] Resolved: exe={}, args={:?}", config.0, config.1);
    
    // 5. Update lock & registry
    let mut metadata = std::collections::HashMap::from([
        ("executable".to_string(), config.0.clone()),
        ("args".to_string(), config.1.join(" ")),
        ("pid".to_string(), placeholder_pid.to_string()),
    ]);
    
    if !resume_id.is_empty() {
        if resume_id == session_id {
            metadata.insert("uses_terminal_id_as_session".to_string(), "true".to_string());
        } else {
            metadata.insert("native_session_id".to_string(), resume_id.clone());
        }
    }
    
    let session_info = types::SessionInfo {
        session_id: if resume_id.is_empty() { session_id.clone() } else { resume_id.clone() },
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: session_id.clone(),
        tool: tool.clone(),
        created_at: 0,
        last_seen: 0,
        state: "resuming".to_string(),
        metadata,
    };
    session_manager::SESSION_MANAGER.add_session(key, session_info);
    
    Ok((config.0, config.1, env_map))
}

fn get_home_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .ok()
            .map(std::path::PathBuf::from)
            .or_else(|| std::env::var("HOME").ok().map(std::path::PathBuf::from))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(std::path::PathBuf::from)
    }
}

fn copy_dir_all(src: impl AsRef<std::path::Path>, dst: impl AsRef<std::path::Path>) -> std::io::Result<()> {
    let src = src.as_ref();
    let dst = dst.as_ref();
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        
        if ty.is_dir() {
            if name_str == "node_modules" || name_str == "backups" || name_str == ".git" || name_str == "cache" || name_str == "logs" {
                continue;
            }
            copy_dir_all(entry.path(), dst.join(name))?;
        } else {
            if name_str.ends_with(".zip") || name_str.ends_with(".tar.gz") || name_str.ends_with(".tgz") {
                continue;
            }
            std::fs::copy(entry.path(), dst.join(name))?;
        }
    }
    Ok(())
}

/// Link `dst` → `src` for shared credential files.
/// Strategy: symlink → hardlink → copy (always refreshes on each call).
fn link_or_copy_auth(src: &std::path::Path, dst: &std::path::Path) {
    if !src.exists() {
        return;
    }
    // Remove stale destination (whether old copy, symlink, or hardlink)
    let _ = std::fs::remove_file(dst);

    // 1. Try symlink (requires Developer Mode on Windows)
    #[cfg(target_os = "windows")]
    {
        if std::os::windows::fs::symlink_file(src, dst).is_ok() {
            return;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if std::os::unix::fs::symlink(src, dst).is_ok() {
            return;
        }
    }

    // 2. Try hardlink (same drive, no admin, shares inode)
    if std::fs::hard_link(src, dst).is_ok() {
        return;
    }

    // 3. Fallback: plain copy (cross-drive or restricted)
    let _ = std::fs::copy(src, dst);
}

fn seed_isolated_config(tool: &str, terminal_id: &str, project_cwd: &str) -> std::collections::HashMap<String, String> {
    let mut env_map = std::collections::HashMap::new();
    let home = match get_home_dir() {
        Some(h) => h,
        None => return env_map,
    };
    let project_path = std::path::Path::new(project_cwd);

    match tool {
        "claude" => {
            let dest_dir = project_path.join(".nexora").join("state").join("claude").join(terminal_id);
            let _ = std::fs::create_dir_all(&dest_dir);

            // Auth: always refresh — .credentials.json (OAuth) + settings.json (Bedrock token)
            let src_creds = home.join(".claude").join(".credentials.json");
            link_or_copy_auth(&src_creds, &dest_dir.join(".credentials.json"));

            let src_settings = home.join(".claude").join("settings.json");
            link_or_copy_auth(&src_settings, &dest_dir.join("settings.json"));

            env_map.insert("CLAUDE_CONFIG_DIR".to_string(), dest_dir.to_string_lossy().to_string());
        }
        "codex" => {
            let dest_dir = project_path.join(".nexora").join("state").join("codex").join(terminal_id);
            let codex_dot_dir = dest_dir.join(".codex");
            let _ = std::fs::create_dir_all(&codex_dot_dir);

            // Auth + Config: always refresh both (auth has tokens, config has trust levels & paths)
            let src_auth = home.join(".codex").join("auth.json");
            link_or_copy_auth(&src_auth, &codex_dot_dir.join("auth.json"));

            let src_config = home.join(".codex").join("config.toml");
            link_or_copy_auth(&src_config, &codex_dot_dir.join("config.toml"));

            env_map.insert("CODEX_HOME".to_string(), dest_dir.to_string_lossy().to_string());
        }
        "cline" => {
            let dest_dir = project_path.join(".nexora").join("state").join("cline").join(terminal_id);
            let dest_settings_dir = dest_dir.join("data").join("settings");
            let _ = std::fs::create_dir_all(&dest_settings_dir);

            let src_settings_dir = home.join(".cline").join("data").join("settings");
            if src_settings_dir.exists() {
                // Auth: SYMLINK providers.json (contains API keys)
                let src_providers = src_settings_dir.join("providers.json");
                link_or_copy_auth(&src_providers, &dest_settings_dir.join("providers.json"));

                // Config: copy other settings once
                let config_files = ["global-settings.json", "cline_mcp_settings.json"];
                for file in &config_files {
                    let src_file = src_settings_dir.join(file);
                    let dest_file = dest_settings_dir.join(file);
                    if src_file.exists() && !dest_file.exists() {
                        let _ = std::fs::copy(src_file, dest_file);
                    }
                }
            }

            env_map.insert("CLINE_DATA_DIR".to_string(), dest_dir.join("data").to_string_lossy().to_string());
        }
        "aider" => {
            let dest_dir = project_path.join(".nexora").join("state").join("aider").join(terminal_id);
            let _ = std::fs::create_dir_all(&dest_dir);

            let chat_history = dest_dir.join("chat_history.md");
            let input_history = dest_dir.join("input_history");

            env_map.insert("AIDER_CHAT_HISTORY_FILE".to_string(), chat_history.to_string_lossy().to_string());
            env_map.insert("AIDER_INPUT_HISTORY_FILE".to_string(), input_history.to_string_lossy().to_string());
        }
        "opencode" => {
            let dest_dir = project_path.join(".nexora").join("state").join("opencode").join(terminal_id);
            let dest_data_dir = dest_dir.join("data");
            let _ = std::fs::create_dir_all(&dest_dir);
            let _ = std::fs::create_dir_all(&dest_data_dir);

            // Config: copy whole config directory once (includes prompts/, agents/, etc.)
            let dest_marker = dest_dir.join("opencode.json");
            if !dest_marker.exists() {
                let config_dir_sources = [
                    home.join(".config").join("opencode"),
                    home.join("AppData").join("Roaming").join("opencode"),
                    home.join("AppData").join("Local").join("opencode"),
                ];
                let mut copied_dir = false;
                for src_dir in &config_dir_sources {
                    if src_dir.exists() {
                        let _ = copy_dir_all(src_dir, &dest_dir);
                        copied_dir = true;
                        break;
                    }
                }
                if !copied_dir {
                    let single_file = home.join(".opencode.json");
                    if single_file.exists() {
                        let _ = std::fs::copy(single_file, &dest_marker);
                    }
                }
            }

            // Auth: always refresh auth.json + account.json (provider credentials)
            let data_sources = [
                home.join(".local").join("share").join("opencode"),
                home.join("AppData").join("Local").join("opencode"),
                home.join("AppData").join("Roaming").join("opencode"),
            ];
            for src_dir in &data_sources {
                if src_dir.exists() {
                    let src_auth = src_dir.join("auth.json");
                    link_or_copy_auth(&src_auth, &dest_data_dir.join("auth.json"));
                    let src_account = src_dir.join("account.json");
                    link_or_copy_auth(&src_account, &dest_data_dir.join("account.json"));
                    break;
                }
            }

            // Set ALL OpenCode env vars to fully isolate (prevents fallback to global paths)
            env_map.insert("OPENCODE_CONFIG_DIR".to_string(), dest_dir.to_string_lossy().to_string());
            env_map.insert("OPENCODE_DATA_DIR".to_string(), dest_data_dir.to_string_lossy().to_string());
            env_map.insert("OPENCODE_STATE_DIR".to_string(), dest_data_dir.join("state").to_string_lossy().to_string());
            env_map.insert("OPENCODE_LOG_DIR".to_string(), dest_data_dir.join("log").to_string_lossy().to_string());
            env_map.insert("OPENCODE_CACHE_DIR".to_string(), dest_data_dir.join("cache").to_string_lossy().to_string());
        }
        "agy" => {
            let dest_dir = project_path.join(".nexora").join("state").join("agy").join(terminal_id);
            let _ = std::fs::create_dir_all(&dest_dir);

            let global_dir = home.join(".gemini").join("antigravity");
            if global_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(global_dir) {
                    for entry in entries.flatten() {
                        if let Ok(file_type) = entry.file_type() {
                            if file_type.is_file() {
                                let path = entry.path();
                                if path.extension().map_or(false, |ext| ext == "pb") {
                                    if let Some(name) = path.file_name() {
                                        link_or_copy_auth(&path, &dest_dir.join(name));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            env_map.insert("ANTIGRAVITY_EXECUTABLE_DATA_DIR".to_string(), dest_dir.to_string_lossy().to_string());
        }
        _ => {}
    }

    // Auto-add .nexora/ to .gitignore so agent state is never committed
    let gitignore_path = project_path.join(".gitignore");
    let needs_entry = if gitignore_path.exists() {
        match std::fs::read_to_string(&gitignore_path) {
            Ok(content) => !content.lines().any(|l| {
                let trimmed = l.trim();
                trimmed == ".nexora/" || trimmed == ".nexora" || trimmed == ".nexora/**"
            }),
            Err(_) => true,
        }
    } else {
        true
    };
    if needs_entry {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&gitignore_path) {
            let _ = writeln!(f, "\n# Nexora agent state\n.nexora/");
        }
    }

    env_map
}

fn get_cline_native_session_ids(terminal_id: &str, project_cwd: &str) -> Vec<String> {
    let sessions_dir = std::path::Path::new(project_cwd)
        .join(".nexora")
        .join("state")
        .join("cline")
        .join(terminal_id)
        .join("data")
        .join("sessions");
    
    let mut sessions: Vec<(String, std::time::SystemTime)> = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(sessions_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let path = entry.path();
                    if let Ok(metadata) = entry.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            if let Some(name) = path.file_name() {
                                let name_str = name.to_string_lossy().to_string();
                                // Validate Cline session directory contains a valid json metadata file
                                let valid_json = path.join(format!("{}.json", name_str)).exists();
                                if valid_json && name_str.contains('_') && name_str.chars().all(|c| c.is_alphanumeric() || c == '_') {
                                    sessions.push((name_str, modified));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    sessions.sort_by(|a, b| b.1.cmp(&a.1));
    sessions.into_iter().map(|(id, _)| id).collect()
}

fn get_claude_native_session_ids(terminal_id: &str, project_cwd: &str) -> Vec<String> {
    let projects_dir = std::path::Path::new(project_cwd)
        .join(".nexora")
        .join("state")
        .join("claude")
        .join(terminal_id)
        .join("projects");
    
    let mut sessions: Vec<(String, std::time::SystemTime)> = Vec::new();
    
    fn scan_dir(dir: &std::path::Path, sessions: &mut Vec<(String, std::time::SystemTime)>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        scan_dir(&entry.path(), sessions);
                    } else if file_type.is_file() {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "jsonl") {
                            if let Some(stem) = path.file_stem() {
                                let stem_str = stem.to_string_lossy().to_string();
                                if stem_str.len() == 36 && stem_str.contains('-') {
                                    if let Ok(metadata) = entry.metadata() {
                                        // Format/metadata validation: must be a non-empty file
                                        if metadata.len() > 0 {
                                            if let Ok(modified) = metadata.modified() {
                                                sessions.push((stem_str, modified));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    scan_dir(&projects_dir, &mut sessions);
    sessions.sort_by(|a, b| b.1.cmp(&a.1));
    sessions.into_iter().map(|(id, _)| id).collect()
}

fn get_codex_native_session_ids(terminal_id: &str, project_cwd: &str) -> Vec<String> {
    let sessions_dir = std::path::Path::new(project_cwd)
        .join(".nexora")
        .join("state")
        .join("codex")
        .join(terminal_id)
        .join(".codex")
        .join("sessions");
    
    let mut sessions: Vec<(String, std::time::SystemTime)> = Vec::new();
    
    fn scan_dir(dir: &std::path::Path, sessions: &mut Vec<(String, std::time::SystemTime)>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        scan_dir(&entry.path(), sessions);
                    } else if file_type.is_file() {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "jsonl") {
                            if let Some(stem) = path.file_stem() {
                                let stem_str = stem.to_string_lossy().to_string();
                                if stem_str.len() >= 36 {
                                    let uuid_part = &stem_str[stem_str.len() - 36..];
                                    if uuid_part.contains('-') {
                                        if let Ok(metadata) = entry.metadata() {
                                            // Format/metadata validation: must be a non-empty file
                                            if metadata.len() > 0 {
                                                if let Ok(modified) = metadata.modified() {
                                                    sessions.push((uuid_part.to_string(), modified));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    scan_dir(&sessions_dir, &mut sessions);
    sessions.sort_by(|a, b| b.1.cmp(&a.1));
    sessions.into_iter().map(|(id, _)| id).collect()
}

fn get_opencode_native_session_ids(terminal_id: &str, project_cwd: &str) -> Vec<String> {
    let db_path = std::path::Path::new(project_cwd)
        .join(".nexora")
        .join("state")
        .join("opencode")
        .join(terminal_id)
        .join("data")
        .join("opencode.db");
    
    let mut sessions = Vec::new();
    if db_path.exists() {
        if let Ok(conn) = rusqlite::Connection::open(db_path) {
            let query = "SELECT id FROM session ORDER BY time_updated DESC;";
            if let Ok(mut stmt) = conn.prepare(query) {
                if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                    for row in rows.flatten() {
                        sessions.push(row);
                    }
                }
            }
        }
    }
    sessions
}

fn get_agy_native_session_ids(terminal_id: &str, project_cwd: &str) -> Vec<String> {
    let sessions_dir = std::path::Path::new(project_cwd)
        .join(".nexora")
        .join("state")
        .join("agy")
        .join(terminal_id);
    
    let mut sessions: Vec<(String, std::time::SystemTime)> = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(sessions_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let path = entry.path();
                    if path.extension().map_or(false, |ext| ext == "db") {
                        if let Some(stem) = path.file_stem() {
                            let stem_str = stem.to_string_lossy().to_string();
                            if stem_str.len() == 36 && stem_str.contains('-') {
                                if let Ok(metadata) = entry.metadata() {
                                    if let Ok(modified) = metadata.modified() {
                                        sessions.push((stem_str, modified));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    sessions.sort_by(|a, b| b.1.cmp(&a.1));
    sessions.into_iter().map(|(id, _)| id).collect()
}


#[tauri::command]
pub fn get_registered_drivers() -> Vec<types::DriverMetadata> {
    registry::REGISTRY.list()
}

/// Strip ANSI escape codes (CSI, OSC, simple escapes) from a string so that
/// session-ID discovery can parse the plain text underneath TUI output.
fn strip_ansi(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // ESC sequence
            match chars.peek() {
                Some('[') => {
                    // CSI sequence: ESC [ ... <final byte>
                    chars.next(); // consume '['
                    while let Some(&next) = chars.peek() {
                        chars.next();
                        if next.is_ascii_alphabetic() || next == '@' || next == '`' {
                            break;
                        }
                    }
                }
                Some(']') => {
                    // OSC sequence: ESC ] ... (ST or BEL)
                    chars.next(); // consume ']'
                    while let Some(&next) = chars.peek() {
                        if next == '\x07' {
                            chars.next();
                            break;
                        }
                        if next == '\x1b' {
                            chars.next();
                            if chars.peek() == Some(&'\\') {
                                chars.next();
                            }
                            break;
                        }
                        chars.next();
                    }
                }
                _ => {
                    // Simple escape: ESC + one char (e.g., ESC 7, ESC 8, ESC =)
                    chars.next();
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

#[tauri::command]
pub fn discover_session_from_line(
    tool: String,
    terminal_id: String,
    line: String,
) -> Option<String> {
    let registry = &registry::REGISTRY;
    let driver = registry.get(&tool)?;
    
    // Strip ANSI escape codes from TUI output before attempting discovery.
    // TUI tools like Codex and AGY wrap their output in escape sequences that
    // would otherwise prevent the UUID/ID scanners from matching.
    let clean_line = strip_ansi(&line);
    
    if let Some(discovered_id) = driver.discover_session(&clean_line) {
        let workspace = session_manager::SESSION_MANAGER.get_workspace_path();
        let key = types::SessionKey {
            cli: tool.clone(),
            workspace: workspace.clone(),
            terminal_id: terminal_id.clone(),
        };
        
        // Update heartbeat in lock file first!
        if let Some(rec) = session_manager::SESSION_MANAGER.get_session(&key) {
            if let Some(pid_str) = rec.metadata.get("pid") {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    session_manager::SESSION_MANAGER.update_lock_heartbeat(&key, &discovered_id, pid);
                }
            }
        }
        
        // Update session ID in registry
        if let Some(mut session) = session_manager::SESSION_MANAGER.get_session(&key) {
            // Validate: If the discovered native session ID does not match the expected session ID,
            // mark the session state as "desync", do NOT overwrite the session_id!
            if session.session_id != discovered_id {
                println!(
                    "[Desync Warning] CLI reported session ID {} but expected {}. Flagging state as desync.",
                    discovered_id, session.session_id
                );
                session.state = "desync".to_string();
                session.metadata.insert("desync_discovered_id".to_string(), discovered_id.clone());
                session_manager::SESSION_MANAGER.add_session(key, session);
            } else {
                session.state = "running".to_string();
                session_manager::SESSION_MANAGER.add_session(key, session);
            }
        } else {
            let mut metadata = std::collections::HashMap::new();
            metadata.insert("native_session_id".to_string(), discovered_id.clone());
            let session = types::SessionInfo {
                session_id: discovered_id.clone(),
                workspace,
                terminal_id: terminal_id.clone(),
                tool: tool.clone(),
                created_at: 0,
                last_seen: 0,
                state: "running".to_string(),
                metadata,
            };
            session_manager::SESSION_MANAGER.add_session(key, session);
        }
        return Some(discovered_id);
    }
    None
}

#[tauri::command]
pub fn has_session_record(tool: String, session_id: String, cwd: String) -> bool {
    session_manager::SESSION_MANAGER.initialize(&cwd);
    let key = types::SessionKey {
        cli: tool,
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: session_id,
    };
    session_manager::SESSION_MANAGER.get_session(&key).is_some()
}

/// Delete the isolated state directory and session record for a deleted agent.
/// Called from the frontend when an agent is permanently removed.
#[tauri::command]
pub fn cleanup_agent_state(tool: String, terminal_id: String, cwd: String) {
    let project_path = std::path::Path::new(&cwd);
    let state_dir = project_path
        .join(".nexora")
        .join("state")
        .join(&tool)
        .join(&terminal_id);

    if state_dir.exists() {
        let _ = std::fs::remove_dir_all(&state_dir);
        println!("[Cleanup] Deleted state dir: {}", state_dir.display());
    }

    // Also remove session record from the registry
    session_manager::SESSION_MANAGER.initialize(&cwd);
    let key = types::SessionKey {
        cli: tool.clone(),
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: terminal_id.clone(),
    };
    session_manager::SESSION_MANAGER.remove_session(&key);
    session_manager::SESSION_MANAGER.release_lock(&key);
}

#[tauri::command]
pub fn register_terminal_pid(tool: String, session_id: String, cwd: String, pid: u32) {
    session_manager::SESSION_MANAGER.initialize(&cwd);
    let key = types::SessionKey {
        cli: tool.clone(),
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: session_id.clone(),
    };
    
    let native_id = if let Some(rec) = session_manager::SESSION_MANAGER.get_session(&key) {
        rec.session_id.clone()
    } else {
        session_id.clone()
    };
    
    session_manager::SESSION_MANAGER.update_lock_heartbeat(&key, &native_id, pid);
    
    if let Some(mut rec) = session_manager::SESSION_MANAGER.get_session(&key) {
        rec.metadata.insert("pid".to_string(), pid.to_string());
        session_manager::SESSION_MANAGER.add_session(key, rec);
    }
}

#[tauri::command]
pub fn update_session_heartbeat(tool: String, session_id: String, cwd: String) {
    session_manager::SESSION_MANAGER.initialize(&cwd);
    let key = types::SessionKey {
        cli: tool,
        workspace: std::path::PathBuf::from(&cwd),
        terminal_id: session_id,
    };
    
    if let Some(rec) = session_manager::SESSION_MANAGER.get_session(&key) {
        if let Some(pid_str) = rec.metadata.get("pid") {
            if let Ok(pid) = pid_str.parse::<u32>() {
                session_manager::SESSION_MANAGER.update_lock_heartbeat(&key, &rec.session_id, pid);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::drivers::session_manager::SESSION_MANAGER;
    use std::fs;
    use std::path::PathBuf;
    use std::thread;

    fn setup_temp_workspace(test_name: &str) -> PathBuf {
        let temp_dir = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("test_nexora_sessions")
            .join(test_name);
        let _ = fs::remove_dir_all(&temp_dir);
        let _ = fs::create_dir_all(&temp_dir);
        temp_dir
    }

    #[test]
    fn run_all_stress_tests() {
        println!("🧾 STARTING NEXORA SESSION SYSTEM STRESS TEST");

        // 1. Collision Test
        test_collision();

        // 2. Crash Recovery Test
        test_crash_recovery();

        // 3. Registry Corruption Test
        test_registry_corruption();

        // 4. Lock Race Condition Test (High Load)
        test_lock_race_condition();

        // 5. Heartbeat & Stale Session Test
        test_heartbeat_cleanup();

        // 6. Filesystem Fallback Test
        test_filesystem_fallback();

        // 7. Split-Brain Timing Race Test
        test_split_brain_race();

        println!("🧾 ALL TESTS COMPLETED");
    }

    fn test_collision() {
        let workspace = setup_temp_workspace("test_collision");
        let ws_str = workspace.to_string_lossy().to_string();

        SESSION_MANAGER.initialize(&ws_str);

        // Launch 3 terminals: term_A, term_B, term_C
        let _res_a = resolve_driver_launch("claude".to_string(), "term_A".to_string(), ws_str.clone(), None).unwrap();
        let _res_b = resolve_driver_launch("claude".to_string(), "term_B".to_string(), ws_str.clone(), None).unwrap();
        let _res_c = resolve_driver_launch("claude".to_string(), "term_C".to_string(), ws_str.clone(), None).unwrap();

        // Verify lock files exist and are distinct
        let key_a = types::SessionKey { cli: "claude".to_string(), workspace: workspace.clone(), terminal_id: "term_A".to_string() };
        let key_b = types::SessionKey { cli: "claude".to_string(), workspace: workspace.clone(), terminal_id: "term_B".to_string() };
        let key_c = types::SessionKey { cli: "claude".to_string(), workspace: workspace.clone(), terminal_id: "term_C".to_string() };

        let lock_a = SESSION_MANAGER.get_lock_path(&key_a);
        let lock_b = SESSION_MANAGER.get_lock_path(&key_b);
        let lock_c = SESSION_MANAGER.get_lock_path(&key_c);

        assert!(lock_a.exists(), "Lock A should exist");
        assert!(lock_b.exists(), "Lock B should exist");
        assert!(lock_c.exists(), "Lock C should exist");
        assert_ne!(lock_a, lock_b);
        assert_ne!(lock_b, lock_c);

        // Verify registry has 3 distinct entries and states are "running"
        let s_a = SESSION_MANAGER.get_session(&key_a).unwrap();
        let s_b = SESSION_MANAGER.get_session(&key_b).unwrap();
        let s_c = SESSION_MANAGER.get_session(&key_c).unwrap();

        assert_eq!(s_a.terminal_id, "term_A");
        assert_eq!(s_b.terminal_id, "term_B");
        assert_eq!(s_c.terminal_id, "term_C");

        // Release locks to allow resume testing (normally resume checks and inherits or complains if active lock is owned by another pid, but here placeholder is same pid)
        SESSION_MANAGER.release_lock(&key_a);
        SESSION_MANAGER.release_lock(&key_b);
        SESSION_MANAGER.release_lock(&key_c);

        // Resume them randomly
        let _res_a_2 = resolve_driver_resume("claude".to_string(), "term_A".to_string(), ws_str.clone()).unwrap();
        let _res_b_2 = resolve_driver_resume("claude".to_string(), "term_B".to_string(), ws_str.clone()).unwrap();
        let _res_c_2 = resolve_driver_resume("claude".to_string(), "term_C".to_string(), ws_str.clone()).unwrap();

        // Verify they resumed their own session configurations
        let s_a_2 = SESSION_MANAGER.get_session(&key_a).unwrap();
        let s_b_2 = SESSION_MANAGER.get_session(&key_b).unwrap();
        let s_c_2 = SESSION_MANAGER.get_session(&key_c).unwrap();

        assert_eq!(s_a_2.terminal_id, "term_A");
        assert_eq!(s_b_2.terminal_id, "term_B");
        assert_eq!(s_c_2.terminal_id, "term_C");

        println!("   [Test 1] Collision Test: PASS");
    }

    fn test_crash_recovery() {
        let workspace = setup_temp_workspace("test_crash_recovery");
        let ws_str = workspace.to_string_lossy().to_string();

        SESSION_MANAGER.initialize(&ws_str);

        // Launch a session in each CLI type
        let tools = vec!["claude", "cline", "codex", "opencode"];
        for tool in &tools {
            let _ = resolve_driver_launch(tool.to_string(), format!("term_{}", tool), ws_str.clone(), None).unwrap();
        }

        // Release locks (so resume succeeds without complaining about lock active by current process id)
        for tool in &tools {
            let key = types::SessionKey {
                cli: tool.to_string(),
                workspace: workspace.clone(),
                terminal_id: format!("term_{}", tool),
            };
            SESSION_MANAGER.release_lock(&key);
        }

        // Simulate crash by forcing initialization again (re-reading files, clearing in-memory)
        SESSION_MANAGER.initialize(&ws_str);

        // Resume all terminals
        for tool in &tools {
            let key = types::SessionKey {
                cli: tool.to_string(),
                workspace: workspace.clone(),
                terminal_id: format!("term_{}", tool),
            };
            let _res = resolve_driver_resume(tool.to_string(), format!("term_{}", tool), ws_str.clone()).unwrap();
            let session = SESSION_MANAGER.get_session(&key).unwrap();
            assert_eq!(session.terminal_id, format!("term_{}", tool));
        }

        println!("   [Test 2] Crash Recovery Test: PASS");
    }

    fn test_registry_corruption() {
        let workspace = setup_temp_workspace("test_registry_corruption");
        let ws_str = workspace.to_string_lossy().to_string();

        SESSION_MANAGER.initialize(&ws_str);

        // Launch a session to ensure it saves to sessions.json and backup
        let key = types::SessionKey {
            cli: "claude".to_string(),
            workspace: workspace.clone(),
            terminal_id: "term_corrupt".to_string(),
        };
        let _ = resolve_driver_launch("claude".to_string(), "term_corrupt".to_string(), ws_str.clone(), None).unwrap();

        // Release lock
        SESSION_MANAGER.release_lock(&key);

        // Verify files exist
        let sessions_json = workspace.join(".nexora").join("state").join("sessions.json");
        let backup_json = workspace.join(".nexora").join("state").join("sessions.backup.json");
        assert!(sessions_json.exists());
        assert!(backup_json.exists());

        // Manually corrupt sessions.json
        fs::write(&sessions_json, "invalid { json ] format").unwrap();

        // Re-initialize session manager
        SESSION_MANAGER.initialize(&ws_str);

        // Verify session is successfully restored from backup
        let session = SESSION_MANAGER.get_session(&key);
        assert!(session.is_some(), "Session should be restored from backup");
        assert_eq!(session.unwrap().terminal_id, "term_corrupt");

        println!("   [Test 3] Registry Corruption Recovery Test: PASS");
    }

    fn test_lock_race_condition() {
        let workspace = setup_temp_workspace("test_lock_race_condition");
        let ws_str = workspace.to_string_lossy().to_string();

        SESSION_MANAGER.initialize(&ws_str);

        // 10-15 terminals mix
        let mut handles = vec![];
        for i in 1..=12 {
            let tool = if i % 2 == 0 { "claude" } else { "codex" };
            let term_id = format!("term_{}", i);
            let ws_str_clone = ws_str.clone();
            let tool_str = tool.to_string();
            
            let handle = thread::spawn(move || {
                resolve_driver_launch(tool_str, term_id, ws_str_clone, None)
            });
            handles.push(handle);
        }

        let mut successes = 0;
        let mut failures = 0;
        for handle in handles {
            match handle.join().unwrap() {
                Ok(_) => successes += 1,
                Err(_) => failures += 1,
            }
        }

        // All 12 should succeed since they are distinct terminal IDs (no keys collide)
        assert_eq!(successes, 12);
        assert_eq!(failures, 0);

        // Now, let's spawn multiple concurrent threads competing for the EXACT SAME SessionKey (cli + terminal_id)
        let tool = "claude".to_string();
        let term_id = "competing_term".to_string();
        
        let mut race_handles = vec![];
        for _ in 0..10 {
            let ws_str_clone = ws_str.clone();
            let tool_clone = tool.clone();
            let term_clone = term_id.clone();
            let handle = thread::spawn(move || {
                resolve_driver_launch(tool_clone, term_clone, ws_str_clone, None)
            });
            race_handles.push(handle);
        }

        let mut race_successes = 0;
        let mut race_failures = 0;
        for handle in race_handles {
            match handle.join().unwrap() {
                Ok(_) => race_successes += 1,
                Err(_) => race_failures += 1,
            }
        }

        // Only exactly 1 thread should succeed, the other 9 should fail due to atomic locking!
        assert_eq!(race_successes, 1);
        assert_eq!(race_failures, 9);

        println!("   [Test 4] Lock Race Condition Test: PASS (Atomic lock prevented duplication)");
    }

    fn test_heartbeat_cleanup() {
        let workspace = setup_temp_workspace("test_heartbeat_cleanup");
        let ws_str = workspace.to_string_lossy().to_string();

        SESSION_MANAGER.initialize(&ws_str);

        // Launch two sessions
        let key_active = types::SessionKey {
            cli: "claude".to_string(),
            workspace: workspace.clone(),
            terminal_id: "term_active".to_string(),
        };
        let key_stale = types::SessionKey {
            cli: "claude".to_string(),
            workspace: workspace.clone(),
            terminal_id: "term_stale".to_string(),
        };

        let _ = resolve_driver_launch("claude".to_string(), "term_active".to_string(), ws_str.clone(), None).unwrap();
        let _ = resolve_driver_launch("claude".to_string(), "term_stale".to_string(), ws_str.clone(), None).unwrap();

        // Artificially modify the stale lock's heartbeat to be old, and use a non-existent PID so PID check also fails
        let stale_lock_path = SESSION_MANAGER.get_lock_path(&key_stale);
        let stale_lock_info = types::SessionLockInfo {
            status: "active".to_string(),
            native_session_id: "stale_native_id".to_string(),
            pid: 999999, // Non-existent PID
            created_at: 0,
            heartbeat: 0, // Very old
        };
        fs::write(stale_lock_path, serde_json::to_string(&stale_lock_info).unwrap()).unwrap();

        // Run reconciler
        SESSION_MANAGER.reconcile_sessions();

        // Verify stale lock is deleted
        let lock_stale_path = SESSION_MANAGER.get_lock_path(&key_stale);
        assert!(!lock_stale_path.exists(), "Stale lock file should be cleaned up");

        // Verify active lock is NOT deleted (since its heartbeat is fresh and pid exists)
        let lock_active_path = SESSION_MANAGER.get_lock_path(&key_active);
        assert!(lock_active_path.exists(), "Active lock file should be preserved");

        // Verify stale session registry state is updated to disconnected
        let s_stale = SESSION_MANAGER.get_session(&key_stale).unwrap();
        assert_eq!(s_stale.state, "disconnected");

        // Verify active session remains running
        let s_active = SESSION_MANAGER.get_session(&key_active).unwrap();
        assert_eq!(s_active.state, "running");

        println!("   [Test 5] Heartbeat & Stale Session Cleanup: PASS");
    }

    fn test_filesystem_fallback() {
        let workspace = setup_temp_workspace("test_filesystem_fallback");
        let ws_str = workspace.to_string_lossy().to_string();

        SESSION_MANAGER.initialize(&ws_str);

        // 1. Simulate Claude session files on disk inside the isolated directory:
        // .nexora/state/claude/term_fallback/projects/<project_uuid>/<session_uuid>.jsonl
        let project_uuid = "3a0b12a4-bc2f-48d6-9467-333e1ef871b6";
        let session_uuid = "8f3b25e7-781c-4b52-9da6-46b3f9d504e2";
        let session_dir = workspace
            .join(".nexora")
            .join("state")
            .join("claude")
            .join("term_fallback")
            .join("projects")
            .join(project_uuid);
        fs::create_dir_all(&session_dir).unwrap();
        
        let session_file = session_dir.join(format!("{}.jsonl", session_uuid));
        fs::write(session_file, "{ \"mock\": \"line\" }\n").unwrap(); // Non-empty file

        // 2. Clear registry entry for term_fallback
        let key = types::SessionKey {
            cli: "claude".to_string(),
            workspace: workspace.clone(),
            terminal_id: "term_fallback".to_string(),
        };
        // Verify key lookup is empty in registry
        assert!(SESSION_MANAGER.get_session(&key).is_none());

        // 3. Trigger resolve_driver_resume for term_fallback
        let res = resolve_driver_resume("claude".to_string(), "term_fallback".to_string(), ws_str.clone()).unwrap();

        // 4. Verify the fallback scanner detected the correct session_uuid
        assert_eq!(res.1[1], session_uuid);

        // 5. Verify the registry has been rebuilt with that session
        let restored_session = SESSION_MANAGER.get_session(&key).unwrap();
        assert_eq!(restored_session.session_id, session_uuid);
        assert_eq!(restored_session.state, "resuming");

        println!("   [Test 6] Filesystem Fallback Validation Test: PASS");
    }

    fn test_split_brain_race() {
        let workspace = setup_temp_workspace("test_split_brain_race");
        let ws_str = workspace.to_string_lossy().to_string();

        SESSION_MANAGER.initialize(&ws_str);

        let key_t1 = types::SessionKey {
            cli: "claude".to_string(),
            workspace: workspace.clone(),
            terminal_id: "term_t1".to_string(),
        };
        let key_t2 = types::SessionKey {
            cli: "claude".to_string(),
            workspace: workspace.clone(),
            terminal_id: "term_t2".to_string(),
        };

        // 1. T1 launches
        let _res_t1 = resolve_driver_launch("claude".to_string(), "term_t1".to_string(), ws_str.clone(), None).unwrap();
        
        // Simulate T1 discovering its native session ID and updating its active lock heartbeat
        let session_t1_id = "session-t1-uuid-format-36-chars-long-x";
        SESSION_MANAGER.update_lock_heartbeat(&key_t1, session_t1_id, std::process::id());

        // 2. Simulate T1's native session files existing on disk in T2's isolated folder (shared history/copies scanning)
        let project_uuid = "11111111-2222-3333-4444-555555555555";
        let session_dir = workspace
            .join(".nexora")
            .join("state")
            .join("claude")
            .join("term_t2")
            .join("projects")
            .join(project_uuid);
        fs::create_dir_all(&session_dir).unwrap();
        let session_file = session_dir.join(format!("{}.jsonl", session_t1_id));
        fs::write(session_file, "{ \"mock\": \"line\" }\n").unwrap();

        // 3. T2 tries to resume
        let res_t2 = resolve_driver_resume("claude".to_string(), "term_t2".to_string(), ws_str.clone()).unwrap();

        // 4. Verify T2 did NOT inherit/resume "session_t1_id" because it is locked by T1!
        assert!(!res_t2.1.iter().any(|arg| arg == session_t1_id));
        
        // Also verify the registry for T2 does NOT list session_t1_id as the session_id
        let s_t2 = SESSION_MANAGER.get_session(&key_t2).unwrap();
        assert_ne!(s_t2.session_id, session_t1_id);

        println!("   [Test 7] Split-Brain Timing Race Test: PASS (Prevented double lock inheritance)");
    }
}
