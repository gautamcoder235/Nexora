use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use rusqlite::params;
use crate::memory::models::{ProjectConfig, BackupMetadata};

pub fn get_or_create_project_id(app: &AppHandle, project_path: &str) -> Result<String, String> {
    let config_path = Path::new(project_path).join(".nexora").join("config.json");
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<ProjectConfig>(&content) {
                if !config.project_id.trim().is_empty() {
                    return Ok(config.project_id);
                }
            }
        }
    }

    let name = Path::new(project_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unnamed Project".to_string());

    let db_state = app.state::<crate::database::DbState>();
    let mut project_id = None;

    if let Ok(guard) = db_state.0.lock() {
        if let Some(conn) = guard.as_ref() {
            let path_normalized = project_path.replace("\\", "/");
            let mut stmt = conn.prepare("SELECT id FROM repositories WHERE REPLACE(root_path, '\\', '/') = ?1").unwrap();
            let mut rows = stmt.query(params![path_normalized]).unwrap();
            if let Some(row) = rows.next().unwrap() {
                let id: String = row.get(0).unwrap();
                project_id = Some(id);
            } else {
                let new_id = uuid::Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO repositories (id, name, root_path) VALUES (?1, ?2, ?3)",
                    params![new_id, name, project_path],
                );
                project_id = Some(new_id);
            }
        }
    }

    let resolved_id = project_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let config = ProjectConfig {
        project_id: resolved_id.clone(),
        name,
    };
    if let Ok(content) = serde_json::to_string_pretty(&config) {
        let _ = fs::write(config_path, content);
    }

    Ok(resolved_id)
}

fn compute_file_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read file for hash: {}", e))?;
    let hash = blake3::hash(&bytes);
    Ok(hash.to_hex().to_string())
}

pub fn get_vault_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("RecoveryVault").join("Projects").join(project_id))
}

