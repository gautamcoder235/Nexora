use multi_vibe_lib::swarm_db::{self, DbState};
use multi_vibe_lib::swarm_lifecycle::{self, LifecycleStartResult};
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use std::thread;

// Test 9: State Machine Integrity
#[test]
fn test_state_machine_integrity() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;"
    ).unwrap();

    // Init schema
    let migrations = [
        "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, deleted_at DATETIME);",
        "CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT, worktree_id TEXT, start_time DATETIME DEFAULT CURRENT_TIMESTAMP, end_time DATETIME, status TEXT NOT NULL, deleted_at DATETIME);",
        "CREATE TABLE IF NOT EXISTS agent_processes (id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, pid INTEGER, command TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME, exit_code INTEGER, status TEXT NOT NULL);"
    ];
    for m in migrations { conn.execute_batch(m).unwrap(); }

    swarm_db::insert_task(&conn, "t1", "r1", "Title", "Desc", "running").unwrap();
    swarm_db::insert_execution(&conn, "e1", "t1", "a1", "w1", "created").unwrap();

    // Valid: created -> queued
    assert!(swarm_db::update_execution_status(&conn, "e1", "queued").is_ok());

    // Invalid: queued -> context_injected
    assert!(swarm_db::update_execution_status(&conn, "e1", "context_injected").is_err());

    // Valid: queued -> starting
    assert!(swarm_db::update_execution_status(&conn, "e1", "starting").is_ok());

    // Valid: starting -> worktree_created
    assert!(swarm_db::update_execution_status(&conn, "e1", "worktree_created").is_ok());

    // Invalid: worktree_created -> completed
    assert!(swarm_db::update_execution_status(&conn, "e1", "completed").is_err());

    // Valid: worktree_created -> context_injected -> running
    assert!(swarm_db::update_execution_status(&conn, "e1", "context_injected").is_ok());
    assert!(swarm_db::update_execution_status(&conn, "e1", "running").is_ok());

    // Valid: Mid-flight failure
    assert!(swarm_db::update_execution_status(&conn, "e1", "failed").is_ok());

    // Invalid: failed -> completed (Unrecoverable transition)
    assert!(swarm_db::update_execution_status(&conn, "e1", "completed").is_err());
}

