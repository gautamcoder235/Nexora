use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State, Emitter};
use std::sync::atomic::{AtomicUsize, Ordering};

use crate::swarm_db::{self, DbState};
use crate::swarm_worktrees::{self};

static LIFECYCLE_ID_COUNTER: AtomicUsize = AtomicUsize::new(0);

#[derive(Serialize, Deserialize)]
pub struct LifecycleStartResult {
    pub success: bool,
    pub task_id: String,
    pub execution_id: String,
    pub worktree_id: String,
    pub worktree_path: String,
    pub error: Option<String>,
}

fn generate_id(prefix: &str) -> String {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let counter = LIFECYCLE_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{}", prefix, millis, counter)
}

#[tauri::command]
pub fn start_task_execution(
    app_handle: AppHandle,
    repo_name: String,
    repo_path: String,
    task_title: String,
    task_description: String,
    agent_id: String,
    allowed_patterns: Vec<String>,
) -> Result<LifecycleStartResult, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Generate UUIDs
    let repo_id = format!("repo-{}", repo_name.replace(" ", "-").to_lowercase());
    let task_id = generate_id("task");
    let exec_id = generate_id("exec");
    let worktree_id = generate_id("wt");

    // 1. Persist Repository & Task
    swarm_db::insert_repository_if_missing(conn, &repo_id, &repo_name, &repo_path)
        .map_err(|e| format!("DB Repo Error: {}", e))?;
        
    swarm_db::insert_task(conn, &task_id, &repo_id, &task_title, &task_description, "running")
        .map_err(|e| format!("DB Task Error: {}", e))?;

    // 2. Persist Execution (State: created)
    swarm_db::insert_execution(conn, &exec_id, &task_id, &agent_id, &worktree_id, "created")
        .map_err(|e| format!("DB Exec Error: {}", e))?;

    // Prune execution events/logs older than 7 days
    let _ = swarm_db::prune_old_events_and_logs(conn);

    // Drop lock before state transitions to allow event emitting
    drop(conn_guard);

    // Transition to queued, then starting
    crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "queued", None)?;
    crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "starting", None)?;

    // 3. Create Git Worktree & Contract
    let wt_result = match swarm_worktrees::create_worktree(
        repo_path.clone(), 
        task_id.clone(), 
        exec_id.clone(),
        task_title.clone(),
        task_description.clone(),
        allowed_patterns.clone()
    ) {
        Ok(res) => res,
        Err(e) => {
            let _ = crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "failed", Some(&format!("Worktree error: {}", e)));
            return Ok(LifecycleStartResult {
                success: false,
                task_id,
                execution_id: exec_id,
                worktree_id: "".to_string(),
                worktree_path: "".to_string(),
                error: Some(e),
            });
        }
    };

    if !wt_result.success {
        // Rollback status if creation fails
        let _ = crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "failed", wt_result.error.as_deref());
        return Ok(LifecycleStartResult {
            success: false,
            task_id,
            execution_id: exec_id,
            worktree_id: "".to_string(),
            worktree_path: "".to_string(),
            error: wt_result.error,
        });
    }

    crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "worktree_created", None)?;
    crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "context_injected", None)?;

    // Re-acquire lock for remaining inserts
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // 4. Persist Worktree state
    swarm_db::insert_worktree(
        conn, 
        &worktree_id, 
        &task_id, 
        &exec_id, 
        &repo_id, 
        &wt_result.path, 
        &wt_result.branch_name, 
        "active"
    ).map_err(|e| format!("DB Worktree Error: {}", e))?;

    // 5. Persist Ownership Rules
    for pattern in &allowed_patterns {
        let rule_id = generate_id("rule");
        swarm_db::insert_ownership_rule(conn, &rule_id, &task_id, pattern)
            .map_err(|e| format!("DB Rule Error: {}", e))?;
    }

    Ok(LifecycleStartResult {
        success: true,
        task_id,
        execution_id: exec_id,
        worktree_id,
        worktree_path: wt_result.path,
        error: None,
    })
}

