use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender, Receiver};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};
use rusqlite::{params, Connection};
use crate::memory::models::{TimelineEntry, FileOperation};

pub static DB_WORKER_SENDER: OnceLock<Sender<DatabaseTask>> = OnceLock::new();

pub struct CommitImport {
    pub hash: String,
    pub source: String,
    pub description: String,
    pub timestamp: String,
}

pub struct FileOpImport {
    pub file_path: String,
    pub operation_type: String,
    pub old_path: Option<String>,
}

pub enum DatabaseTask {
    InitializeSchema {
        project_path: String,
        resp_tx: Sender<Result<(), String>>,
    },
    ImportGitCommits {
        project_path: String,
        commits: Vec<CommitImport>,
        resp_tx: Sender<Result<(), String>>,
    },
    InsertCheckpoint {
        project_path: String,
        commit_hash: String,
        name: String,
        operations: Vec<FileOpImport>,
        resp_tx: Sender<Result<(), String>>,
    },
    InsertSnapshot {
        project_path: String,
        commit_hash: String,
        source: String,
        description: Option<String>,
        session_id: Option<String>,
        operations: Vec<FileOpImport>,
        resp_tx: Sender<Result<(), String>>,
    },
    UpdateReview {
        project_path: String,
        commit_hash: String,
        status: String,
        resp_tx: Sender<Result<(), String>>,
    },
    GetTimeline {
        project_path: String,
        resp_tx: Sender<Result<Vec<TimelineEntry>, String>>,
    },
    GetDbCommitsCount {
        project_path: String,
        resp_tx: Sender<Result<i64, String>>,
    },
    PragmaMaintenance {
        project_path: String,
        resp_tx: Sender<Result<(), String>>,
    },
}

pub fn start_db_worker() {
    let (tx, rx): (Sender<DatabaseTask>, Receiver<DatabaseTask>) = channel();
    let _ = DB_WORKER_SENDER.set(tx);

    thread::spawn(move || {
        let mut active_connections: std::collections::HashMap<String, Connection> = std::collections::HashMap::new();
        let mut last_activity = Instant::now();

        loop {
            // Receive task with a 5-second timeout to allow background maintenance during idle
            match rx.recv_timeout(Duration::from_secs(5)) {
                Ok(task) => {
                    last_activity = Instant::now();
                    execute_task(&mut active_connections, task);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Truncate WAL files and run passive checkpoints on all active open connections if idle
                    if last_activity.elapsed() >= Duration::from_secs(10) {
                        for (project_path, conn) in active_connections.iter() {
                            let _ = conn.execute("PRAGMA wal_checkpoint(TRUNCATE);", []);
                            
                            // Check for vacuum threshold (size > 50MB and idle)
                            let db_file = Path::new(project_path).join(".nexora").join("memory.db");
                            if let Ok(meta) = fs::metadata(&db_file) {
                                if meta.len() > 50_000_000 {
                                    let _ = conn.execute("VACUUM;", []);
                                }
                            }
                        }
                        // Reset activity timer to avoid spinning vacuum check continuously
                        last_activity = Instant::now();
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }
    });
}

fn get_connection_mut<'a>(
    connections: &'a mut std::collections::HashMap<String, Connection>,
    project_path: &str,
) -> Result<&'a mut Connection, String> {
    if !connections.contains_key(project_path) {
        let db_dir = Path::new(project_path).join(".nexora");
        fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
        
        let conn = Connection::open(db_dir.join("memory.db")).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA busy_timeout=5000;
             PRAGMA wal_checkpoint(PASSIVE);"
        ).map_err(|e| e.to_string())?;
        
        connections.insert(project_path.to_string(), conn);
    }
    Ok(connections.get_mut(project_path).unwrap())
}

fn write_db_journal(project_path: &str, op_name: &str, commit_hash: &str) -> Result<PathBuf, String> {
    let journal_dir = Path::new(project_path).join(".nexora").join("recovery");
    fs::create_dir_all(&journal_dir).map_err(|e| e.to_string())?;
    
    let journal_path = journal_dir.join("db_operation.journal");
    let content = format!(
        "{{\n  \"operation\": \"{}\",\n  \"started\": \"{}\",\n  \"commit\": \"{}\"\n}}",
        op_name,
        chrono::Local::now().to_rfc3339(),
        commit_hash
    );
    
    fs::write(&journal_path, content).map_err(|e| e.to_string())?;
    
    if let Ok(file) = fs::File::open(&journal_path) {
        let _ = file.sync_all();
    }
    Ok(journal_path)
}

