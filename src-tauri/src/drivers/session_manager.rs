use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use crate::drivers::types::{SessionInfo, SessionKey, SessionLockInfo};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SessionRegistry {
    pub version: u32,
    pub sessions: std::collections::HashMap<String, SessionInfo>,
}

pub struct SessionManager {
    registry_path: Mutex<PathBuf>,
    registry: Mutex<SessionRegistry>,
}

lazy_static::lazy_static! {
    pub static ref SESSION_MANAGER: SessionManager = SessionManager::new();
}

impl SessionManager {
    pub fn new() -> Self {
        SessionManager {
            registry_path: Mutex::new(PathBuf::from("sessions.json")),
            registry: Mutex::new(SessionRegistry {
                version: 1,
                sessions: std::collections::HashMap::new(),
            }),
        }
    }

    pub fn initialize(&self, project_path: &str) {
        // Normalize the path to avoid case/trailing separator mismatches on Windows
        let raw_path = Path::new(project_path).join(".nexora").join("state").join("sessions.json");
        let normalized = Self::normalize_path(&raw_path);
        
        // Check if we're already initialized for this path
        {
            let current_path = self.registry_path.lock().unwrap();
            if *current_path == normalized {
                return;
            }
        }
        
        if let Some(parent) = normalized.parent() {
            let _ = fs::create_dir_all(parent);
        }
        
        {
            let mut path_guard = self.registry_path.lock().unwrap();
            *path_guard = normalized.clone();
        }

        // Try main registry first
        if normalized.exists() {
            if let Ok(content) = fs::read_to_string(&normalized) {
                if let Ok(reg) = serde_json::from_str::<SessionRegistry>(&content) {
                    let mut reg_guard = self.registry.lock().unwrap();
                    *reg_guard = reg;
                    drop(reg_guard);
                    // Run Startup Reconciler
                    self.reconcile_sessions();
                    return;
                }
            }
        }
        
        // Try backup registry on corruption/failure
        let backup_path = normalized.with_extension("backup.json");
        if backup_path.exists() {
            if let Ok(content) = fs::read_to_string(&backup_path) {
                if let Ok(reg) = serde_json::from_str::<SessionRegistry>(&content) {
                    let mut reg_guard = self.registry.lock().unwrap();
                    *reg_guard = reg;
                    drop(reg_guard);
                    // Run Startup Reconciler
                    self.reconcile_sessions();
                    return;
                }
            }
        }
        
        let mut reg_guard = self.registry.lock().unwrap();
        reg_guard.sessions.clear();
        drop(reg_guard);
        self.save();
        self.reconcile_sessions();
    }

    /// Normalize a path: lowercase on Windows, strip trailing separators
    fn normalize_path(path: &Path) -> PathBuf {
        let path_str = path.to_string_lossy().to_string();
        #[cfg(target_os = "windows")]
        let path_str = path_str.to_lowercase();
        let trimmed = path_str.trim_end_matches(std::path::MAIN_SEPARATOR);
        PathBuf::from(trimmed)
    }

    fn save_internal(&self, path: &Path, reg: &SessionRegistry) {
        if let Ok(content) = serde_json::to_string_pretty(reg) {
            let tmp_path = path.with_extension("json.tmp");
            if fs::write(&tmp_path, content).is_ok() {
                if fs::rename(&tmp_path, path).is_ok() {
                    let backup_path = path.with_extension("backup.json");
                    let _ = fs::copy(path, backup_path);
                }
            }
        }
    }

    pub fn save(&self) {
        let path_guard = self.registry_path.lock().unwrap();
        let reg_guard = self.registry.lock().unwrap();
        self.save_internal(&path_guard, &reg_guard);
    }

    pub fn add_session(&self, key: SessionKey, mut session: SessionInfo) {
        let mut reg_guard = self.registry.lock().unwrap();
        
        session.created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        session.last_seen = session.created_at;
        
        reg_guard.sessions.insert(key.to_string_id(), session);
        drop(reg_guard);
        self.save();
    }

    pub fn remove_session(&self, key: &SessionKey) {
        let mut reg_guard = self.registry.lock().unwrap();
        reg_guard.sessions.remove(&key.to_string_id());
        drop(reg_guard);
        self.save();
    }

