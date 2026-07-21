use std::path::Path;
use std::collections::HashMap;
use rusqlite::{Connection, params};
use tokio::sync::mpsc;
use crate::team::models::*;
use crate::team::database::migrations::run_team_migrations;

#[derive(Debug, Clone)]
pub enum DbWriteRequest {
    SaveAgentProfile(AgentProfile),
    SaveAgentStats(AgentStatistics),
    SaveAgentPreference {
        agent_id: String,
        key: String,
        value: String,
    },
    SaveAgentCapabilities {
        agent_id: String,
        capabilities: Vec<String>,
    },
    SaveTask(Box<KanbanTask>),
    SaveTaskAttempt {
        task_id: String,
        attempt: TaskAttempt,
    },
    SaveFileDiff {
        task_id: String,
        diff: FileDiff,
    },
    SaveLearningLog {
        agent_id: String,
        task_id: String,
        success: bool,
        mistake: Option<String>,
        rollback: bool,
    },
}

pub struct TeamDb {
    write_tx: mpsc::Sender<DbWriteRequest>,
}

impl TeamDb {
    pub fn new(workspace_path: &str) -> Result<Self, String> {
        let db_dir = Path::new(workspace_path).join(".nexora");
        std::fs::create_dir_all(&db_dir)
            .map_err(|e| format!("Failed to create .nexora directory: {}", e))?;
        
        let db_path = db_dir.join("team.db");
        println!("[TeamDB] Opening connection to {:?}", db_path);
        
        // Open once to run migrations
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open team.db: {}", e))?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA busy_timeout = 5000;
             PRAGMA synchronous = NORMAL;",
        )
        .map_err(|e| format!("PRAGMA failed: {}", e))?;
        
        run_team_migrations(&conn)?;
        drop(conn);

        // Spawn a background thread for writing to sqlite
        let (tx, mut rx) = mpsc::channel::<DbWriteRequest>(1000);
        let db_path_clone = db_path.clone();

        std::thread::spawn(move || {
            let conn = match Connection::open(&db_path_clone) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[TeamDB Worker] Error opening connection: {}", e);
                    return;
                }
            };
            
            let _ = conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

