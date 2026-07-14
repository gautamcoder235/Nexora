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

pub fn get_vault_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    app_data_dir.join("RecoveryVault").join("Projects").join(project_id)
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

    let active_git = vault_dir.join("repo.git");
    let active_db = vault_dir.join("memory.db");
    let active_meta = vault_dir.join("metadata.json");

    if active_git.exists() || active_db.exists() || active_meta.exists() {
        fs::create_dir_all(&gen1).map_err(|e| e.to_string())?;
        if active_git.exists() {
            fs::rename(&active_git, gen1.join("repo.git")).map_err(|e| e.to_string())?;
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

pub fn backup_project(
    git_path: &Path,
    app_data_dir: &Path,
    project_id: &str,
    project_path: &str,
) -> Result<(), String> {
    let vault_dir = get_vault_dir(app_data_dir, project_id);

    rotate_generations(&vault_dir)?;

    let bare_git_dir = vault_dir.join("repo.git");
    let dest_db_path = vault_dir.join("memory.db");
    let temp_db_path = vault_dir.join("memory.db.new");
    let meta_path = vault_dir.join("metadata.json");
    let temp_meta_path = vault_dir.join("metadata.json.new");

    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let src_db_path = Path::new(project_path).join(".nexora").join("memory.db");

    // Incremental bare git synchronization
    if !bare_git_dir.exists() {
        let mut clone_cmd = std::process::Command::new(&git_path);
        clone_cmd.arg("clone").arg("--bare").arg(&git_dir).arg(&bare_git_dir);
        let output = clone_cmd.output().map_err(|e| format!("Failed to initialize bare clone: {}", e))?;
        if !output.status.success() {
            return Err(format!("Git bare clone failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
    } else {
        let mut fetch_cmd = std::process::Command::new(&git_path);
        fetch_cmd.arg(format!("--git-dir={}", bare_git_dir.to_string_lossy()));
        fetch_cmd.arg("fetch").arg(&git_dir).arg("+refs/heads/*:refs/heads/*");
        let fetch_output = fetch_cmd.output().map_err(|e| format!("Failed to fetch commits: {}", e))?;
        if !fetch_output.status.success() {
            return Err(format!("Git fetch sync failed: {}", String::from_utf8_lossy(&fetch_output.stderr)));
        }
    }

    // Retrieve HEAD hash from bare repository
    let mut rev_cmd = std::process::Command::new(&git_path);
    rev_cmd.arg(format!("--git-dir={}", bare_git_dir.to_string_lossy()));
    rev_cmd.arg("rev-parse").arg("HEAD");
    let rev_output = rev_cmd.output().map_err(|e| e.to_string())?;
    let repo_git_hash = String::from_utf8_lossy(&rev_output.stdout).trim().to_string();

    // Atomic SQLite copy with fsync + rename
    if src_db_path.exists() {
        fs::copy(&src_db_path, &temp_db_path).map_err(|e| format!("Failed to copy DB: {}", e))?;
        {
            let file = fs::OpenOptions::new()
                .write(true)
                .open(&temp_db_path)
                .map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| format!("Failed file sync: {}", e))?;
        }
        fs::rename(&temp_db_path, &dest_db_path).map_err(|e| format!("Failed atomic database rename: {}", e))?;
    }

    let db_hash = compute_file_hash(&dest_db_path).unwrap_or_default();

    let name = Path::new(project_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unnamed Project".to_string());

    let timestamp = chrono::Local::now().to_rfc3339();

    let meta = BackupMetadata {
        project_id: project_id.to_string(),
        name,
        original_path: project_path.to_string(),
        timestamp,
        repo_git_hash,
        memory_db_hash: db_hash,
    };

    // Atomic metadata copy with fsync + rename
    let meta_content = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(&temp_meta_path, &meta_content).map_err(|e| e.to_string())?;
    {
        let file = fs::OpenOptions::new()
            .write(true)
            .open(&temp_meta_path)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| format!("Failed metadata sync: {}", e))?;
    }
    fs::rename(&temp_meta_path, &meta_path).map_err(|e| format!("Failed atomic metadata rename: {}", e))?;

    Ok(())
}

pub fn verify_backup_integrity(git_path: &Path, vault_dir: &Path) -> Result<BackupMetadata, String> {
    let meta_path = vault_dir.join("metadata.json");
    if !meta_path.exists() {
        return Err("Backup metadata.json missing".to_string());
    }

    let meta_str = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let meta: BackupMetadata = serde_json::from_str(&meta_str).map_err(|e| e.to_string())?;

    let bare_git_dir = vault_dir.join("repo.git");
    let db_path = vault_dir.join("memory.db");

    if !bare_git_dir.exists() || !db_path.exists() {
        return Err("Backup files missing".to_string());
    }

    let current_db_hash = compute_file_hash(&db_path)?;
    if current_db_hash != meta.memory_db_hash {
        return Err("SQLite database checksum mismatch (corrupted)".to_string());
    }

    // Verify commit exists inside bare git repository
    let mut rev_cmd = std::process::Command::new(git_path);
    rev_cmd.arg(format!("--git-dir={}", bare_git_dir.to_string_lossy()));
    rev_cmd.arg("cat-file").arg("-e").arg(&meta.repo_git_hash);
    let status = rev_cmd.status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Git bare repo validation: HEAD commit hash is missing/corrupted".to_string());
    }

    Ok(meta)
}

pub fn restore_project(
    git_path: &Path,
    app_data_dir: &Path,
    project_id: &str,
    target_path: &str,
) -> Result<(), String> {
    let vault_dir = get_vault_dir(app_data_dir, project_id);

    let mut healthy_vault = None;
    let mut errs = Vec::new();

    match verify_backup_integrity(git_path, &vault_dir) {
        Ok(m) => healthy_vault = Some((vault_dir.clone(), m)),
        Err(e) => errs.push(format!("Primary backup check failed: {}", e)),
    }

    if healthy_vault.is_none() {
        for gen_idx in 1..=3 {
            let gen_dir = vault_dir.join("history").join(format!("gen-{}", gen_idx));
            if gen_dir.exists() {
                match verify_backup_integrity(git_path, &gen_dir) {
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

    let src_bare_git = src_vault.join("repo.git");
    let bare_git_path_str = src_bare_git.to_string_lossy();
    
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["init"])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["config", "core.autocrlf", "false"])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["config", "core.quotepath", "false"])?;

    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["remote", "add", "origin", &*bare_git_path_str])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["fetch", "origin"])?;
    
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["checkout", "-f", &meta.repo_git_hash])?;
    super::git_provider::execute_git(&git_path, &git_dir, target_dir, &["update-ref", "refs/heads/nexora/main", &meta.repo_git_hash])?;

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
        fs::create_dir_all(vault_dir.join("repo.git")).unwrap();
        fs::write(vault_dir.join("repo.git").join("dummy-git"), "dummy-git-content").unwrap();
        fs::write(vault_dir.join("memory.db"), "dummy-db").unwrap();
        fs::write(vault_dir.join("metadata.json"), "dummy-meta").unwrap();

        // Rotate once (current -> gen-1)
        rotate_generations(&vault_dir).unwrap();
        assert!(vault_dir.join("history").join("gen-1").join("repo.git").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-1").join("repo.git").join("dummy-git")).unwrap(), "dummy-git-content");

        // Write new files
        fs::create_dir_all(vault_dir.join("repo.git")).unwrap();
        fs::write(vault_dir.join("repo.git").join("dummy-git"), "dummy-git-content-2").unwrap();
        fs::write(vault_dir.join("memory.db"), "dummy-db-2").unwrap();
        fs::write(vault_dir.join("metadata.json"), "dummy-meta-2").unwrap();

        // Rotate second time (current -> gen-1, previous gen-1 -> gen-2)
        rotate_generations(&vault_dir).unwrap();
        assert!(vault_dir.join("history").join("gen-2").join("repo.git").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-2").join("repo.git").join("dummy-git")).unwrap(), "dummy-git-content");
        assert!(vault_dir.join("history").join("gen-1").join("repo.git").exists());
        assert_eq!(fs::read_to_string(vault_dir.join("history").join("gen-1").join("repo.git").join("dummy-git")).unwrap(), "dummy-git-content-2");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