    pub fn get_session(&self, key: &SessionKey) -> Option<SessionInfo> {
        let reg_guard = self.registry.lock().unwrap();
        reg_guard.sessions.get(&key.to_string_id()).cloned()
    }

    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        let reg_guard = self.registry.lock().unwrap();
        reg_guard.sessions.values().cloned().collect()
    }

    pub fn get_workspace_path(&self) -> PathBuf {
        let path = self.registry_path.lock().unwrap();
        path.parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    }

    // --- Session Lock Implementation ---

    pub fn get_lock_path(&self, key: &SessionKey) -> PathBuf {
        self.get_workspace_path()
            .join(".nexora")
            .join("locks")
            .join(format!("{}_{}.lock", key.cli, key.terminal_id))
    }

    pub fn acquire_lock(&self, key: &SessionKey, native_id: &str, pid: u32) -> Result<(), String> {
        let lock_path = self.get_lock_path(key);
        if let Some(parent) = lock_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
            
        let lock_info = SessionLockInfo {
            status: "active".to_string(),
            native_session_id: native_id.to_string(),
            pid,
            created_at: now,
            heartbeat: now,
        };
        
        let content = serde_json::to_string_pretty(&lock_info).unwrap_or_default();
        
        // Atomic Lock File Creation: fails if file already exists
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
            .map_err(|e| format!("Lock already held or restricted: {}", e))?;
            
        use std::io::Write;
        let _ = file.write_all(content.as_bytes());
        Ok(())
    }

    pub fn check_and_reclaim_lock(&self, key: &SessionKey) -> Result<Option<SessionLockInfo>, String> {
        let lock_path = self.get_lock_path(key);
        if !lock_path.exists() {
            return Ok(None);
        }
        
        if let Ok(content) = fs::read_to_string(&lock_path) {
            if let Ok(lock_info) = serde_json::from_str::<SessionLockInfo>(&content) {
                if self.is_lock_active(&lock_info) {
                    return Ok(Some(lock_info));
                } else {
                    println!("[SessionManager] Reclaiming stale lock for {}", key.to_string_id());
                    let _ = fs::remove_file(&lock_path);
                }
            }
        }
        Ok(None)
    }

    fn is_lock_active(&self, lock_info: &SessionLockInfo) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        
        // 1. Active if heartbeat is fresh
        if now.saturating_sub(lock_info.heartbeat) <= 30 {
            return true;
        }
        
        // 2. Active if PID process is still alive (mitigates PID reuse by verifying lock timestamp)
        let mut sys = Box::new(sysinfo::System::new());
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let sys_pid = sysinfo::Pid::from(lock_info.pid as usize);
        if sys.process(sys_pid).is_some() {
            return true;
        }
        
        false
    }

    pub fn update_lock_heartbeat(&self, key: &SessionKey, native_id: &str, pid: u32) {
        let lock_path = self.get_lock_path(key);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
            
        let mut lock_info = if let Ok(content) = fs::read_to_string(&lock_path) {
            serde_json::from_str::<SessionLockInfo>(&content).unwrap_or_else(|_| {
                SessionLockInfo {
                    status: "active".to_string(),
                    native_session_id: native_id.to_string(),
                    pid,
                    created_at: now,
                    heartbeat: now,
                }
            })
        } else {
            SessionLockInfo {
                status: "active".to_string(),
                native_session_id: native_id.to_string(),
                pid,
                created_at: now,
                heartbeat: now,
            }
        };
        
        lock_info.heartbeat = now;
        lock_info.pid = pid;
        if !native_id.is_empty() {
            lock_info.native_session_id = native_id.to_string();
        }
        
        if let Ok(content) = serde_json::to_string_pretty(&lock_info) {
            let tmp_path = lock_path.with_extension("lock.tmp");
            if fs::write(&tmp_path, content).is_ok() {
                let _ = fs::rename(tmp_path, &lock_path);
            }
        }
    }

    pub fn release_lock(&self, key: &SessionKey) {
        let lock_path = self.get_lock_path(key);
        if lock_path.exists() {
            let _ = fs::remove_file(lock_path);
        }
    }

    pub fn is_native_session_locked(&self, tool: &str, native_id: &str) -> bool {
        let locks_dir = self.get_workspace_path().join(".nexora").join("locks");
        if !locks_dir.exists() {
            return false;
        }
        
        let mut sys = Box::new(sysinfo::System::new());
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        
        if let Ok(entries) = fs::read_dir(locks_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "lock") {
                            if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                                if filename.starts_with(&format!("{}_", tool)) {
                                    if let Ok(content) = fs::read_to_string(&path) {
                                        if let Ok(lock_info) = serde_json::from_str::<SessionLockInfo>(&content) {
                                            if lock_info.native_session_id == native_id {
                                                let is_active = {
                                                    let now = std::time::SystemTime::now()
                                                        .duration_since(std::time::UNIX_EPOCH)
                                                        .unwrap_or_default()
                                                        .as_secs();
                                                    if now.saturating_sub(lock_info.heartbeat) <= 30 {
                                                        true
                                                    } else {
                                                        let sys_pid = sysinfo::Pid::from(lock_info.pid as usize);
                                                        sys.process(sys_pid).is_some()
                                                    }
                                                };
                                                if is_active {
                                                    return true;
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
        false
    }


    // --- Session Reconciler ---

    pub fn reconcile_sessions(&self) {
        let locks_dir = self.get_workspace_path().join(".nexora").join("locks");
        if !locks_dir.exists() {
            return;
        }
        
        let mut sys = Box::new(sysinfo::System::new());
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        
        if let Ok(entries) = fs::read_dir(locks_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "lock") {
                            if let Ok(content) = fs::read_to_string(&path) {
                                if let Ok(lock_info) = serde_json::from_str::<SessionLockInfo>(&content) {
                                    let is_active = {
                                        let now = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();
                                        if now.saturating_sub(lock_info.heartbeat) <= 30 {
                                            true
                                        } else {
                                            let sys_pid = sysinfo::Pid::from(lock_info.pid as usize);
                                            sys.process(sys_pid).is_some()
                                        }
                                    };
                                    
                                    if !is_active {
                                        let _ = fs::remove_file(&path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Update registry states to match active locks
        let mut reg_guard = self.registry.lock().unwrap();
        for session in reg_guard.sessions.values_mut() {
            let key = SessionKey {
                cli: session.tool.clone(),
                workspace: session.workspace.clone(),
                terminal_id: session.terminal_id.clone(),
            };
            let lock_path = self.get_lock_path(&key);
            if session.state == "running" && !lock_path.exists() {
                session.state = "disconnected".to_string();
            }
        }
        
        let path_guard = self.registry_path.lock().unwrap();
        self.save_internal(&path_guard, &reg_guard);
    }
}