#[tauri::command]
pub fn finish_task_execution(
    app_handle: AppHandle,
    execution_id: String,
    worktree_id: String,
    repo_path: String,
    worktree_path: String,
    branch_name: String,
    success: bool
) -> Result<bool, String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let _conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let final_status = if success { "completed" } else { "failed" };

    // 1. Update SQLite Status
    drop(conn_guard);
    crate::swarm_events::transition_execution_state(&app_handle, &execution_id, final_status, None)
        .map_err(|e| format!("State Error: {}", e))?;
        
    // 2. Remove Git Worktree
    swarm_worktrees::remove_worktree(repo_path, worktree_path, branch_name)?;

    // 3. Mark Worktree deleted in DB
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    swarm_db::mark_worktree_deleted(conn, &worktree_id)
        .map_err(|e| format!("DB Worktree Error: {}", e))?;

    // Prune execution events/logs older than 7 days
    let _ = swarm_db::prune_old_events_and_logs(conn);

    Ok(true)
}

#[derive(Serialize, Deserialize)]
pub struct RecoveryReport {
    pub active_executions: Vec<swarm_db::ActiveExecution>,
    pub recovered_orphans: usize,
    pub failed_executions: usize,
    pub recovered_validations: usize,
    pub recovered_merges: usize,
}

#[tauri::command]
pub fn recover_swarm_state(app_handle: AppHandle, project_root: String) -> Result<RecoveryReport, String> {
    let active_execs = {
        let db_state: State<DbState> = app_handle.state();
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        swarm_db::get_active_executions(conn).map_err(|e| format!("Failed to query active executions: {}", e))?
    };

    let mut valid_execs = Vec::new();
    let mut failed_count = 0;

    for exec in active_execs {
        let worktree_dir = std::path::Path::new(&exec.worktree_path);
        let contract_dir = worktree_dir.join(".nexora");

        if worktree_dir.exists() && contract_dir.exists() {
            valid_execs.push(exec);
        } else {
            let _ = crate::swarm_events::transition_execution_state(&app_handle, &exec.execution_id, "failed", Some("Worktree missing on recovery"));
            
            let db_state: State<DbState> = app_handle.state();
            if let Ok(conn_guard) = db_state.0.lock() {
                if let Some(conn) = conn_guard.as_ref() {
                    let _ = swarm_db::mark_worktree_deleted(conn, &exec.worktree_id);
                }
            }
            failed_count += 1;
        }
    }

    // Optional: Sweep the .nexora-worktrees directory for orphans
    let cleaned_orphans = swarm_worktrees::cleanup_worktrees(project_root).unwrap_or_default();

    // Phase 3.5: Validation Recovery
    let recovered_validations = {
        let state = app_handle.state::<DbState>();
        let x = if let Ok(conn_guard) = state.0.lock() {
            if let Some(conn) = conn_guard.as_ref() {
                conn.execute(
                    "UPDATE validation_runs SET status = 'failed', ended_at = CURRENT_TIMESTAMP WHERE status = 'running'",
                    []
                ).unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        };
        x
    };

    // Phase 6: Merge Recovery
    let mut recovered_merges = 0;
    {
        let state = app_handle.state::<DbState>();
        let mut conn_guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
        let conn = conn_guard.as_mut().unwrap();

        let merging_candidates: Vec<String> = {
            let mut stmt = conn.prepare("SELECT execution_id FROM merge_candidates WHERE status = 'merging'").unwrap();
            stmt.query_map([], |row| row.get(0)).unwrap().filter_map(|r| r.ok()).collect()
        };

        for exec_id in merging_candidates {
            // Find repo path
            let repo_path: String = conn.query_row(
                "SELECT r.root_path FROM executions e JOIN tasks t ON e.task_id = t.id JOIN repositories r ON t.repository_id = r.id WHERE e.id = ?1",
                rusqlite::params![&exec_id],
                |row| row.get(0)
            ).unwrap_or_default();

            if !repo_path.is_empty() {
                // Check if commit exists
                let log_output = std::process::Command::new("git")
                    .args(["log", "--oneline", "-n", "10"])
                    .current_dir(&repo_path)
                    .output()
                    .ok();
                
                let commit_exists = if let Some(out) = log_output {
                    let log_str = String::from_utf8_lossy(&out.stdout);
                    log_str.contains(&format!("Swarm: Merged Execution {}", exec_id))
                } else {
                    false
                };

                if commit_exists {
                    conn.execute("UPDATE merge_candidates SET status = 'merged' WHERE execution_id = ?1", rusqlite::params![&exec_id]).ok();
                    let _ = crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "completed", Some("merged"));
                } else {
                    // Reset half-applied patches
                    let _ = std::process::Command::new("git").args(["reset", "--hard"]).current_dir(&repo_path).status();
                    let _ = std::process::Command::new("git").args(["clean", "-fd"]).current_dir(&repo_path).status();
                    
                    conn.execute("UPDATE merge_candidates SET status = 'merge_failed' WHERE execution_id = ?1", rusqlite::params![&exec_id]).ok();
                    let _ = crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "completed", Some("merge_failed"));
                }
                recovered_merges += 1;
            }
        }
    }

    Ok(RecoveryReport {
        active_executions: valid_execs,
        recovered_orphans: cleaned_orphans.len(),
        failed_executions: failed_count,
        recovered_validations,
        recovered_merges,
    })
}