            println!("[TeamDB Worker] Thread started, waiting for operations...");
            while let Some(req) = rx.blocking_recv() {
                if let Err(e) = execute_write_request(&conn, req) {
                    eprintln!("[TeamDB Worker] DB Write Error: {}", e);
                }
            }
            println!("[TeamDB Worker] Thread stopped.");
        });

        Ok(TeamDb { write_tx: tx })
    }

    pub fn queue_write(&self, req: DbWriteRequest) {
        let tx = self.write_tx.clone();
        tokio::spawn(async move {
            if let Err(e) = tx.send(req).await {
                eprintln!("[TeamDB] Failed to queue write: {}", e);
            }
        });
    }

    // Synchronously loads profiles from the DB on startup
    pub fn load_profiles(workspace_path: &str) -> Result<Vec<AgentProfile>, String> {
        let db_path = Path::new(workspace_path).join(".nexora").join("team.db");
        if !db_path.exists() {
            return Ok(Vec::new());
        }
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        
        let mut stmt = conn.prepare("SELECT id, name, role, preferred_model, known_mistakes, languages, expertise FROM agent_profiles")
            .map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let role_str: String = row.get(2)?;
            let preferred_model: String = row.get(3)?;
            let mistakes_str: String = row.get(4)?;
            let languages_str: String = row.get(5)?;
            let expertise_str: String = row.get(6)?;

            let known_mistakes = serde_json::from_str(&mistakes_str).unwrap_or_default();
            let languages = serde_json::from_str(&languages_str).unwrap_or_default();
            let expertise = serde_json::from_str(&expertise_str).unwrap_or_default();

            Ok(AgentProfile {
                id,
                name,
                role: AgentRole::from_str(&role_str),
                preferred_model,
                success_rate: 1.0,
                tasks_completed: 0,
                tasks_failed: 0,
                avg_completion_time_sec: 0.0,
                known_mistakes,
                languages,
                expertise,
                preferences: HashMap::new(),
            })
        }).map_err(|e| e.to_string())?;

        let mut profiles = Vec::new();
        for r in rows {
            if let Ok(mut p) = r {
                // Populate stats
                if let Ok(stats) = conn.query_row(
                    "SELECT success_rate, tasks_completed, tasks_failed, avg_completion_time_sec FROM agent_stats WHERE agent_id = ?1",
                    [&p.id],
                    |row| {
                        Ok((
                            row.get::<_, f64>(0)?,
                            row.get::<_, u32>(1)?,
                            row.get::<_, u32>(2)?,
                            row.get::<_, f64>(3)?,
                        ))
                    }
                ) {
                    p.success_rate = stats.0;
                    p.tasks_completed = stats.1;
                    p.tasks_failed = stats.2;
                    p.avg_completion_time_sec = stats.3;
                }

                // Populate preferences
                if let Ok(mut pref_stmt) = conn.prepare("SELECT pref_key, pref_value FROM agent_preferences WHERE agent_id = ?1") {
                    if let Ok(pref_rows) = pref_stmt.query_map([&p.id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
                        for pr in pref_rows {
                            if let Ok((k, v)) = pr {
                                p.preferences.insert(k, v);
                            }
                        }
                    }
                }

                profiles.push(p);
            }
        }

        Ok(profiles)
    }

    // Synchronously loads tasks from the DB on startup
    pub fn load_tasks(workspace_path: &str) -> Result<Vec<KanbanTask>, String> {
        let db_path = Path::new(workspace_path).join(".nexora").join("team.db");
        if !db_path.exists() {
            return Ok(Vec::new());
        }
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        
        let mut stmt = conn.prepare(
            "SELECT id, title, description, state, assigned_agent_id, created_at, updated_at, priority, 
                    estimated_tokens, estimated_duration, priority_score, retry_count, blocked_reason, 
                    created_by, assigned_by, approval_required, reviewer, parent_task, child_tasks, 
                    checkpoint, quarantine_reason, execution_id FROM tasks"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let description: String = row.get(2)?;
            let state: String = row.get(3)?;
            let assigned_agent_id: Option<String> = row.get(4)?;
            let created_at: String = row.get(5)?;
            let updated_at: String = row.get(6)?;
            let priority: String = row.get(7)?;
            let estimated_tokens: Option<u64> = row.get(8)?;
            let estimated_duration: Option<u64> = row.get(9)?;
            let priority_score: f64 = row.get(10)?;
            let retry_count: u32 = row.get(11)?;
            let blocked_reason: Option<String> = row.get(12)?;
            let created_by: String = row.get(13)?;
            let assigned_by: Option<String> = row.get(14)?;
            let approval_required_int: i32 = row.get(15)?;
            let reviewer: Option<String> = row.get(16)?;
            let parent_task: Option<String> = row.get(17)?;
            let child_tasks_str: String = row.get(18)?;
            let checkpoint: Option<String> = row.get(19)?;
            let quarantine_reason: Option<String> = row.get(20)?;
            let execution_id: Option<String> = row.get(21)?;

            let child_tasks = serde_json::from_str(&child_tasks_str).unwrap_or_default();

            Ok(KanbanTask {
                id,
                title,
                description,
                state,
                assigned_agent_id,
                dependencies: Vec::new(),
                attempts: Vec::new(),
                created_at,
                updated_at,
                priority,
                estimated_tokens,
                estimated_duration,
                priority_score,
                retry_count,
                blocked_reason,
                created_by,
                assigned_by,
                approval_required: approval_required_int != 0,
                reviewer,
                parent_task,
                child_tasks,
                checkpoint,
                file_diffs: None,
                quarantine_reason,
                execution_id: execution_id.clone(),
                execution_id_camel: execution_id,
            })
        }).map_err(|e| e.to_string())?;

        let mut tasks = Vec::new();
        for r in rows {
            if let Ok(mut t) = r {
                // Populate dependencies
                if let Ok(mut dep_stmt) = conn.prepare("SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?1") {
                    if let Ok(dep_rows) = dep_stmt.query_map([&t.id], |r| r.get::<_, String>(0)) {
                        for dr in dep_rows {
                            if let Ok(dep_id) = dr {
                                t.dependencies.push(dep_id);
                            }
                        }
                    }
                }

                // Populate attempts
                if let Ok(mut att_stmt) = conn.prepare(
                    "SELECT attempt_number, started_at, finished_at, status, log_output, validation_errors 
                     FROM task_attempts WHERE task_id = ?1 ORDER BY attempt_number"
                ) {
                    if let Ok(att_rows) = att_stmt.query_map([&t.id], |row| {
                        let attempt_number: u32 = row.get(0)?;
                        let started_at: String = row.get(1)?;
                        let finished_at: Option<String> = row.get(2)?;
                        let status: String = row.get(3)?;
                        let log_output: Option<String> = row.get(4)?;
                        let err_str: String = row.get(5).unwrap_or_else(|_| "[]".to_string());
                        let validation_errors = serde_json::from_str(&err_str).unwrap_or_default();

                        Ok(TaskAttempt {
                            attempt_number,
                            started_at,
                            finished_at,
                            status,
                            log_output,
                            validation_errors: Some(validation_errors),
                        })
                    }) {
                        for ar in att_rows {
                            if let Ok(att) = ar {
                                t.attempts.push(att);
                            }
                        }
                    }
                }

                tasks.push(t);
            }
        }

        Ok(tasks)
    }
}