pub fn rotate_generations(vault_dir: &Path) -> Result<(), String> {
    let history_dir = vault_dir.join("history");
    fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;

    let gen3 = history_dir.join("gen-3");
    let gen2 = history_dir.join("gen-2");
    let gen1 = history_dir.join("gen-1");

    if gen3.exists() {
        let _ = fs::remove_dir_all(&gen3);
    }
    if gen2.exists() {
        fs::rename(&gen2, &gen3).map_err(|e| format!("Failed to rotate gen-2 to gen-3: {}", e))?;
    }
    if gen1.exists() {
        fs::rename(&gen1, &gen2).map_err(|e| format!("Failed to rotate gen-1 to gen-2: {}", e))?;
    }

    let active_bundle = vault_dir.join("repo.bundle");
    let active_db = vault_dir.join("memory.db");
    let active_meta = vault_dir.join("metadata.json");

    if active_bundle.exists() || active_db.exists() || active_meta.exists() {
        fs::create_dir_all(&gen1).map_err(|e| e.to_string())?;
        if active_bundle.exists() {
            fs::rename(&active_bundle, gen1.join("repo.bundle")).map_err(|e| e.to_string())?;
        }
        if active_db.exists() {
            fs::rename(&active_db, gen1.join("memory.db")).map_err(|e| e.to_string())?;
        }
        if active_meta.exists() {
            fs::rename(&active_meta, gen1.join("metadata.json")).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

pub fn backup_project(app: &AppHandle, project_path: &str) -> Result<(), String> {
    let project_id = get_or_create_project_id(app, project_path)?;
    let vault_dir = get_vault_dir(app, &project_id)?;

    rotate_generations(&vault_dir)?;

    let bundle_path = vault_dir.join("repo.bundle");
    let dest_db_path = vault_dir.join("memory.db");
    let meta_path = vault_dir.join("metadata.json");

    let git_path = super::git_provider::resolve_git_binary(app)?;
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);
    let src_db_path = Path::new(project_path).join(".nexora").join("memory.db");

    let bundle_path_str = bundle_path.to_string_lossy();
    let _ = super::git_provider::create_git_bundle(&git_path, &git_dir, work_tree, &bundle_path_str)?;

    if src_db_path.exists() {
        fs::copy(&src_db_path, &dest_db_path).map_err(|e| format!("Failed to backup memory.db: {}", e))?;
    }

    let bundle_hash = compute_file_hash(&bundle_path).unwrap_or_default();
    let db_hash = compute_file_hash(&dest_db_path).unwrap_or_default();

    let name = Path::new(project_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unnamed Project".to_string());

    let timestamp = chrono::Local::now().to_rfc3339();

    let meta = BackupMetadata {
        project_id,
        name,
        original_path: project_path.to_string(),
        timestamp,
        repo_bundle_hash: bundle_hash,
        memory_db_hash: db_hash,
    };

    let meta_content = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(meta_path, meta_content).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn verify_backup_integrity(app: &AppHandle, vault_dir: &Path) -> Result<BackupMetadata, String> {
    let meta_path = vault_dir.join("metadata.json");
    if !meta_path.exists() {
        return Err("Backup metadata.json missing".to_string());
    }

    let meta_str = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let meta: BackupMetadata = serde_json::from_str(&meta_str).map_err(|e| e.to_string())?;

    let bundle_path = vault_dir.join("repo.bundle");
    let db_path = vault_dir.join("memory.db");

    if !bundle_path.exists() || !db_path.exists() {
        return Err("Backup files missing".to_string());
    }

    let current_bundle_hash = compute_file_hash(&bundle_path)?;
    let current_db_hash = compute_file_hash(&db_path)?;

    if current_bundle_hash != meta.repo_bundle_hash {
        return Err("Git bundle file checksum mismatch (corrupted)".to_string());
    }
    if current_db_hash != meta.memory_db_hash {
        return Err("SQLite database checksum mismatch (corrupted)".to_string());
    }

    let git_path = super::git_provider::resolve_git_binary(app)?;
    let bundle_path_str = bundle_path.to_string_lossy();
    let temp_git_dir = vault_dir.join("temp_fsck_repo");
    
    super::git_provider::verify_git_bundle(&git_path, &temp_git_dir, &bundle_path_str)?;

    Ok(meta)
}

pub fn restore_project(app: &AppHandle, project_id: &str, target_path: &str) -> Result<(), String> {
    let vault_dir = get_vault_dir(app, project_id)?;

    let mut healthy_vault = None;
    let mut errs = Vec::new();

    match verify_backup_integrity(app, &vault_dir) {
        Ok(m) => healthy_vault = Some((vault_dir.clone(), m)),
        Err(e) => errs.push(format!("Primary backup check failed: {}", e)),
    }

    if healthy_vault.is_none() {
        for gen_idx in 1..=3 {
            let gen_dir = vault_dir.join("history").join(format!("gen-{}", gen_idx));
            if gen_dir.exists() {
                match verify_backup_integrity(app, &gen_dir) {
                    Ok(m) => {
                        healthy_vault = Some((gen_dir, m));
                        break;
                    }
                    Err(e) => errs.push(format!("Gen-{} backup check failed: {}", gen_idx, e)),
                }
            }
        }
    }

    let (src_vault, meta) = healthy_vault.ok_or_else(|| {
        format!("All backup generations are corrupted or missing. Check errors: {:?}", errs)
    })?;

    let target_dir = Path::new(target_path);
    if !target_dir.exists() {
        fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
    }

    let nexora_dir = target_dir.join(".nexora");
    let git_dir = nexora_dir.join("repo");
    let db_file = nexora_dir.join("memory.db");

    if git_dir.exists() {
        let _ = fs::remove_dir_all(&git_dir);
    }
    fs::create_dir_all(&git_dir).map_err(|e| e.to_string())?;

    let git_path = super::git_provider::resolve_git_binary(app)?;
    let bundle_file = src_vault.join("repo.bundle");
    let bundle_path_str = bundle_file.to_string_lossy();
    
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["init"])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["config", "core.autocrlf", "false"])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["config", "core.quotepath", "false"])?;

    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["remote", "add", "bundle", &*bundle_path_str])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["fetch", "bundle"])?;
    
    let fetch_head = super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["rev-parse", "FETCH_HEAD"])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["checkout", "-f", &fetch_head])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["update-ref", "refs/heads/nexora/main", &fetch_head])?;

    let src_db = src_vault.join("memory.db");
    if src_db.exists() {
        fs::copy(&src_db, &db_file).map_err(|e| format!("Failed to restore memory.db: {}", e))?;
    }

    let config_path = nexora_dir.join("config.json");
    let config = ProjectConfig {
        project_id: meta.project_id,
        name: meta.name,
    };
    if let Ok(content) = serde_json::to_string_pretty(&config) {
        let _ = fs::write(config_path, content);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_generation_rotation() {
        let temp_dir = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("test_vault_rotation");
        let _ = fs::remove_dir_all(&temp_dir);
        let _ = fs::create_dir_all(&temp_dir);

        let vault_dir = temp_dir.join("vault");
        fs::create_dir_all(&vault_dir).unwrap();

        // 1. Initial backup dummy files
        fs::write(vault_dir.join("repo.bundle"), "dummy-bundle").unwrap();
        fs::write(vault_dir.join("memory.db"), "dummy-db").unwrap();
        fs::write(vault_dir.join("metadata.json"), "dummy-meta").unwrap();

        // Rotate once (current -> gen-1)
        rotate_generations(&vault_dir).unwrap();
        assert!(vault_dir.join("history").join("gen-1").join("repo.bundle").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-1").join("repo.bundle")).unwrap(), "dummy-bundle");

        // Write new files
        fs::write(vault_dir.join("repo.bundle"), "dummy-bundle-2").unwrap();
        fs::write(vault_dir.join("memory.db"), "dummy-db-2").unwrap();
        fs::write(vault_dir.join("metadata.json"), "dummy-meta-2").unwrap();

        // Rotate second time (current -> gen-1, previous gen-1 -> gen-2)
        rotate_generations(&vault_dir).unwrap();
        assert!(vault_dir.join("history").join("gen-2").join("repo.bundle").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-2").join("repo.bundle")).unwrap(), "dummy-bundle");
        assert!(vault_dir.join("history").join("gen-1").join("repo.bundle").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-1").join("repo.bundle")).unwrap(), "dummy-bundle-2");

        // Write new files
        fs::write(vault_dir.join("repo.bundle"), "dummy-bundle-3").unwrap();
        fs::write(vault_dir.join("memory.db"), "dummy-db-3").unwrap();
        fs::write(vault_dir.join("metadata.json"), "dummy-meta-3").unwrap();

        // Rotate third time (current -> gen-1, previous gen-1 -> gen-2, previous gen-2 -> gen-3)
        rotate_generations(&vault_dir).unwrap();
        assert!(vault_dir.join("history").join("gen-3").join("repo.bundle").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-3").join("repo.bundle")).unwrap(), "dummy-bundle");
        assert!(vault_dir.join("history").join("gen-2").join("repo.bundle").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-2").join("repo.bundle")).unwrap(), "dummy-bundle-2");
        assert!(vault_dir.join("history").join("gen-1").join("repo.bundle").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-1").join("repo.bundle")).unwrap(), "dummy-bundle-3");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