#[tauri::command]
pub fn spawn_agent_session(
    app_handle: AppHandle,
    session_id: String,
    execution_id: String,
) -> Result<(), String> {
    let db_state: State<DbState> = app_handle.state();
    let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // 1. Fetch Execution details (Worktree path and Agent ID)
    let exec_query = "
        SELECT e.agent_id, w.path 
        FROM executions e 
        JOIN worktrees w ON e.worktree_id = w.id 
        WHERE e.id = ?1 AND e.status = 'running'
    ";
    let (agent_id, cwd): (String, String) = conn.query_row(exec_query, [&execution_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).map_err(|e| format!("Execution not found: {}", e))?;

    // 2. Fetch Agent Command
    let agent_cmd: String = conn.query_row(
        "SELECT command FROM agents WHERE id = ?1", 
        [&agent_id], 
        |row| row.get(0)
    ).map_err(|e| format!("Agent not found: {}", e))?;

    // 3. Agent Pre-Flight Validation
    let pre_flight = std::process::Command::new(&agent_cmd)
        .arg("--version")
        .output();
    
    if pre_flight.is_err() {
        drop(conn_guard);
        let _ = crate::swarm_events::transition_execution_state(&app_handle, &execution_id, "failed", Some("Agent pre-flight failed"));
        return Err(format!("Pre-flight validation failed: Agent '{}' is not installed or accessible.", agent_cmd));
    }

    // Insert Agent Process into DB (Status: starting)
    let process_id_db = generate_id("proc");
    swarm_db::insert_agent_process(conn, &process_id_db, &execution_id, None, &agent_cmd, "starting")
        .map_err(|e| format!("DB Proc Error: {}", e))?;

    // Drop DB lock before spawning PTY to prevent blocking
    drop(conn_guard);

    // 4. Delegate to the core spawn_pty using the fetched context
    let pid_opt = crate::spawn_pty(
        app_handle.clone(),
        session_id,
        Some(agent_cmd.clone()),
        None,
        Some(cwd),
        None,
        None,
        None,
    )?;

    // 5. Re-acquire DB to update PID and State
    let conn_guard_post = db_state.0.lock().map_err(|_| "Failed to lock DB post-spawn".to_string())?;
    if let Some(conn_post) = conn_guard_post.as_ref() {
        if let Some(pid) = pid_opt {
            let _ = conn_post.execute(
                "UPDATE agent_processes SET pid = ?1, status = 'running' WHERE id = ?2",
                rusqlite::params![pid, process_id_db],
            );
        } else {
            let _ = swarm_db::update_agent_process_status(conn_post, &process_id_db, "running", None);
        }
    }
    
    // Drop lock before emitting running event
    drop(conn_guard_post);
    let _ = crate::swarm_events::transition_execution_state(&app_handle, &execution_id, "running", None);

    Ok(())
}

pub fn start_agent_watchdog(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            
            {
                if let Ok(conn_guard) = app_handle.state::<DbState>().0.lock() {
                    if let Some(conn) = conn_guard.as_ref() {
                        // Find running processes older than max_runtime_seconds (e.g. 1 hour = 3600 secs)
                        let timeout_secs = 3600;
                        
                        let stalled_agents: Vec<(String, String, Option<u32>)> = {
                            let mut stmt = conn.prepare("
                                SELECT id, execution_id, pid FROM agent_processes 
                                WHERE status = 'running' 
                                AND strftime('%s', 'now') - strftime('%s', started_at) > ?1
                            ").unwrap();
                            
                            stmt.query_map([timeout_secs], |row| {
                                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                            }).unwrap().filter_map(|r| r.ok()).collect()
                        };
                        
                        drop(conn_guard);

                        for (proc_id, exec_id, pid_opt) in stalled_agents {
                            // Kill the stalled process
                            if let Some(pid) = pid_opt {
                                #[cfg(unix)]
                                unsafe { libc::kill(pid as i32, libc::SIGKILL); }
                                
                                #[cfg(windows)]
                                let _ = std::process::Command::new("taskkill").args(["/T", "/F", "/PID", &pid.to_string()]).output();
                            }
                            
                            // Re-acquire lock to update process status
                            if let Ok(cg) = app_handle.state::<DbState>().0.lock() {
                                if let Some(c) = cg.as_ref() {
                                    let _ = swarm_db::update_agent_process_status(c, &proc_id, "terminated", Some(-1));
                                }
                            }
                            
                            let _ = crate::swarm_events::transition_execution_state(&app_handle, &exec_id, "terminated", Some("Watchdog timeout limit exceeded"));
                        }
                    }
                }
            }
        }
    });
}

