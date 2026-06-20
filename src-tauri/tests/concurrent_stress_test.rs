use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;

use nexora_lib::swarm_db::{
    insert_execution, insert_repository_if_missing, insert_task, run_migrations,
};
use nexora_lib::swarm_worktrees::create_worktree;
use rusqlite::Connection;

#[test]
fn test_concurrent_stress() {
    // 1. Create a base temporary directory for this test.
    let temp_dir = env::temp_dir().join(format!("stress_test_{}", std::process::id()));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");

    // 2. Initialize a git repository and add an initial commit.
    let status = Command::new("git")
        .arg("init")
        .current_dir(&temp_dir)
        .status()
        .expect("Failed to run git init");
    assert!(status.success());

    Command::new("git")
        .args(&["config", "user.name", "Stress Tester"])
        .current_dir(&temp_dir)
        .status()
        .unwrap();

    Command::new("git")
        .args(&["config", "user.email", "stress@example.com"])
        .current_dir(&temp_dir)
        .status()
        .unwrap();

    let dummy_file = temp_dir.join("dummy.txt");
    fs::write(&dummy_file, "initial commit content").unwrap();

    Command::new("git")
        .args(&["add", "dummy.txt"])
        .current_dir(&temp_dir)
        .status()
        .unwrap();

    Command::new("git")
        .args(&["commit", "-m", "initial commit"])
        .current_dir(&temp_dir)
        .status()
        .unwrap();

    // 3. Set up the DB. We'll use a file-based DB so threads can open it independently,
    // which tests SQLite's WAL mode and busy timeout concurrency.
    let db_path = temp_dir.join("swarm.db");

    // Initialize DB schema
    {
        let conn = Connection::open(&db_path).expect("Failed to open main DB");
        run_migrations(&conn).expect("Failed to run migrations");
        // Insert a repository record
        insert_repository_if_missing(
            &conn,
            "repo_1",
            "Stress Test Repo",
            temp_dir.to_str().unwrap(),
        )
        .expect("Failed to insert repository");
    }

    // 4. Spawn 50 concurrent threads
    const NUM_THREADS: usize = 50;
    let mut handles = vec![];

    // Shared paths
    let project_root = temp_dir.to_str().unwrap().to_string();
    let db_path_str = db_path.to_str().unwrap().to_string();

    for i in 0..NUM_THREADS {
        let root = project_root.clone();
        let db_p = db_path_str.clone();
        let run_id = std::process::id();

        let handle = thread::spawn(move || {
            let task_id = format!("task_{}_{}", run_id, i);
            let exec_id = format!("exec_{}_{}", run_id, i);
            let worktree_id = format!("wt_{}_{}", run_id, i);

            // Create Worktree
            let result = create_worktree(
                root,
                task_id.clone(),
                exec_id.clone(),
                "Title".to_string(),
                "Desc".to_string(),
                vec![],
            );
            assert!(
                result.is_ok(),
                "Worktree creation failed for thread {}: {:?}",
                i,
                result.err()
            );
            let wt_result = result.unwrap();
            assert!(
                wt_result.success,
                "Worktree success flag false for thread {}: {:?}",
                i, wt_result.error
            );

            // Connect to DB and Insert records
            let conn = Connection::open(&db_p).expect("Failed to open thread DB connection");

            // We need to set busy_timeout on the individual connection just in case
            // run_migrations sets it per-connection. Actually, busy_timeout is per-connection.
            conn.execute_batch("PRAGMA busy_timeout = 5000;").unwrap();

            insert_task(
                &conn,
                &task_id,
                "repo_1",
                &format!("Task {}", i),
                "Stress test task",
                "pending",
            )
            .expect("Failed to insert task");

            insert_execution(
                &conn,
                &exec_id,
                &task_id,
                "agent_X",
                &worktree_id,
                "running",
            )
            .expect("Failed to insert execution");
        });
        handles.push(handle);
    }

    // 5. Join all threads
    for handle in handles {
        handle.join().expect("Thread panicked");
    }

    // 6. Assert 50 worktrees created and 50 executions in DB
    let conn = Connection::open(&db_path).expect("Failed to open DB for assertions");

    let task_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        task_count, NUM_THREADS as i32,
        "Expected {} tasks",
        NUM_THREADS
    );

    let exec_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM executions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        exec_count, NUM_THREADS as i32,
        "Expected {} executions",
        NUM_THREADS
    );

    // Assert worktrees on disk
    let parent_worktrees_dir = temp_dir.parent().unwrap().join(".nexora-worktrees");
    let mut actual_wt_count = 0;
    let run_id = std::process::id();
    let prefix = format!("task-task_{}_", run_id);

    if parent_worktrees_dir.exists() {
        for entry in fs::read_dir(&parent_worktrees_dir).unwrap() {
            let entry = entry.unwrap();
            if entry.path().is_dir() {
                let name = entry.file_name().into_string().unwrap();
                println!("Found dir: {}", name);
                if name.starts_with(&prefix) {
                    actual_wt_count += 1;
                }
            }
        }
    }
    assert_eq!(
        actual_wt_count, NUM_THREADS,
        "Expected {} worktree directories",
        NUM_THREADS
    );

    // Cleanup
    let _ = fs::remove_dir_all(&temp_dir);
    if parent_worktrees_dir.exists() {
        // delete only the directories we created
        for entry in fs::read_dir(&parent_worktrees_dir).unwrap() {
            let entry = entry.unwrap();
            if entry.path().is_dir() {
                let name = entry.file_name().into_string().unwrap();
                if name.starts_with(&prefix) {
                    let _ = fs::remove_dir_all(entry.path());
                }
            }
        }
    }
}
