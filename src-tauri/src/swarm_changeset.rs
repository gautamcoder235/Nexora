use serde_json::json;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use crate::swarm_db::{self, DbState};
use std::sync::atomic::{AtomicUsize, Ordering};

static CHANGESET_ID_COUNTER: AtomicUsize = AtomicUsize::new(0);

fn generate_id(prefix: &str) -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let counter = CHANGESET_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{}", prefix, ts, counter)
}

#[tauri::command]
pub async fn create_changeset_draft(
    app_handle: AppHandle,
    title: String,
    origin_agent_id: String,
    explanation: Option<String>,
    summary: Option<String>,
    risk_score: Option<f64>,
    affected_symbols: Option<String>,
) -> Result<String, String> {
    let db_state: State<'_, DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let id = generate_id("cset");
    swarm_db::insert_changeset(
        conn,
        &id,
        &title,
        "draft",
        &origin_agent_id,
        explanation.as_deref(),
        summary.as_deref(),
        risk_score,
        affected_symbols.as_deref(),
    )
    .map_err(|e| format!("Failed to insert changeset: {}", e))?;

    Ok(id)
}

#[tauri::command]
pub async fn add_file_to_changeset(
    app_handle: AppHandle,
    changeset_id: String,
    path: String,
    old_content: String,
    new_content: String,
    patch: String,
    change_source: String,
) -> Result<(), String> {
    let db_state: State<'_, DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let file_change_id = generate_id("cfile");
    swarm_db::insert_changeset_file(
        conn,
        &file_change_id,
        &changeset_id,
        &path,
        &old_content,
        &new_content,
        &patch,
        &change_source,
        "pending",
    )
    .map_err(|e| format!("Failed to insert changeset file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn add_review_comment(
    app_handle: AppHandle,
    changeset_id: String,
    path: Option<String>,
    line_number: Option<i32>,
    agent_name: String,
    comment: String,
    severity: String,
) -> Result<(), String> {
    let db_state: State<'_, DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let comment_id = generate_id("ccmt");
    swarm_db::insert_review_comment(
        conn,
        &comment_id,
        &changeset_id,
        path.as_deref(),
        line_number,
        &agent_name,
        &comment,
        &severity,
    )
    .map_err(|e| format!("Failed to insert review comment: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn update_file_status(
    app_handle: AppHandle,
    changeset_id: String,
    path: String,
    status: String,
) -> Result<(), String> {
    let db_state: State<'_, DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    swarm_db::update_changeset_file_status(conn, &changeset_id, &path, &status)
        .map_err(|e| format!("Failed to update file status: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_changeset_details(
    app_handle: AppHandle,
    changeset_id: String,
) -> Result<serde_json::Value, String> {
    let db_state: State<'_, DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Get changeset metadata
    let mut stmt = conn
        .prepare(
            "SELECT id, title, status, origin_agent_id, created_at, applied_at, explanation, summary, risk_score, affected_symbols FROM changesets WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let cset = stmt
        .query_row([&changeset_id], |row| {
            Ok(swarm_db::DbChangeset {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                origin_agent_id: row.get(3)?,
                created_at: row.get(4)?,
                applied_at: row.get(5)?,
                explanation: row.get(6)?,
                summary: row.get(7)?,
                risk_score: row.get(8)?,
                affected_symbols: row.get(9)?,
            })
        })
        .map_err(|e| format!("Changeset not found: {}", e))?;

    let files = swarm_db::get_changeset_files(conn, &changeset_id)
        .map_err(|e| format!("Failed to query changeset files: {}", e))?;

    let comments = swarm_db::get_changeset_comments(conn, &changeset_id)
        .map_err(|e| format!("Failed to query changeset comments: {}", e))?;

    Ok(json!({
        "id": cset.id,
        "title": cset.title,
        "status": cset.status,
        "originAgentId": cset.origin_agent_id,
        "createdAt": cset.created_at,
        "appliedAt": cset.applied_at,
        "explanation": cset.explanation,
        "summary": cset.summary,
        "riskScore": cset.risk_score,
        "affectedSymbols": cset.affected_symbols.as_ref().map(|s| {
            serde_json::from_str::<serde_json::Value>(s).unwrap_or_else(|_| serde_json::json!(s))
        }).unwrap_or_else(|| serde_json::json!([])),
        "files": files,
        "comments": comments
    }))
}

#[tauri::command]
pub async fn get_all_changesets(app_handle: AppHandle) -> Result<Vec<swarm_db::DbChangeset>, String> {
    let db_state: State<'_, DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let results = swarm_db::get_changesets(conn)
        .map_err(|e| format!("Failed to get changesets: {}", e))?;

    Ok(results)
}

#[tauri::command]
pub async fn apply_changeset_transaction(
    app_handle: AppHandle,
    changeset_id: String,
    repo_path: String,
) -> Result<bool, String> {
    let db_state: State<'_, DbState> = app_handle.state();
    
    // 1. Fetch files associated with this changeset
    let files = {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        swarm_db::get_changeset_files(conn, &changeset_id)
            .map_err(|e| format!("Failed to get changeset files: {}", e))?
    };

    let base_dir = Path::new(&repo_path);
    if !base_dir.exists() {
        return Err("Repository path does not exist".to_string());
    }

    // 2. Capture snapshot backup of current files
    {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        for file in &files {
            // Skip rejected files
            if file.status == "rejected" {
                continue;
            }

            let file_full_path = base_dir.join(&file.path);
            let backup_content = if file_full_path.exists() {
                fs::read_to_string(&file_full_path)
                    .map_err(|e| format!("Failed to read file for backup: {}", e))?
            } else {
                "".to_string() // File does not exist yet (NEW file)
            };

            let snapshot_id = generate_id("snap");
            swarm_db::insert_changeset_snapshot(conn, &snapshot_id, &changeset_id, &file.path, &backup_content)
                .map_err(|e| format!("Failed to insert changeset snapshot: {}", e))?;
        }
    }

    // 3. Apply changes (Write files to workspace)
    for file in &files {
        // Skip rejected files
        if file.status == "rejected" {
            continue;
        }

        let file_full_path = base_dir.join(&file.path);
        
        // Ensure parent directory exists
        if let Some(parent) = file_full_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent folder: {}", e))?;
        }

        fs::write(&file_full_path, &file.new_content)
            .map_err(|e| format!("Failed to write file {}: {}", file.path, e))?;
    }

    // 4. Update status in database
    {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        swarm_db::update_changeset_status(conn, &changeset_id, "applied")
            .map_err(|e| format!("Failed to update changeset status: {}", e))?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn rollback_changeset(
    app_handle: AppHandle,
    changeset_id: String,
    repo_path: String,
) -> Result<bool, String> {
    let db_state: State<'_, DbState> = app_handle.state();
    
    // 1. Fetch snapshots associated with this changeset
    let snapshots = {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        swarm_db::get_changeset_snapshots(conn, &changeset_id)
            .map_err(|e| format!("Failed to get snapshots: {}", e))?
    };

    let base_dir = Path::new(&repo_path);
    if !base_dir.exists() {
        return Err("Repository path does not exist".to_string());
    }

    // 2. Restore file contents from backups
    for snap in &snapshots {
        let file_full_path = base_dir.join(&snap.file_path);

        if snap.content_backup.is_empty() {
            // Original content was empty, which means this file did not exist before and was created.
            // Delete it to rollback.
            if file_full_path.exists() {
                fs::remove_file(&file_full_path)
                    .map_err(|e| format!("Failed to remove created file during rollback: {}", e))?;
            }
        } else {
            // Restore backed up content
            fs::write(&file_full_path, &snap.content_backup)
                .map_err(|e| format!("Failed to restore file content: {}", e))?;
        }
    }

    // 3. Update status in database
    {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        swarm_db::update_changeset_status(conn, &changeset_id, "rolled_back")
            .map_err(|e| format!("Failed to update changeset status: {}", e))?;
    }

    Ok(true)
}

fn copy_dir_filtered(src: &Path, dst: &Path) -> std::io::Result<()> {
    let name = src.file_name().unwrap_or_default().to_string_lossy();
    if name == "node_modules" || name == ".git" || name == "dist" || name == "target" || name == "build" {
        return Ok(());
    }
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let path = entry.path();
            let dest_path = dst.join(entry.file_name());
            copy_dir_filtered(&path, &dest_path)?;
        }
    } else {
        fs::copy(src, dst)?;
    }
    Ok(())
}

fn insert_tester_comment(
    app_handle: &AppHandle,
    changeset_id: &str,
    step_name: &str,
    output: &str,
    severity: &str,
) -> Result<(), String> {
    let db_state: State<'_, DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let comment_id = generate_id("ccmt");
    // Extract first 5 lines of output as a summary
    let summary: String = output.lines().take(5).collect::<Vec<&str>>().join("\n");
    let full_comment = format!("{} Failure Details:\n```\n{}\n```", step_name, summary);

    swarm_db::insert_review_comment(
        conn,
        &comment_id,
        changeset_id,
        None,
        None,
        "Tester Agent",
        &full_comment,
        severity,
    )
    .map_err(|e| format!("Failed to insert review comment: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn validate_changeset_shadow(
    app_handle: AppHandle,
    changeset_id: String,
    repo_path: String,
) -> Result<serde_json::Value, String> {
    let db_state: State<'_, DbState> = app_handle.state();

    // 1. Fetch changeset details and files and clear previous Tester Agent comments
    let files = {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        
        conn.execute(
            "DELETE FROM review_comments WHERE changeset_id = ?1 AND agent_name = 'Tester Agent'",
            [&changeset_id],
        )
        .map_err(|e| format!("Failed to clear old tester comments: {}", e))?;

        swarm_db::get_changeset_files(conn, &changeset_id)
            .map_err(|e| format!("Failed to get changeset files: {}", e))?
    };

    let base_dir = Path::new(&repo_path);
    if !base_dir.exists() {
        return Err("Repository path does not exist".to_string());
    }

    // 2. Create shadow directory path in temp
    let temp_dir = std::env::temp_dir();
    let shadow_dir = temp_dir.join(format!("nexora-shadow-{}", changeset_id));

    if shadow_dir.exists() {
        let _ = fs::remove_dir_all(&shadow_dir);
    }

    // Copy repository contents (filtered)
    copy_dir_filtered(base_dir, &shadow_dir)
        .map_err(|e| format!("Failed to clone shadow workspace: {}", e))?;

    // 3. Write changeset changes (proposals) into the shadow workspace
    for file in &files {
        if file.status == "rejected" {
            continue;
        }
        let file_shadow_path = shadow_dir.join(&file.path);
        if let Some(parent) = file_shadow_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&file_shadow_path, &file.new_content)
            .map_err(|e| format!("Failed to write file to shadow: {}", e))?;
    }

    // 4. Resolve validation commands
    let mut typecheck_cmd = None;
    let mut lint_cmd = None;
    let mut test_cmd = None;
    let mut build_cmd = None;

    // Check DB profile if repository id can be retrieved
    {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        if let Ok(repo_id) = conn.query_row::<String, _, _>(
            "SELECT id FROM repositories WHERE root_path = ?1",
            [&repo_path],
            |row| row.get(0),
        ) {
            if let Ok((t, l, ts)) = conn.query_row(
                "SELECT typecheck_cmd, lint_cmd, test_cmd FROM validation_profiles WHERE repository_id = ?1",
                [&repo_id],
                |row| Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            ) {
                typecheck_cmd = t;
                lint_cmd = l;
                test_cmd = ts;
            }
        }
    }

    // Fallback to package.json scripts in the shadow directory
    let package_json_path = shadow_dir.join("package.json");
    if package_json_path.exists() {
        if let Ok(package_json_str) = fs::read_to_string(&package_json_path) {
            if let Ok(package_json) = serde_json::from_str::<serde_json::Value>(&package_json_str) {
                if let Some(scripts) = package_json.get("scripts") {
                    if typecheck_cmd.is_none() {
                        if scripts.get("typecheck").is_some() {
                            typecheck_cmd = Some("npm run typecheck".to_string());
                        } else if scripts.get("compile").is_some() {
                            typecheck_cmd = Some("npm run compile".to_string());
                        }
                    }
                    if lint_cmd.is_none() && scripts.get("lint").is_some() {
                        lint_cmd = Some("npm run lint".to_string());
                    }
                    if test_cmd.is_none() && scripts.get("test").is_some() {
                        test_cmd = Some("npm run test".to_string());
                    }
                    if build_cmd.is_none() && scripts.get("build").is_some() {
                        build_cmd = Some("npm run build".to_string());
                    }
                }
            }
        }
    }

    // Fallback to language-specific defaults
    if typecheck_cmd.is_none() {
        if shadow_dir.join("tsconfig.json").exists() {
            typecheck_cmd = Some("npx tsc --noEmit".to_string());
        } else if shadow_dir.join("Cargo.toml").exists() {
            typecheck_cmd = Some("cargo check".to_string());
        }
    }
    if test_cmd.is_none() {
        if shadow_dir.join("Cargo.toml").exists() {
            test_cmd = Some("cargo test".to_string());
        } else if shadow_dir.join("requirements.txt").exists() {
            test_cmd = Some("pytest".to_string());
        }
    }
    if build_cmd.is_none() {
        if shadow_dir.join("Cargo.toml").exists() {
            build_cmd = Some("cargo build".to_string());
        }
    }

    // 5. Execute commands and capture results
    let mut typecheck_passed = true;
    let mut lint_passed = true;
    let mut test_passed = true;
    let mut build_passed = true;
    let mut validation_logs = Vec::new();

    let exec_cmd = |cmd_str: &str, shadow_dir_path: &Path| -> Result<(bool, String), String> {
        let is_windows = cfg!(target_os = "windows");
        let shell = if is_windows { "powershell" } else { "sh" };
        let arg_prefix = if is_windows { "-Command" } else { "-c" };
        
        let output = std::process::Command::new(shell)
            .args([arg_prefix, cmd_str])
            .current_dir(shadow_dir_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|e| format!("Command execution failed: {}", e))?;

        let success = output.status.success();
        let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
        
        let combined = format!("{}{}", stdout_str, stderr_str);
        Ok((success, combined))
    };

    if let Some(cmd) = &typecheck_cmd {
        match exec_cmd(cmd, &shadow_dir) {
            Ok((success, output)) => {
                typecheck_passed = success;
                validation_logs.push(json!({ "step": "Typecheck", "success": success, "output": output }));
                if !success {
                    insert_tester_comment(&app_handle, &changeset_id, "Typecheck", &output, "ERROR")?;
                }
            }
            Err(e) => {
                typecheck_passed = false;
                validation_logs.push(json!({ "step": "Typecheck", "success": false, "output": e }));
            }
        }
    }

    if let Some(cmd) = &lint_cmd {
        match exec_cmd(cmd, &shadow_dir) {
            Ok((success, output)) => {
                let lint_actual_passed = success;
                lint_passed = lint_actual_passed;
                validation_logs.push(json!({ "step": "Linter", "success": success, "output": output }));
                if !success {
                    insert_tester_comment(&app_handle, &changeset_id, "Linter", &output, "WARNING")?;
                }
            }
            Err(e) => {
                lint_passed = false;
                validation_logs.push(json!({ "step": "Linter", "success": false, "output": e }));
            }
        }
    }

    if let Some(cmd) = &test_cmd {
        match exec_cmd(cmd, &shadow_dir) {
            Ok((success, output)) => {
                test_passed = success;
                validation_logs.push(json!({ "step": "Unit Tests", "success": success, "output": output }));
                if !success {
                    insert_tester_comment(&app_handle, &changeset_id, "Unit Tests", &output, "BLOCKER")?;
                }
            }
            Err(e) => {
                test_passed = false;
                validation_logs.push(json!({ "step": "Unit Tests", "success": false, "output": e }));
            }
        }
    }

    if let Some(cmd) = &build_cmd {
        match exec_cmd(cmd, &shadow_dir) {
            Ok((success, output)) => {
                build_passed = success;
                validation_logs.push(json!({ "step": "Build Validation", "success": success, "output": output }));
                if !success {
                    insert_tester_comment(&app_handle, &changeset_id, "Build Validation", &output, "BLOCKER")?;
                }
            }
            Err(e) => {
                build_passed = false;
                validation_logs.push(json!({ "step": "Build Validation", "success": false, "output": e }));
            }
        }
    }

    // Clean up shadow directory
    let _ = fs::remove_dir_all(&shadow_dir);

    let overall_status = if typecheck_passed && lint_passed && test_passed && build_passed {
        "passed"
    } else {
        "failed"
    };

    Ok(json!({
        "status": overall_status,
        "typecheckPassed": typecheck_passed,
        "lintPassed": lint_passed,
        "testPassed": test_passed,
        "buildPassed": build_passed,
        "logs": validation_logs
    }))
}