fn execute_task(
    connections: &mut std::collections::HashMap<String, Connection>,
    task: DatabaseTask,
) {
    match task {
        DatabaseTask::InitializeSchema { project_path, resp_tx } => {
            let res = (|| {
                let conn = get_connection_mut(connections, &project_path)?;
                super::database::initialize_db_schema(conn)?;
                Ok(())
            })();
            let _ = resp_tx.send(res);
        }
        DatabaseTask::ImportGitCommits { project_path, commits, resp_tx } => {
            let res = (|| {
                let conn = get_connection_mut(connections, &project_path)?;
                let journal = write_db_journal(&project_path, "import_git_commits", "bulk")?;
                
                let tx = conn.transaction().map_err(|e| e.to_string())?;
                
                for c in commits {
                    let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
                    tx.execute(
                        "INSERT OR IGNORE INTO commits (id, git_commit_hash, type, source, description, status, timestamp) VALUES (?1,?2,'snapshot',?3,?4,'approved',?5)",
                        params![commit_id, c.hash, c.source, c.description, c.timestamp]
                    ).map_err(|e| e.to_string())?;
                }
                
                tx.commit().map_err(|e| e.to_string())?;
                let _ = fs::remove_file(journal);
                Ok(())
            })();
            let _ = resp_tx.send(res);
        }
        DatabaseTask::InsertCheckpoint { project_path, commit_hash, name, operations, resp_tx } => {
            let res = (|| {
                let conn = get_connection_mut(connections, &project_path)?;
                let journal = write_db_journal(&project_path, "create_checkpoint", &commit_hash)?;
                
                let tx = conn.transaction().map_err(|e| e.to_string())?;
                
                let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
                tx.execute(
                    "INSERT INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'checkpoint','user',?3,'approved')",
                    params![commit_id, commit_hash, name]
                ).map_err(|e| e.to_string())?;

                for op in operations {
                    let op_id = format!("op-{}", uuid::Uuid::new_v4());
                    tx.execute(
                        "INSERT INTO operations (id, commit_id, file_path, operation_type, old_path) VALUES (?1,?2,?3,?4,?5)",
                        params![op_id, commit_id, op.file_path, op.operation_type, op.old_path]
                    ).map_err(|e| e.to_string())?;
                }

                let ref_name = format!("nexora/checkpoints/{}", name.replace(" ", "-"));
                tx.execute(
                    "INSERT OR REPLACE INTO refs (name, commit_hash) VALUES (?1, ?2)",
                    params![ref_name, commit_hash]
                ).map_err(|e| e.to_string())?;

                let cp_id = format!("cp-{}", uuid::Uuid::new_v4());
                tx.execute(
                    "INSERT INTO checkpoints (id, commit_id, name) VALUES (?1, ?2, ?3)",
                    params![cp_id, commit_hash, name]
                ).map_err(|e| e.to_string())?;

                tx.execute("UPDATE commits SET status = 'approved' WHERE status = 'pending'", []).map_err(|e| e.to_string())?;
                
                tx.commit().map_err(|e| e.to_string())?;
                let _ = fs::remove_file(journal);
                Ok(())
            })();
            let _ = resp_tx.send(res);
        }
        DatabaseTask::InsertSnapshot { project_path, commit_hash, source, description, session_id, operations, resp_tx } => {
            let res = (|| {
                let conn = get_connection_mut(connections, &project_path)?;
                let journal = write_db_journal(&project_path, "create_snapshot", &commit_hash)?;
                
                let tx = conn.transaction().map_err(|e| e.to_string())?;
                
                let commit_id = format!("commit-{}", uuid::Uuid::new_v4());
                tx.execute(
                    "INSERT INTO commits (id, session_id, git_commit_hash, type, source, description, status) VALUES (?1,?2,?3,'snapshot',?4,?5,'pending')",
                    params![commit_id, session_id, commit_hash, source, description]
                ).map_err(|e| e.to_string())?;

                for op in operations {
                    let op_id = format!("op-{}", uuid::Uuid::new_v4());
                    tx.execute(
                        "INSERT INTO operations (id, commit_id, file_path, operation_type, old_path) VALUES (?1,?2,?3,?4,?5)",
                        params![op_id, commit_id, op.file_path, op.operation_type, op.old_path]
                    ).map_err(|e| e.to_string())?;
                }

                tx.commit().map_err(|e| e.to_string())?;
                let _ = fs::remove_file(journal);
                Ok(())
            })();
            let _ = resp_tx.send(res);
        }
        DatabaseTask::UpdateReview { project_path, commit_hash, status, resp_tx } => {
            let res = (|| {
                let conn = get_connection_mut(connections, &project_path)?;
                let journal = write_db_journal(&project_path, "review_change", &commit_hash)?;
                
                let tx = conn.transaction().map_err(|e| e.to_string())?;
                
                tx.execute(
                    "UPDATE commits SET status = ?1 WHERE git_commit_hash = ?2",
                    params![status, commit_hash]
                ).map_err(|e| e.to_string())?;

                let review_id = format!("rev-{}", uuid::Uuid::new_v4());
                tx.execute(
                    "INSERT OR REPLACE INTO reviews (id, commit_hash, status, reviewed_by, review_time) VALUES (?1, ?2, ?3, 'user', CURRENT_TIMESTAMP)",
                    params![review_id, commit_hash, status]
                ).map_err(|e| e.to_string())?;

                tx.commit().map_err(|e| e.to_string())?;
                let _ = fs::remove_file(journal);
                Ok(())
            })();
            let _ = resp_tx.send(res);
        }
        DatabaseTask::GetTimeline { project_path, resp_tx } => {
            let res = (|| {
                let conn = get_connection_mut(connections, &project_path)?;
                super::database::initialize_db_schema(conn)?;
                
                let mut stmt = conn.prepare(
                    "SELECT c.id, c.session_id, c.git_commit_hash, c.type, c.source, c.description, c.timestamp, c.status,
                            s.source, s.description
                     FROM commits c
                     LEFT JOIN sessions s ON s.id = c.session_id
                     ORDER BY c.timestamp DESC"
                ).map_err(|e| e.to_string())?;

                let rows = stmt.query_map([], |row| {
                    Ok(TimelineEntry {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        git_commit_hash: row.get(2)?,
                        r#type: row.get(3)?,
                        source: row.get(4)?,
                        description: row.get(5)?,
                        timestamp: row.get(6)?,
                        status: row.get(7)?,
                        files: Vec::new(),
                        session_source: row.get(8)?,
                        session_desc: row.get(9)?,
                        project_path: project_path.to_string(),
                    })
                }).map_err(|e| e.to_string())?;

                let mut history = Vec::new();
                for entry_res in rows {
                    if let Ok(mut entry) = entry_res {
                        let mut file_stmt = conn.prepare(
                            "SELECT id, file_path, operation_type, old_path FROM operations WHERE commit_id = ?1"
                        ).map_err(|e| e.to_string())?;
                        
                        let file_rows = file_stmt.query_map(params![entry.id], |r| {
                            Ok(FileOperation {
                                id: r.get(0)?,
                                file_path: r.get(1)?,
                                operation_type: r.get(2)?,
                                old_path: r.get(3)?,
                            })
                        }).map_err(|e| e.to_string())?;

                        for f in file_rows {
                            if let Ok(file_op) = f {
                                entry.files.push(file_op);
                            }
                        }
                        history.push(entry);
                    }
                }
                Ok(history)
            })();
            let _ = resp_tx.send(res);
        }
        DatabaseTask::GetDbCommitsCount { project_path, resp_tx } => {
            let res = (|| {
                let conn = get_connection_mut(connections, &project_path)?;
                let count: i64 = conn.query_row("SELECT COUNT(*) FROM commits", [], |r| r.get(0)).unwrap_or(0);
                Ok(count)
            })();
            let _ = resp_tx.send(res);
        }
        DatabaseTask::PragmaMaintenance { project_path, resp_tx } => {
            let res = (|| {
                let conn = get_connection_mut(connections, &project_path)?;
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE);", []).map_err(|e| e.to_string())?;
                Ok(())
            })();
            let _ = resp_tx.send(res);
        }
    }
}
