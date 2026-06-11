use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::path::Path;
use std::fs;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Semaphore;
use std::sync::Arc;

use crate::swarm_db::DbState;

lazy_static::lazy_static! {
    static ref VALIDATION_SEMAPHORE: Arc<Semaphore> = Arc::new(Semaphore::new(5));
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ValidationProfile {
    pub typecheck_cmd: Option<String>,
    pub lint_cmd: Option<String>,
    pub test_cmd: Option<String>,
    pub timeout_seconds: u64,
    pub deep_git_integrity: bool,
}

#[derive(Serialize, Deserialize)]
pub struct ValidationStepResult {
    pub step_name: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub output: String,
}

// Ensure the pipeline can orchestrate the gates:
// Gate A: Repository Snapshot
// Gate B: Ownership Check & Hash Drift
// Gate C: Git Integrity
// Gate D: Type Check
// Gate E: Lint
// Gate F: Tests

pub fn run_validation_pipeline(
    app_handle: &AppHandle,
    execution_id: &str,
    _repo_path: &str,
    worktree_path: &str,
    allowed_patterns: Vec<String>,
) -> Result<Vec<ValidationStepResult>, String> {
    
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // 1. Fetch Validation Profile
    let mut profile = ValidationProfile {
        typecheck_cmd: None,
        lint_cmd: None,
        test_cmd: None,
        timeout_seconds: 300,
        deep_git_integrity: false,
    };
    
    // Attempt to query profile from DB (Fallback to defaults if not found)
    let repo_id_query = "SELECT repository_id FROM executions e JOIN worktrees w ON e.worktree_id = w.id WHERE e.id = ?1";
    if let Ok(repo_id) = conn.query_row::<String, _, _>(repo_id_query, [execution_id], |row| row.get(0)) {
        if let Ok((t, l, ts, to, deep)) = conn.query_row(
            "SELECT typecheck_cmd, lint_cmd, test_cmd, timeout_seconds, deep_git_integrity FROM validation_profiles WHERE repository_id = ?1",
            [&repo_id],
            |row| Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, u64>(3)?,
                row.get::<_, bool>(4)?,
            ))
        ) {
            profile = ValidationProfile {
                typecheck_cmd: t,
                lint_cmd: l,
                test_cmd: ts,
                timeout_seconds: to,
                deep_git_integrity: deep,
            };
        }
    }

    // 2. Start Validation Run
    let run_id = format!("vrun-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis());
    conn.execute(
        "INSERT INTO validation_runs (id, execution_id, status) VALUES (?1, ?2, 'running')",
        rusqlite::params![run_id, execution_id]
    ).map_err(|e| format!("DB Insert Error: {}", e))?;

    // Drop lock before running long commands to prevent deadlocks and blockages
    drop(conn_guard);
    let _ = crate::swarm_events::emit_event(app_handle, "validation:updated", execution_id);

    let mut results = Vec::new();

    macro_rules! fail_pipeline {
        ($step:expr, $exit_code:expr, $duration:expr, $output:expr) => {{
            let cg = db_state.0.lock().unwrap_or_else(|e| e.into_inner());
            let c = cg.as_ref().unwrap();
            c.execute(
                "UPDATE validation_runs SET status = 'failed', ended_at = CURRENT_TIMESTAMP WHERE id = ?1",
                rusqlite::params![run_id]
            ).ok();
            c.execute(
                "INSERT INTO validation_steps (id, validation_run_id, step_name, exit_code, duration_ms, status) VALUES (?1, ?2, ?3, ?4, ?5, 'failed')",
                rusqlite::params![format!("{}-{}", run_id, $step), run_id, $step, $exit_code, $duration]
            ).ok();
            drop(cg);
            let _ = crate::swarm_events::emit_event(app_handle, "validation:updated", execution_id);
            
            results.push(ValidationStepResult {
                step_name: $step.to_string(),
                success: false,
                exit_code: $exit_code,
                duration_ms: $duration,
                output: $output,
            });
            return Ok(results);
        }}
    }

    macro_rules! pass_step {
        ($step:expr, $duration:expr, $output:expr) => {{
            let cg = db_state.0.lock().unwrap_or_else(|e| e.into_inner());
            let c = cg.as_ref().unwrap();
            c.execute(
                "INSERT INTO validation_steps (id, validation_run_id, step_name, exit_code, duration_ms, status) VALUES (?1, ?2, ?3, 0, ?4, 'passed')",
                rusqlite::params![format!("{}-{}", run_id, $step), run_id, $step, $duration]
            ).ok();
            drop(cg);
            let _ = crate::swarm_events::emit_event(app_handle, "validation:updated", execution_id);
            results.push(ValidationStepResult {
                step_name: $step.to_string(),
                success: true,
                exit_code: Some(0),
                duration_ms: $duration,
                output: $output,
            });
        }}
    }

    // GATE A: Repository Snapshot
    let start_a = Instant::now();
    let git_head = Command::new("git")
        .current_dir(worktree_path)
        .arg("rev-parse")
        .arg("HEAD")
        .output();
    
    if let Ok(head_out) = git_head {
        if head_out.status.success() {
            let commit = String::from_utf8_lossy(&head_out.stdout).trim().to_string();
            db_state.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref().unwrap().execute(
                "INSERT INTO execution_snapshots (id, execution_id, head_commit, branch) VALUES (?1, ?2, ?3, 'worktree')",
                rusqlite::params![format!("snap-{}", run_id), execution_id, commit]
            ).ok();
            pass_step!("Gate A: Snapshot", start_a.elapsed().as_millis() as u64, format!("HEAD captured: {}", commit));
        } else {
            fail_pipeline!("Gate A: Snapshot", Some(1), start_a.elapsed().as_millis() as u64, "Failed to get HEAD".to_string());
        }
    } else {
        fail_pipeline!("Gate A: Snapshot", None::<i32>, start_a.elapsed().as_millis() as u64, "Git command failed".to_string());
    }

    // GATE B: Ownership Check & Hash Drift
    let start_b = Instant::now();
    
    let ownership_hash_path = Path::new(worktree_path).join(".multivibe").join("ownership.hash");
    if let Ok(disk_hash) = fs::read_to_string(&ownership_hash_path) {
        use std::hash::{Hash, Hasher};
        use std::collections::hash_map::DefaultHasher;
        let mut hasher = DefaultHasher::new();
        allowed_patterns.hash(&mut hasher);
        let expected_hash = format!("{:x}", hasher.finish());

        if disk_hash.trim() != expected_hash {
            fail_pipeline!("Gate B: Ownership Hash Drift", Some(1), start_b.elapsed().as_millis() as u64, format!("Contract drift detected! Expected {}, got {}", expected_hash, disk_hash));
        }
    } else {
        fail_pipeline!("Gate B: Ownership Hash Drift", None::<i32>, start_b.elapsed().as_millis() as u64, "ownership.hash missing".to_string());
    }

    let ownership_result = crate::swarm_ownership::validate_ownership(worktree_path.to_string(), allowed_patterns);
    match ownership_result {
        Ok(res) if res.is_valid => {
            pass_step!("Gate B: Ownership Validation", start_b.elapsed().as_millis() as u64, format!("{} files modified safely", res.modified_files.len()));
        },
        Ok(res) => {
            fail_pipeline!("Gate B: Ownership Validation", Some(1), start_b.elapsed().as_millis() as u64, format!("Violated files: {:?}", res.violated_files));
        },
        Err(e) => {
            fail_pipeline!("Gate B: Ownership Validation", None::<i32>, start_b.elapsed().as_millis() as u64, format!("Validation Error: {}", e));
        }
    }

    // GATE C: Git Integrity
    let start_c = Instant::now();
    let status_out = Command::new("git").current_dir(worktree_path).arg("status").arg("--porcelain").output();
    if status_out.is_err() || !status_out.unwrap().status.success() {
        fail_pipeline!("Gate C: Git Integrity (Fast)", Some(1), start_c.elapsed().as_millis() as u64, "git status failed".to_string());
    }

    if profile.deep_git_integrity {
        let fsck_out = Command::new("git").current_dir(worktree_path).args(["fsck", "--no-progress"]).output();
        if fsck_out.is_err() || !fsck_out.unwrap().status.success() {
            fail_pipeline!("Gate C: Git Integrity (Deep)", Some(1), start_c.elapsed().as_millis() as u64, "git fsck failed. Repository corrupted.".to_string());
        }
    }
    pass_step!("Gate C: Git Integrity", start_c.elapsed().as_millis() as u64, "Git tree is clean and intact.".to_string());

    // Helper to run scripts with timeout
    fn run_script(cmd_opt: Option<String>, step: &str, worktree: &str, timeout_secs: u64) -> Result<(bool, Option<i32>, String), String> {
        if let Some(cmd_str) = cmd_opt {
            let parts: Vec<&str> = cmd_str.split_whitespace().collect();
            if parts.is_empty() { return Ok((true, Some(0), "Empty command".to_string())); }
            
            let mut child = Command::new(parts[0])
                .args(&parts[1..])
                .current_dir(worktree)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| e.to_string())?;

            use wait_timeout::ChildExt;
            let secs = Duration::from_secs(timeout_secs);

            let status_code = match child.wait_timeout(secs).map_err(|e| e.to_string())? {
                Some(status) => status.code(),
                None => {
                    // Timeout hit
                    let _ = child.kill();
                    let _ = child.wait();
                    return Ok((false, None, format!("Validation Step '{}' timed out after {} seconds.", step, timeout_secs)));
                }
            };

            let out = child.wait_with_output().map_err(|e| e.to_string())?;
            let output_str = format!("{}\n{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));

            Ok((status_code == Some(0), status_code, output_str))
        } else {
            Ok((true, Some(0), "Skipped (No script provided)".to_string()))
        }
    }

    // GATE D: Type Check
    let start_d = Instant::now();
    match run_script(profile.typecheck_cmd, "Type Check", worktree_path, profile.timeout_seconds) {
        Ok((true, _, out)) => pass_step!("Gate D: Type Check", start_d.elapsed().as_millis() as u64, out),
        Ok((false, code, out)) => fail_pipeline!("Gate D: Type Check", code, start_d.elapsed().as_millis() as u64, out),
        Err(e) => fail_pipeline!("Gate D: Type Check", None::<i32>, start_d.elapsed().as_millis() as u64, format!("Failed to spawn: {}", e)),
    }

    // GATE E: Lint
    let start_e = Instant::now();
    match run_script(profile.lint_cmd, "Lint", worktree_path, profile.timeout_seconds) {
        Ok((true, _, out)) => pass_step!("Gate E: Lint", start_e.elapsed().as_millis() as u64, out),
        Ok((false, code, out)) => fail_pipeline!("Gate E: Lint", code, start_e.elapsed().as_millis() as u64, out),
        Err(e) => fail_pipeline!("Gate E: Lint", None::<i32>, start_e.elapsed().as_millis() as u64, format!("Failed to spawn: {}", e)),
    }

    // GATE F: Tests
    let start_f = Instant::now();
    match run_script(profile.test_cmd, "Test", worktree_path, profile.timeout_seconds) {
        Ok((true, _, out)) => pass_step!("Gate F: Test", start_f.elapsed().as_millis() as u64, out),
        Ok((false, code, out)) => fail_pipeline!("Gate F: Test", code, start_f.elapsed().as_millis() as u64, out),
        Err(e) => fail_pipeline!("Gate F: Test", None::<i32>, start_f.elapsed().as_millis() as u64, format!("Failed to spawn: {}", e)),
    }

    // PATCH GENERATION & ARTIFACT STORAGE
    let patch_out = Command::new("git").current_dir(worktree_path).args(["format-patch", "HEAD~1", "--stdout"]).output();
    let mut patch_content = String::new();
    if let Ok(out) = patch_out {
        patch_content = String::from_utf8_lossy(&out.stdout).to_string();
    }
    
    let diff_stat_out = Command::new("git").current_dir(worktree_path).args(["diff", "HEAD~1", "--stat"]).output();
    let mut diff_stat_content = String::new();
    if let Ok(out) = diff_stat_out {
        diff_stat_content = String::from_utf8_lossy(&out.stdout).to_string();
    }

    // Save Patch to Disk and DB
    let artifacts_dir = app_handle.path().app_data_dir().unwrap().join("artifacts");
    let _ = fs::create_dir_all(&artifacts_dir);
    let patch_file_name = format!("patch_{}.diff", run_id);
    let patch_path = artifacts_dir.join(&patch_file_name);
    let _ = fs::write(&patch_path, &patch_content);

    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    let mut patch_hasher = DefaultHasher::new();
    patch_content.hash(&mut patch_hasher);
    let patch_hash = format!("{:x}", patch_hasher.finish());

    let patch_artifact_id = format!("art-patch-{}", run_id);
            db_state.0.lock().unwrap().as_ref().unwrap().execute(
        "INSERT INTO artifacts (id, execution_id, artifact_type, file_path, size_bytes, checksum) VALUES (?1, ?2, 'patch', ?3, ?4, ?5)",
        rusqlite::params![&patch_artifact_id, execution_id, patch_path.to_string_lossy().to_string(), patch_content.len() as i64, patch_hash]
    ).ok();

    // Handoff to Merge Preparation Layer
    let merge_candidate_id = format!("mc-{}", run_id);
            db_state.0.lock().unwrap().as_ref().unwrap().execute(
        "INSERT INTO merge_candidates (id, execution_id, patch_artifact_id, status) VALUES (?1, ?2, ?3, 'pending_review')",
        rusqlite::params![&merge_candidate_id, execution_id, &patch_artifact_id]
    ).ok();

    // FINISH PIPELINE
            db_state.0.lock().unwrap().as_ref().unwrap().execute(
        "UPDATE validation_runs SET status = 'passed', ended_at = CURRENT_TIMESTAMP WHERE id = ?1",
        rusqlite::params![run_id]
    ).ok();

    // Add final report to results
    results.push(ValidationStepResult {
        step_name: "Patch Generation".to_string(),
        success: true,
        exit_code: Some(0),
        duration_ms: 0,
        output: diff_stat_content,
    });

    Ok(results)
}

#[tauri::command]
pub async fn run_validation_async(
    app_handle: AppHandle,
    execution_id: String,
    repo_path: String,
    worktree_path: String,
    allowed_patterns: Vec<String>,
) -> Result<Vec<ValidationStepResult>, String> {
    // Acquire semaphore permit (max 5 concurrent validations)
    let _permit = VALIDATION_SEMAPHORE.acquire().await.map_err(|e| e.to_string())?;

    // The inner pipeline is currently sync, so we wrap it in spawn_blocking
    // to not block the async runtime thread while it runs sync processes.
    let app_handle_clone = app_handle.clone();
    let res = tokio::task::spawn_blocking(move || {
        run_validation_pipeline(&app_handle_clone, &execution_id, &repo_path, &worktree_path, allowed_patterns)
    }).await.map_err(|e| e.to_string())?;

    res
}