#[tauri::command]
pub async fn debug_simulate_agent_completion(
    app_handle: AppHandle,
    execution_id: String,
) -> Result<bool, String> {
    let (repo_path, worktree_path_opt, allowed_patterns) = {
        let db_state: tauri::State<'_, DbState> = app_handle.state();
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        
        let exec_query = "
            SELECT r.root_path, e.worktree_id
            FROM executions e
            JOIN tasks t ON e.task_id = t.id
            JOIN repositories r ON t.repository_id = r.id
            WHERE e.id = ?1
        ";
        let (r_path, wt_id_opt): (String, Option<String>) = conn.query_row(exec_query, [&execution_id], |row| {
            Ok((row.get(0)?, row.get::<_, Option<String>>(1)?))
        }).map_err(|e| format!("Exec missing: {}", e))?;

        let w_path = if let Some(wt_id) = wt_id_opt {
            let path: Option<String> = conn.query_row("SELECT path FROM worktrees WHERE id = ?1", [&wt_id], |row| row.get(0)).ok();
            path
        } else {
            None
        };

        let mut stmt = conn.prepare("SELECT pattern FROM ownership_rules WHERE task_id = (SELECT task_id FROM executions WHERE id = ?1)").map_err(|e| format!("DB Prepare Error: {}", e))?;
        let patterns: Vec<String> = stmt.query_map([&execution_id], |row| row.get(0))
            .map_err(|e| format!("DB Query Error: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        (r_path, w_path, patterns)
    };

    let worktree_path = match worktree_path_opt {
        Some(p) => p,
        None => return Err("The Git worktree was never created for this execution. Please create a new task!".to_string()),
    };

    // Simulate agent creating a file
    let dummy_file = std::path::Path::new(&worktree_path).join("swarm_test.js");
    std::fs::write(&dummy_file, "console.log('Swarm generated patch');").ok();

    // Satisfy the strict DB state machine constraints
    let _ = crate::swarm_events::transition_execution_state(&app_handle, &execution_id, "running", None);
    let _ = crate::swarm_events::transition_execution_state(&app_handle, &execution_id, "validating", None);
    crate::swarm_events::transition_execution_state(&app_handle, &execution_id, "completed", None)?;

    // Start validation in background
    let _ = crate::swarm_validation::run_validation_async(
        app_handle.clone(),
        execution_id.clone(),
        repo_path,
        worktree_path,
        allowed_patterns,
    ).await;

    Ok(true)
}


#[tauri::command]
pub async fn pause_execution(
    app_handle: tauri::AppHandle,
    execution_id: String,
) -> Result<(), String> {
    let db_state: tauri::State<'_, DbState> = app_handle.state();
    let (proc_id_opt, pid_opt): (Option<String>, Option<u32>) = {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        conn.query_row(
            "SELECT id, pid FROM agent_processes WHERE execution_id = ?1 AND status = 'running' LIMIT 1",
            rusqlite::params![execution_id],
            |row| Ok((row.get(0)?, row.get::<_, Option<u32>>(1)?))
        ).unwrap_or((None, None))
    };

    if let Some(proc_id) = proc_id_opt {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        swarm_db::update_agent_process_status(conn, &proc_id, "paused", None)
            .map_err(|e| format!("Failed to update agent process status: {}", e))?;
    }

    if let Some(pid) = pid_opt {
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGSTOP);
        }

        #[cfg(windows)]
        {
            #[link(name = "kernel32")]
            extern "system" {
                fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut std::ffi::c_void;
                fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
            }
            #[link(name = "ntdll")]
            extern "system" {
                fn NtSuspendProcess(hProcess: *mut std::ffi::c_void) -> i32;
            }
            unsafe {
                let handle = OpenProcess(0x0800, 0, pid);
                if !handle.is_null() {
                    let _ = NtSuspendProcess(handle);
                    let _ = CloseHandle(handle);
                }
            }
        }
    }

    crate::swarm_events::transition_execution_state(&app_handle, &execution_id, "paused", Some("Execution paused by user"))?;
    Ok(())
}