// Test 5: Database Contention
#[test]
fn test_database_contention() {
    let db_path = std::env::temp_dir().join(format!("contention_{}.db", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    let conn = Connection::open(&db_path).unwrap();
    conn.busy_timeout(std::time::Duration::from_millis(15000)).unwrap();
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;"
    ).unwrap();

    let migrations = [
        "CREATE TABLE IF NOT EXISTS execution_logs (id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, level TEXT NOT NULL, message TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT, worktree_id TEXT, start_time DATETIME DEFAULT CURRENT_TIMESTAMP, end_time DATETIME, status TEXT NOT NULL, deleted_at DATETIME);"
    ];
    for m in migrations { conn.execute_batch(m).unwrap(); }

    let conn_arc = Arc::new(Mutex::new(conn));
    let mut handles = vec![];

    let start = Instant::now();
    for i in 0..20 {
        let path_clone = db_path.clone();
        handles.push(thread::spawn(move || {
            let local_conn = Connection::open(&path_clone).unwrap();
            local_conn.busy_timeout(std::time::Duration::from_millis(15000)).unwrap();
            
            for j in 0..500 {
                let log_id = format!("log_{}_{}", i, j);
                let exec_id = format!("exec_{}_{}", i, j);
                
                // Write Log
                local_conn.execute(
                    "INSERT INTO execution_logs (id, execution_id, level, message) VALUES (?1, ?2, 'info', 'test')",
                    rusqlite::params![log_id, "exec1"],
                ).unwrap();

                // Write Status
                local_conn.execute(
                    "INSERT INTO executions (id, task_id, status) VALUES (?1, 'task1', 'running')",
                    rusqlite::params![exec_id],
                ).unwrap();
            }
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let elapsed = start.elapsed();
    let final_conn = conn_arc.lock().unwrap();
    let count: i64 = final_conn.query_row("SELECT COUNT(*) FROM execution_logs", [], |r| r.get(0)).unwrap();
    
    assert_eq!(count, 10000, "Lost writes detected during contention!");
    println!("Contention Test Passed: 10,000 writes across 20 threads in {:?}", elapsed);
}

// Test 10: Log Flood
#[test]
fn test_log_flood() {
    let db_path = std::env::temp_dir().join(format!("log_flood_{}.db", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    let conn = Connection::open(&db_path).unwrap();
    conn.busy_timeout(std::time::Duration::from_millis(15000)).unwrap();
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;"
    ).unwrap();

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS execution_logs (id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, level TEXT NOT NULL, message TEXT NOT NULL);"
    ).unwrap();

    let mut handles = vec![];
    let start = Instant::now();

    for i in 0..20 {
        let path_clone = db_path.clone();
        handles.push(thread::spawn(move || {
            let local_conn = Connection::open(&path_clone).unwrap();
            local_conn.busy_timeout(std::time::Duration::from_millis(15000)).unwrap();
            
            local_conn.execute_batch("PRAGMA busy_timeout = 15000;").unwrap();
            
            // 20 agents each producing 10,000 lines
            // Batch inserts using a transaction for performance & lock mitigation
            let tx = local_conn.unchecked_transaction().unwrap();
            for j in 0..10000 {
                let log_id = format!("flood_{}_{}", i, j);
                tx.execute(
                    "INSERT INTO execution_logs (id, execution_id, level, message) VALUES (?1, ?2, 'info', 'Long verbose output line from agent execution simulating high traffic load.')",
                    rusqlite::params![log_id, "exec1"],
                ).unwrap();
            }
            tx.commit().unwrap();
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let elapsed = start.elapsed();
    let final_conn = Connection::open(&db_path).unwrap();
    let count: i64 = final_conn.query_row("SELECT COUNT(*) FROM execution_logs", [], |r| r.get(0)).unwrap();
    
    assert_eq!(count, 200000, "Log Flood lost writes!");
    assert!(elapsed.as_secs() < 30, "Log Flood took too long (SQLite bottlenecked)");
    println!("Log Flood Passed: 200,000 logs across 20 threads in {:?}", elapsed);
}

// Test 4: 10,000 File Modification Ownership Check
#[test]
fn test_ownership_scale() {
    let repo_dir = std::env::temp_dir().join(format!("repo_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    std::fs::create_dir_all(&repo_dir).unwrap();
    
    // Setup git repo
    std::process::Command::new("git").current_dir(&repo_dir).arg("init").output().unwrap();
    
    let target_dir = repo_dir.join("src").join("components").join("settings");
    std::fs::create_dir_all(&target_dir).unwrap();
    
    // Create 10,000 files
    let setup_start = Instant::now();
    for i in 0..10000 {
        std::fs::write(target_dir.join(format!("SettingsPanel{}.tsx", i)), "content").unwrap();
    }
    println!("Created 10,000 files in {:?}", setup_start.elapsed());
    
    std::process::Command::new("git").current_dir(&repo_dir).arg("add").arg(".").output().unwrap();
    std::process::Command::new("git").current_dir(&repo_dir).args(["commit", "-m", "init", "--author=Test <test@example.com>"]).output().unwrap();
    
    // Modify them
    let mod_start = Instant::now();
    for i in 0..10000 {
        std::fs::write(target_dir.join(format!("SettingsPanel{}.tsx", i)), "modified content").unwrap();
    }
    println!("Modified 10,000 files in {:?}", mod_start.elapsed());
    
    let allowed_patterns = vec![
        "src/components/settings/**".to_string(),
    ];
    
    let validate_start = Instant::now();
    let result = multi_vibe_lib::swarm_ownership::validate_ownership(
        repo_dir.to_string_lossy().to_string(), 
        allowed_patterns.clone()
    ).unwrap();
    let validate_elapsed = validate_start.elapsed();
    
    assert!(result.is_valid, "Ownership validation failed on 10,000 valid files");
    assert_eq!(result.modified_files.len(), 10000);
    assert!(validate_elapsed.as_secs() < 5, "Ownership validation took too long");
    
    // Test Worst-case (9,999 valid, 1 invalid at the root)
    std::fs::write(repo_dir.join("App.tsx"), "invalid mod").unwrap();
    let worst_case_start = Instant::now();
    let worst_case_result = multi_vibe_lib::swarm_ownership::validate_ownership(
        repo_dir.to_string_lossy().to_string(), 
        allowed_patterns
    ).unwrap();
    let worst_case_elapsed = worst_case_start.elapsed();
    
    assert!(!worst_case_result.is_valid, "Ownership validation failed to catch 1 invalid file");
    assert_eq!(worst_case_result.violated_files.len(), 1);
    assert_eq!(worst_case_result.violated_files[0], "App.tsx");
    assert!(worst_case_elapsed.as_secs() < 5, "Worst-case ownership validation took too long");
    
    println!("Ownership Scale Passed: validated 10,000 valid files in {:?}, validated worst-case in {:?}", validate_elapsed, worst_case_elapsed);
}