fn execute_write_request(conn: &Connection, req: DbWriteRequest) -> Result<(), String> {
    match req {
        DbWriteRequest::SaveAgentProfile(p) => {
            let mistakes_str = serde_json::to_string(&p.known_mistakes).unwrap_or_else(|_| "[]".to_string());
            let languages_str = serde_json::to_string(&p.languages).unwrap_or_else(|_| "[]".to_string());
            let expertise_str = serde_json::to_string(&p.expertise).unwrap_or_else(|_| "[]".to_string());

            conn.execute(
                "INSERT OR REPLACE INTO agent_profiles (id, name, role, preferred_model, known_mistakes, languages, expertise)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![p.id, p.name, p.role.as_str(), p.preferred_model, mistakes_str, languages_str, expertise_str],
            )
            .map_err(|e| format!("SaveAgentProfile failed: {}", e))?;
        }
        DbWriteRequest::SaveAgentStats(s) => {
            conn.execute(
                "INSERT OR REPLACE INTO agent_stats (agent_id, success_rate, tasks_completed, tasks_failed, 
                                                    avg_completion_time_sec, total_tokens_used, total_commands_executed, 
                                                    total_files_modified, active_runtime_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    s.agent_id, s.success_rate, s.tasks_completed, s.tasks_failed,
                    s.average_completion_time_sec, s.total_tokens_used, s.total_commands_executed,
                    s.total_files_modified, s.active_runtime_ms
                ],
            )
            .map_err(|e| format!("SaveAgentStats failed: {}", e))?;
        }
        DbWriteRequest::SaveAgentPreference { agent_id, key, value } => {
            conn.execute(
                "INSERT OR REPLACE INTO agent_preferences (agent_id, pref_key, pref_value)
                 VALUES (?1, ?2, ?3)",
                params![agent_id, key, value],
            )
            .map_err(|e| format!("SaveAgentPreference failed: {}", e))?;
        }
        DbWriteRequest::SaveAgentCapabilities { agent_id, capabilities } => {
            // Clear current
            let _ = conn.execute("DELETE FROM agent_capabilities WHERE agent_id = ?1", [&agent_id]);
            // Insert new
            for cap in capabilities {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO agent_capabilities (agent_id, capability) VALUES (?1, ?2)",
                    params![agent_id, cap],
                );
            }
        }
        DbWriteRequest::SaveTask(t) => {
            let child_tasks_str = serde_json::to_string(&t.child_tasks).unwrap_or_else(|_| "[]".to_string());
            let app_req_val = if t.approval_required { 1 } else { 0 };

            conn.execute(
                "INSERT OR REPLACE INTO tasks (id, title, description, state, assigned_agent_id, created_at, updated_at, 
                                              priority, estimated_tokens, estimated_duration, priority_score, retry_count, 
                                              blocked_reason, created_by, assigned_by, approval_required, reviewer, 
                                              parent_task, child_tasks, checkpoint, quarantine_reason, execution_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
                params![
                    t.id, t.title, t.description, t.state, t.assigned_agent_id, t.created_at, t.updated_at,
                    t.priority, t.estimated_tokens, t.estimated_duration, t.priority_score, t.retry_count,
                    t.blocked_reason, t.created_by, t.assigned_by, app_req_val, t.reviewer,
                    t.parent_task, child_tasks_str, t.checkpoint, t.quarantine_reason, t.execution_id
                ],
            )
            .map_err(|e| format!("SaveTask failed: {}", e))?;

            // Save dependencies
            let _ = conn.execute("DELETE FROM task_dependencies WHERE task_id = ?1", [&t.id]);
            for dep in &t.dependencies {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?1, ?2)",
                    params![t.id, dep],
                );
            }
        }
        DbWriteRequest::SaveTaskAttempt { task_id, attempt } => {
            let err_str = serde_json::to_string(&attempt.validation_errors.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
            conn.execute(
                "INSERT OR REPLACE INTO task_attempts (task_id, attempt_number, started_at, finished_at, status, log_output, validation_errors)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![task_id, attempt.attempt_number, attempt.started_at, attempt.finished_at, attempt.status, attempt.log_output, err_str],
            )
            .map_err(|e| format!("SaveTaskAttempt failed: {}", e))?;
        }
        DbWriteRequest::SaveFileDiff { task_id, diff } => {
            conn.execute(
                "INSERT INTO file_diffs (task_id, file_path, original_content, new_content)
                 VALUES (?1, ?2, ?3, ?4)",
                params![task_id, diff.file_path, diff.original_content, diff.new_content],
            )
            .map_err(|e| format!("SaveFileDiff failed: {}", e))?;
        }
        DbWriteRequest::SaveLearningLog { agent_id, task_id, success, mistake, rollback } => {
            let success_val = if success { 1 } else { 0 };
            let rollback_val = if rollback { 1 } else { 0 };
            conn.execute(
                "INSERT INTO agent_learning (agent_id, task_id, success, mistake_description, rollback_performed)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![agent_id, task_id, success_val, mistake, rollback_val],
            )
            .map_err(|e| format!("SaveLearningLog failed: {}", e))?;
        }
    }
    Ok(())
}
