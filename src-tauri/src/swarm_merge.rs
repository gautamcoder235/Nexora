use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
use lazy_static::lazy_static;
use crate::swarm_db::{self, DbState};
use crate::swarm_events::transition_execution_state;

lazy_static! {
    static ref GLOBAL_MERGE_LOCK: Mutex<()> = Mutex::new(());
}

#[derive(Serialize, Deserialize)]
pub struct MergeResult {
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn apply_merge_candidate(
    app_handle: AppHandle,
    execution_id: String,
) -> Result<MergeResult, String> {
    // 1. Acquire Global Merge Lock
    let _guard = GLOBAL_MERGE_LOCK.lock().await;

    // Transition state to merging
    transition_execution_state(&app_handle, &execution_id, "merging", None)?;

    let db_state: State<'_, DbState> = app_handle.state();
    
    {
        let conn_guard = db_state.0.lock().unwrap_or_else(|e| e.into_inner());
        swarm_db::insert_execution_event(
            conn_guard.as_ref().unwrap(),
            &format!("evt-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()),
            &execution_id,
            "merge_started",
            None
        ).ok();
    }
    
    // Fetch info needed for merge
    let (repo_path, patch_file_path, expected_checksum, expected_size, snapshot_head) = {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        // Verify candidate is approved
        let status: String = conn.query_row(
            "SELECT status FROM merge_candidates WHERE execution_id = ?1",
            rusqlite::params![&execution_id],
            |row| row.get(0)
        ).map_err(|_| "Merge candidate not found".to_string())?;

        if status != "approved" && status != "merging" {
            let err = format!("Candidate is in {} state, must be approved", status);
            return fail_merge(&app_handle, &execution_id, &err, conn);
        }

        // Get Repo Path
        let repo_path: String = conn.query_row(
            "SELECT r.root_path FROM executions e JOIN tasks t ON e.task_id = t.id JOIN repositories r ON t.repository_id = r.id WHERE e.id = ?1",
            rusqlite::params![&execution_id],
            |row| row.get(0)
        ).map_err(|_| "Repository path not found".to_string())?;

        // Get Patch Artifact
        let (patch_file_path, checksum, size_bytes): (String, String, i64) = conn.query_row(
            "SELECT a.file_path, a.checksum, a.size_bytes FROM merge_candidates mc JOIN artifacts a ON mc.patch_artifact_id = a.id WHERE mc.execution_id = ?1",
            rusqlite::params![&execution_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        ).map_err(|_| "Patch artifact not found".to_string())?;

        // Get Snapshot HEAD
        let snapshot_head: String = conn.query_row(
            "SELECT head_commit FROM execution_snapshots WHERE execution_id = ?1",
            rusqlite::params![&execution_id],
            |row| row.get(0)
        ).map_err(|_| "Execution snapshot not found".to_string())?;

        (repo_path, patch_file_path, checksum, size_bytes, snapshot_head)
    };

    // Helper to fail the merge from here
    macro_rules! fail_merge_step {
        ($err:expr) => {
            {
                let conn_guard = db_state.0.lock().unwrap_or_else(|e| e.into_inner());
                let conn = conn_guard.as_ref().unwrap();
                return fail_merge(&app_handle, &execution_id, $err, conn);
            }
        }
    }

    let repo_dir = Path::new(&repo_path);

    // Gate A: Cleanliness Check
    let status_output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| e.to_string())?;
    
    let is_clean = status_output.stdout.is_empty();
    let precheck_report = json!({
        "clean": is_clean,
        "porcelain": String::from_utf8_lossy(&status_output.stdout),
    });
    {
        let conn_guard = db_state.0.lock().unwrap_or_else(|e| e.into_inner());
        save_merge_artifact(conn_guard.as_ref().unwrap(), repo_dir, &execution_id, "merge_precheck_report", &serde_json::to_string(&precheck_report).unwrap_or_default());
    }

    if !is_clean {
        fail_merge_step!("Gate A Failed: Repository has uncommitted changes");
    }

    // Gate B: HEAD Drift Check
    let current_head = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| e.to_string())?;
    
    let current_head_str = String::from_utf8_lossy(&current_head.stdout).trim().to_string();
    if current_head_str != snapshot_head {
        fail_merge_step!(&format!("Gate B Failed: HEAD drifted. Snapshot was {}, now {}", snapshot_head, current_head_str));
    }

    // Gate B.5: Patch Integrity Check
    let patch_content = match fs::read_to_string(&patch_file_path) {
        Ok(c) => c,
        Err(_) => fail_merge_step!("Gate B.5 Failed: Patch file missing from disk"),
    };

    if patch_content.len() as i64 != expected_size {
        fail_merge_step!("Gate B.5 Failed: Patch file size mismatch");
    }

    let mut hasher = DefaultHasher::new();
    patch_content.hash(&mut hasher);
    let actual_checksum = format!("{:x}", hasher.finish());

    if actual_checksum != expected_checksum {
        fail_merge_step!("Gate B.5 Failed: Patch file checksum mismatch (corrupted)");
    }

    // Capture expected files from the patch
    // `git apply --numstat <patch>`
    let numstat_output = Command::new("git")
        .args(["apply", "--numstat", &patch_file_path])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| e.to_string())?;