#[tauri::command]
pub async fn resume_execution(
    app_handle: tauri::AppHandle,
    execution_id: String,
) -> Result<(), String> {
    let db_state: tauri::State<'_, DbState> = app_handle.state();
    let (proc_id_opt, pid_opt): (Option<String>, Option<u32>) = {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        conn.query_row(
            "SELECT id, pid FROM agent_processes WHERE execution_id = ?1 AND status = 'paused' LIMIT 1",
            rusqlite::params![execution_id],
            |row| Ok((row.get(0)?, row.get::<_, Option<u32>>(1)?))
        ).unwrap_or((None, None))
    };

    if let Some(proc_id) = proc_id_opt {
        let conn_guard = db_state.0.lock().map_err(|_| "Failed to lock DB".to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        swarm_db::update_agent_process_status(conn, &proc_id, "running", None)
            .map_err(|e| format!("Failed to update agent process status: {}", e))?;
    }

    if let Some(pid) = pid_opt {
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGCONT);
        }

        #[cfg(windows)]
        {
            #[link(name = "kernel32")]
            extern "system" {
                fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut std::ffi::c_void;
                fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
            }
            #[link(name = "ntdll")]
            extern "system" {
                fn NtResumeProcess(hProcess: *mut std::ffi::c_void) -> i32;
            }
            unsafe {
                let handle = OpenProcess(0x0800, 0, pid);
                if !handle.is_null() {
                    let _ = NtResumeProcess(handle);
                    let _ = CloseHandle(handle);
                }
            }
        }
    }

    crate::swarm_events::transition_execution_state(&app_handle, &execution_id, "running", Some("Execution resumed by user"))?;
    Ok(())
}

pub fn start_lock_watchdog(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

            let expired_locks = {
                let db_state = match app_handle.try_state::<DbState>() {
                    Some(state) => state,
                    None => continue,
                };
                
                let conn_guard = match db_state.0.lock() {
                    Ok(guard) => guard,
                    Err(_) => continue,
                };
                
                let conn = match conn_guard.as_ref() {
                    Some(c) => c,
                    None => continue,
                };

                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;

                let mut stmt = match conn.prepare("SELECT file_path, agent_id, expires_at FROM resource_locks WHERE expires_at < ?1") {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                let rows = match stmt.query_map([now], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
                }) {
                    Ok(r) => r,
                    Err(_) => continue,
                };

                let mut list = Vec::new();
                for r in rows {
                    if let Ok(item) = r {
                        list.push(item);
                    }
                }

                if !list.is_empty() {
                    let _ = conn.execute("DELETE FROM resource_locks WHERE expires_at < ?1", [now]);
                }

                list
            };

            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;

            for (file_path, agent_id, expires_at) in expired_locks {
                #[derive(Serialize, Clone)]
                struct LockExpirationPayload {
                    file_path: String,
                    agent_id: String,
                    expired_at: i64,
                    cleared_at: i64,
                }

                let payload = LockExpirationPayload {
                    file_path,
                    agent_id,
                    expired_at: expires_at,
                    cleared_at: now,
                };

                let _ = app_handle.emit("lock:expired", payload);
            }
        }
    });
}
