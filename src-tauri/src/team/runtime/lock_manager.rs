use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LockType {
    Shared,
    Exclusive,
    Temporary,
    Read,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileLock {
    pub file_path: String,
    pub agent_id: String,
    pub lock_type: LockType,
    pub acquired_at: u64,
}

pub struct LockManager {
    locks: Mutex<HashMap<String, FileLock>>,
}

impl LockManager {
    pub fn new() -> Self {
        LockManager {
            locks: Mutex::new(HashMap::new()),
        }
    }

    pub fn acquire_lock(&self, file_path: String, agent_id: String, lock_type: LockType) -> Result<(), String> {
        let mut locks_guard = self.locks.lock().unwrap();
        
        if let Some(existing_lock) = locks_guard.get(&file_path) {
            // Rules:
            // 1. Exclusive lock cannot be shared or read by other agents if they want to modify.
            // 2. Shared locks can coexist (e.g. read locks), but if we try to get Exclusive, we fail.
            if lock_type == LockType::Exclusive || existing_lock.lock_type == LockType::Exclusive {
                if existing_lock.agent_id != agent_id {
                    return Err(format!(
                        "File is already locked by agent '{}' with lock type '{:?}'",
                        existing_lock.agent_id, existing_lock.lock_type
                    ));
                }
            }
        }

        // Acquire or update lock
        locks_guard.insert(
            file_path.clone(),
            FileLock {
                file_path,
                agent_id,
                lock_type,
                acquired_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            },
        );

        Ok(())
    }

    pub fn release_lock(&self, file_path: &str, agent_id: &str) -> Result<(), String> {
        let mut locks_guard = self.locks.lock().unwrap();
        
        if let Some(lock) = locks_guard.get(file_path) {
            if lock.agent_id == agent_id {
                locks_guard.remove(file_path);
                Ok(())
            } else {
                Err(format!("Lock on '{}' is held by agent '{}', not '{}'", file_path, lock.agent_id, agent_id))
            }
        } else {
            Ok(())
        }
    }

    pub fn release_all_locks_for_agent(&self, agent_id: &str) -> Vec<String> {
        let mut locks_guard = self.locks.lock().unwrap();
        let mut released = Vec::new();
        locks_guard.retain(|file_path, lock| {
            if lock.agent_id == agent_id {
                released.push(file_path.clone());
                false // remove
            } else {
                true // keep
            }
        });
        released
    }

    pub fn get_locked_files_for_agent(&self, agent_id: &str) -> Vec<String> {
        let locks_guard = self.locks.lock().unwrap();
        locks_guard
            .values()
            .filter(|lock| lock.agent_id == agent_id)
            .map(|lock| lock.file_path.clone())
            .collect()
    }

    pub fn get_all_locks(&self) -> Vec<FileLock> {
        let locks_guard = self.locks.lock().unwrap();
        locks_guard.values().cloned().collect()
    }
}
