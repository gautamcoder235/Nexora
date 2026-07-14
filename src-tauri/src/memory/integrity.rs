use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};
use rusqlite::Connection;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HealthStatus {
    pub last_checked: String,
    pub git_fsck_status: String,    // "healthy" | "corrupted" | "skipped"
    pub db_integrity_status: String, // "healthy" | "corrupted" | "skipped"
    pub vault_status: String,        // "healthy" | "corrupted" | "missing"
    pub issues: Vec<String>,
}

pub fn run_integrity_scan(
    git_path: &Path,
    app_data_dir: &Path,
    project_id: &str,
    project_path: &str,
) -> Result<HealthStatus, String> {
    let mut issues = Vec::new();
    let timestamp = chrono::Local::now().to_rfc3339();

    // 1. Check Git Integrity
    let git_dir = Path::new(project_path).join(".nexora").join("repo");
    let work_tree = Path::new(project_path);

    let git_fsck_status = if git_dir.exists() {
        let mut fsck_cmd = std::process::Command::new(git_path);
        fsck_cmd.arg(format!("--git-dir={}", git_dir.to_string_lossy()));
        fsck_cmd.arg(format!("--work-tree={}", work_tree.to_string_lossy()));
        fsck_cmd.arg("fsck");
        
        match fsck_cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    "healthy".to_string()
                } else {
                    let err = String::from_utf8_lossy(&output.stderr).to_string();
                    issues.push(format!("Git fsck failed: {}", err));
                    "corrupted".to_string()
                }
            }
            Err(e) => {
                issues.push(format!("Failed to execute git fsck: {}", e));
                "corrupted".to_string()
            }
        }
    } else {
        "skipped".to_string()
    };

    // 2. Check Database Integrity
    let db_path = Path::new(project_path).join(".nexora").join("memory.db");
    let db_integrity_status = if db_path.exists() {
        match Connection::open(&db_path) {
            Ok(conn) => {
                let check_res: Result<String, _> = conn.query_row("PRAGMA integrity_check;", [], |row| row.get(0));
                match check_res {
                    Ok(val) => {
                        if val.to_lowercase() == "ok" {
                            "healthy".to_string()
                        } else {
                            issues.push(format!("SQLite integrity error: {}", val));
                            "corrupted".to_string()
                        }
                    }
                    Err(e) => {
                        issues.push(format!("SQLite pragma query failed: {}", e));
                        "corrupted".to_string()
                    }
                }
            }
            Err(e) => {
                issues.push(format!("Failed to open DB connection: {}", e));
                "corrupted".to_string()
            }
        }
    } else {
        "skipped".to_string()
    };

    // 3. Check Vault Status
    let vault_dir = super::backup_service::get_vault_dir(app_data_dir, project_id);
    let vault_status = if vault_dir.exists() {
        match super::backup_service::verify_backup_integrity(git_path, &vault_dir) {
            Ok(_) => "healthy".to_string(),
            Err(e) => {
                issues.push(format!("Vault verification error: {}", e));
                "corrupted".to_string()
            }
        }
    } else {
        "missing".to_string()
    };

    let status = HealthStatus {
        last_checked: timestamp,
        git_fsck_status,
        db_integrity_status,
        vault_status,
        issues,
    };

    // Write health.json atomically
    let health_file = Path::new(project_path).join(".nexora").join("health.json");
    let content = serde_json::to_string_pretty(&status).map_err(|e| e.to_string())?;
    let temp_health = health_file.with_extension("tmp");
    fs::write(&temp_health, &content).map_err(|e| e.to_string())?;
    
    {
        let file = fs::OpenOptions::new()
            .write(true)
            .open(&temp_health)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(temp_health, health_file).map_err(|e| e.to_string())?;

    // Also sync health.json to Vault directory
    if vault_dir.exists() {
        let vault_health = vault_dir.join("health.json");
        let _ = fs::write(vault_health, content);
    }

    Ok(status)
}

pub fn execute_repair(
    git_path: &Path,
    app_data_dir: &Path,
    project_id: &str,
    project_path: &str,
) -> Result<(), String> {
    let vault_dir = super::backup_service::get_vault_dir(app_data_dir, project_id);

    if !vault_dir.exists() {
        return Err("No backup vault exists for this project; cannot execute repair".to_string());
    }

    // Repair mode: restore everything clean from the vault copy
    super::backup_service::restore_project(git_path, app_data_dir, project_id, project_path)?;
    Ok(())
}
