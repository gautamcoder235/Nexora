use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use directories::ProjectDirs;
use redb::{Database, TableDefinition};
use crate::error::NexoraError;

const CACHE_TABLE: TableDefinition<&str, &str> = TableDefinition::new("nexora_cache");

#[derive(Clone)]
pub struct CacheManager {
    db: Option<Arc<Database>>,
    fallback_map: Arc<Mutex<HashMap<String, String>>>,
}

impl CacheManager {
    pub fn new() -> Self {
        let db_path = get_cache_db_path();
        let db = if let Some(path) = db_path {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            Database::create(&path)
                .or_else(|_| Database::open(&path))
                .map(Arc::new)
                .ok()
        } else {
            None
        };

        Self {
            db,
            fallback_map: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get(&self, key: &str) -> Result<Option<String>, NexoraError> {
        if let Some(ref db) = self.db {
            let read_txn = db.begin_read().map_err(|e| NexoraError::CacheError {
                message: format!("Failed to begin read transaction: {}", e),
            })?;
            
            let table = match read_txn.open_table(CACHE_TABLE) {
                Ok(t) => t,
                Err(redb::TableError::TableDoesNotExist(_)) => return Ok(None),
                Err(e) => return Err(NexoraError::CacheError {
                    message: format!("Failed to open table: {}", e),
                }),
            };

            let value = table.get(key).map_err(|e| NexoraError::CacheError {
                message: format!("Failed to get key: {}", e),
            })?;

            Ok(value.map(|v| v.value().to_string()))
        } else {
            let map = self.fallback_map.lock().unwrap();
            Ok(map.get(key).cloned())
        }
    }

    pub fn set(&self, key: &str, value: &str) -> Result<(), NexoraError> {
        if let Some(ref db) = self.db {
            let write_txn = db.begin_write().map_err(|e| NexoraError::CacheError {
                message: format!("Failed to begin write transaction: {}", e),
            })?;
            {
                let mut table = write_txn.open_table(CACHE_TABLE).map_err(|e| NexoraError::CacheError {
                    message: format!("Failed to open table: {}", e),
                })?;
                table.insert(key, value).map_err(|e| NexoraError::CacheError {
                    message: format!("Failed to insert key: {}", e),
                })?;
            }
            write_txn.commit().map_err(|e| NexoraError::CacheError {
                message: format!("Failed to commit transaction: {}", e),
            })?;
            Ok(())
        } else {
            let mut map = self.fallback_map.lock().unwrap();
            map.insert(key.to_string(), value.to_string());
            Ok(())
        }
    }

    pub fn delete(&self, key: &str) -> Result<(), NexoraError> {
        if let Some(ref db) = self.db {
            let write_txn = db.begin_write().map_err(|e| NexoraError::CacheError {
                message: format!("Failed to begin write transaction: {}", e),
            })?;
            {
                let mut table = write_txn.open_table(CACHE_TABLE).map_err(|e| NexoraError::CacheError {
                    message: format!("Failed to open table: {}", e),
                })?;
                table.remove(key).map_err(|e| NexoraError::CacheError {
                    message: format!("Failed to remove key: {}", e),
                })?;
            }
            write_txn.commit().map_err(|e| NexoraError::CacheError {
                message: format!("Failed to commit transaction: {}", e),
            })?;
            Ok(())
        } else {
            let mut map = self.fallback_map.lock().unwrap();
            map.remove(key);
            Ok(())
        }
    }
}

fn get_cache_db_path() -> Option<PathBuf> {
    ProjectDirs::from("com", "nexora", "Nexora").map(|proj_dirs| proj_dirs.cache_dir().join("cache.db"))
}