    let mut expected_files = Vec::new();
    let numstat_str = String::from_utf8_lossy(&numstat_output.stdout);
    for line in numstat_str.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            expected_files.push(parts[2].to_string());
        }
    }

    // Gate C: Patch Dry Run
    let dry_run = Command::new("git")
        .args(["apply", "--check", &patch_file_path])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| e.to_string())?;

    if !dry_run.status.success() {
        let err = String::from_utf8_lossy(&dry_run.stderr);
        fail_merge_step!(&format!("Gate C Failed: Dry run rejected the patch: {}", err));
    }

    // Gate D: Apply Patch
    let apply_run = Command::new("git")
        .args(["apply", &patch_file_path])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| e.to_string())?;

    let apply_report = json!({
        "success": apply_run.status.success(),
        "stdout": String::from_utf8_lossy(&apply_run.stdout),
        "stderr": String::from_utf8_lossy(&apply_run.stderr),
    });
    {
        let conn_guard = db_state.0.lock().unwrap_or_else(|e| e.into_inner());
        save_merge_artifact(conn_guard.as_ref().unwrap(), repo_dir, &execution_id, "merge_apply_report", &serde_json::to_string(&apply_report).unwrap_or_default());
    }

    if !apply_run.status.success() {
        let err = String::from_utf8_lossy(&apply_run.stderr);
        fail_merge_step!(&format!("Gate D Failed: Failed to apply patch: {}", err));
    }

    // Gate E: File Integrity Check
    let diff_output = Command::new("git")
        .args(["diff", "--name-only"])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| e.to_string())?;
    
    let diff_str = String::from_utf8_lossy(&diff_output.stdout);
    let mut actual_files: Vec<String> = diff_str.lines().map(|s| s.to_string()).collect();
    
    expected_files.sort();
    actual_files.sort();

    if expected_files != actual_files {
        // Rollback working directory
        let _ = Command::new("git").args(["checkout", "."]).current_dir(repo_dir).status();
        let _ = Command::new("git").args(["clean", "-fd"]).current_dir(repo_dir).status();

        fail_merge_step!(&format!("Gate E Failed: File integrity mismatch. Expected: {:?}, Actual: {:?}", expected_files, actual_files));
    }

    // Gate F: Exact-File Commit
    let mut add_cmd = Command::new("git");
    add_cmd.arg("add").arg("--");
    for file in &expected_files {
        add_cmd.arg(file);
    }
    add_cmd.current_dir(repo_dir);

    if !add_cmd.status().map_err(|e| e.to_string())?.success() {
        fail_merge_step!("Gate F Failed: Failed to stage files");
    }

    let commit_msg = format!("Swarm: Merged Execution {}", execution_id);
    let commit_run = Command::new("git")
        .args(["commit", "-m", &commit_msg])
        .current_dir(repo_dir)
        .output()
        .map_err(|e| e.to_string())?;

    if !commit_run.status.success() {
        fail_merge_step!("Gate F Failed: Failed to commit files");
    }

    // Success! Update state
    {
        let conn_guard = db_state.0.lock().unwrap_or_else(|e| e.into_inner());
        let conn = conn_guard.as_ref().unwrap();

        let current_head_after_commit = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(repo_dir)
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        let commit_report = json!({
            "success": true,
            "commit_hash": current_head_after_commit,
            "files_staged": expected_files,
        });

        save_merge_artifact(conn, repo_dir, &execution_id, "merge_commit_report", &serde_json::to_string(&commit_report).unwrap_or_default());

        let merge_manifest = json!({
            "execution_id": execution_id,
            "snapshot_head": snapshot_head,
            "merge_head": current_head_after_commit,
            "patch_sha256": actual_checksum,
            "files": expected_files,
            "commit_hash": current_head_after_commit
        });

        save_merge_artifact(conn, repo_dir, &execution_id, "merge_manifest", &serde_json::to_string(&merge_manifest).unwrap_or_default());
        
        conn.execute(
            "UPDATE merge_candidates SET status = 'merged' WHERE execution_id = ?1",
            rusqlite::params![&execution_id]
        ).ok();

        swarm_db::insert_execution_event(conn, &format!("evt-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()), &execution_id, "merge_completed", None).ok();
    }

    transition_execution_state(&app_handle, &execution_id, "completed", Some("merged"))?;

    Ok(MergeResult { success: true, error: None })
}

fn fail_merge(app_handle: &AppHandle, execution_id: &str, error_msg: &str, conn: &rusqlite::Connection) -> Result<MergeResult, String> {
    conn.execute(
        "UPDATE merge_candidates SET status = 'merge_failed' WHERE execution_id = ?1",
        rusqlite::params![execution_id]
    ).ok();

    swarm_db::insert_execution_event(
        conn, 
        &format!("evt-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()), 
        execution_id, 
        "merge_failed", 
        Some(error_msg)
    ).ok();

    let _ = transition_execution_state(app_handle, execution_id, "completed", Some("merge_failed"));

    Ok(MergeResult { success: false, error: Some(error_msg.to_string()) })
}

fn save_merge_artifact(conn: &rusqlite::Connection, repo_dir: &Path, execution_id: &str, artifact_type: &str, content: &str) {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    let checksum = format!("{:x}", hasher.finish());

    let artifact_id = format!("art-{}-{}", artifact_type.replace("_", "-"), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    let multivibe_dir = repo_dir.join(".nexora");
    if !multivibe_dir.exists() {
        let _ = fs::create_dir_all(&multivibe_dir);
    }
    
    let file_name = format!("{}_{}.json", artifact_type, execution_id);
    let file_path = multivibe_dir.join(&file_name);
    
    if fs::write(&file_path, content).is_ok() {
        conn.execute(
            "INSERT INTO artifacts (id, execution_id, artifact_type, file_path, size_bytes, checksum) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![&artifact_id, execution_id, artifact_type, file_path.to_string_lossy().to_string(), content.len() as i64, checksum]
        ).ok();
    }
}
