use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use sysinfo::System;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LockData {
    pub pid: u32,
    pub created: String,
    pub operation: String,
    pub machine: String,
}

pub struct ProjectLock {
    lock_path: PathBuf,
}

impl ProjectLock {
    pub fn acquire(project_path: &str, operation: &str) -> Result<Self, String> {
        let locks_dir = Path::new(project_path).join(".nexora").join("locks");
        fs::create_dir_all(&locks_dir).map_err(|e| e.to_string())?;

        let lock_path = locks_dir.join(format!("{}.lock", operation));
        
        if lock_path.exists() {
            if let Ok(content) = fs::read_to_string(&lock_path) {
                if let Ok(lock_data) = serde_json::from_str::<LockData>(&content) {
                    let sys = System::new_all();
                    
                    let pid_alive = sys.process(sysinfo::Pid::from(lock_data.pid as usize)).is_some();
                    let same_machine = lock_data.machine == System::host_name().unwrap_or_default();

                    if pid_alive && same_machine {
                        return Err(format!(
                            "Operation '{}' is already locked by process {} on {} since {}",
                            operation, lock_data.pid, lock_data.machine, lock_data.created
                        ));
                    }
                    
                    // The PID is dead or on a different machine name domain: safe to override/prune
                    let _ = fs::remove_file(&lock_path);
                }
            }
        }

        let lock_data = LockData {
            pid: std::process::id(),
            created: chrono::Local::now().to_rfc3339(),
            operation: operation.to_string(),
            machine: System::host_name().unwrap_or_else(|| "unknown-host".to_string()),
        };

        let temp_lock = lock_path.with_extension("tmp");
        let content = serde_json::to_string_pretty(&lock_data).map_err(|e| e.to_string())?;
        fs::write(&temp_lock, content).map_err(|e| e.to_string())?;
        
        let file = fs::File::open(&temp_lock).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(temp_lock, &lock_path).map_err(|e| e.to_string())?;

        Ok(Self { lock_path })
    }
}

impl Drop for ProjectLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.lock_path);
    }
}
