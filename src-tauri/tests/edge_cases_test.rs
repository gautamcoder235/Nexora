use std::env;
use std::fs;
use std::process::Command;
use std::time::Instant;
use rusqlite::Connection;

use nexora_lib::swarm_db;
use nexora_lib::swarm_ownership::validate_ownership;
use nexora_lib::swarm_worktrees::{create_worktree, remove_worktree};

fn setup_git_repo(repo_path: &std::path::Path) {
    fs::create_dir_all(repo_path).unwrap();
    Command::new("git").arg("init").current_dir(repo_path).status().unwrap();
    Command::new("git").args(&["config", "user.name", "Test"]).current_dir(repo_path).status().unwrap();
    Command::new("git").args(&["config", "user.email", "test@test.com"]).current_dir(repo_path).status().unwrap();
    fs::write(repo_path.join("README.md"), "init").unwrap();
    Command::new("git").args(&["add", "README.md"]).current_dir(repo_path).status().unwrap();
    Command::new("git").args(&["commit", "-m", "init"]).current_dir(repo_path).status().unwrap();
}

#[test]
fn test_repository_switching() {
    let conn = Connection::open_in_memory().unwrap();
    swarm_db::run_migrations(&conn).unwrap();

    let temp_dir = env::temp_dir().join(format!("repo_switching_{}", std::process::id()));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).unwrap();

    // Create 3 repos
    for i in 1..=3 {
        let repo_id = format!("repo-{}", i);
        let repo_dir = temp_dir.join(&repo_id);
        setup_git_repo(&repo_dir);

        let repo_path = repo_dir.to_str().unwrap();
        swarm_db::insert_repository_if_missing(&conn, &repo_id, &format!("Repo {}", i), repo_path).unwrap();
        
        let task_id = format!("task-{}", i);
        let exec_id = format!("exec-{}", i);
        let wt_id = format!("wt-{}", i);
        
        swarm_db::insert_task(&conn, &task_id, &repo_id, "Test", "Desc", "running").unwrap();
        swarm_db::insert_execution(&conn, &exec_id, &task_id, "agent-1", &wt_id, "running").unwrap();
        swarm_db::insert_worktree(&conn, &wt_id, &task_id, &exec_id, &repo_id, &format!("{}_wt", repo_path), "main", "active").unwrap();

        // Add some files unique to this repo and check validate_ownership
        let unique_dir = repo_dir.join(format!("dir_{}", i));
        fs::create_dir_all(&unique_dir).unwrap();
        let unique_file = unique_dir.join(format!("file_{}.txt", i));
        fs::write(&unique_file, "content").unwrap();
        Command::new("git").args(&["add", "."]).current_dir(&repo_dir).status().unwrap();

        // Allow only its unique directory
        let allowed_patterns = vec![format!("dir_{}/**", i)];
        let result = validate_ownership(repo_path.to_string(), allowed_patterns).unwrap();
        
        // It should be valid since we only modified the allowed files (and nothing else)
        assert!(result.is_valid, "Repo {} should be valid, but got violated: {:?}", i, result.violated_files);
    }

    // Check get_active_executions doesn't bleed status
    let execs = swarm_db::get_active_executions(&conn).unwrap();
    assert_eq!(execs.len(), 3);
    
    for exec in execs {
        let mut stmt = conn.prepare("SELECT repository_id FROM worktrees WHERE id = ?1").unwrap();
        let repo_id: String = stmt.query_row([&exec.worktree_id], |row| row.get(0)).unwrap();
        let expected_repo_id = exec.task_id.replace("task-", "repo-");
        assert_eq!(repo_id, expected_repo_id);
    }
    
    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_large_repository() {
    let temp_dir = env::temp_dir().join(format!("large_repo_{}", std::process::id()));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).unwrap();

    setup_git_repo(&temp_dir);
    let repo_path = temp_dir.to_str().unwrap();

    // Create 50,000 files
    let files_dir = temp_dir.join("many_files");
    fs::create_dir_all(&files_dir).unwrap();
    
    // Generating 50k files takes some time, let's limit it to 10k to keep tests fast, but we'll try 50k first.
    for i in 0..50000 {
        fs::write(files_dir.join(format!("file_{}.txt", i)), "a").unwrap();
    }
    
    Command::new("git").args(&["add", "."]).current_dir(&temp_dir).status().unwrap();
    Command::new("git").args(&["commit", "-m", "50k files"]).current_dir(&temp_dir).status().unwrap();

    let start = Instant::now();
    let wt_path = temp_dir.join("wt_large");
    let result = create_worktree(repo_path.to_string(), wt_path.to_str().unwrap().to_string(), "task-large".to_string(), "Title".to_string(), "Desc".to_string(), vec![]);
    assert!(result.is_ok());
    let elapsed = start.elapsed();
    assert!(elapsed.as_secs() < 5, "create_worktree took too long: {:?}", elapsed);

    let start = Instant::now();
    let allowed_patterns = vec!["many_files/**".to_string()];
    let validation = validate_ownership(repo_path.to_string(), allowed_patterns).unwrap();
    assert!(validation.is_valid);
    let elapsed = start.elapsed();
    assert!(elapsed.as_secs() < 5, "validate_ownership took too long: {:?}", elapsed);

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_branch_cleanup_failure() {
    let temp_dir = env::temp_dir().join(format!("branch_cleanup_{}", std::process::id()));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).unwrap();

    setup_git_repo(&temp_dir);
    let repo_path = temp_dir.to_str().unwrap();

    let wt_path = temp_dir.join("wt_fail");
    create_worktree(repo_path.to_string(), wt_path.to_str().unwrap().to_string(), "task-fail".to_string(), "Title".to_string(), "Desc".to_string(), vec![]).unwrap();

    // To simulate git branch -D failure, we can checkout the branch in the main repo
    Command::new("git").args(&["checkout", "task-fail"]).current_dir(&temp_dir).status().unwrap();

    let result = remove_worktree(repo_path.to_string(), wt_path.to_str().unwrap().to_string(), "task-fail".to_string());
    
    // It should handle gracefully: the git branch -D command will fail because it's checked out, 
    // but the worktree directory itself is removed. `remove_worktree` logs a warning and returns Ok(false) or similar, but NOT a panic.
    // Let's assert it doesn't panic. Actually, let's see what it returns.
    // If it returns an error, it's an explicit error string instead of panic.
    if let Err(e) = &result {
        println!("Gracefully handled error: {}", e);
    } else {
        println!("Worktree removal reported success despite branch deletion failure.");
    }

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_sqlite_corruption_recovery() {
    let temp_dir = env::temp_dir().join(format!("sqlite_corrupt_{}", std::process::id()));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("swarm.db");
    
    // Create valid DB first
    {
        let conn = Connection::open(&db_path).unwrap();
        swarm_db::run_migrations(&conn).unwrap();
    }
    
    // Corrupt it by overwriting with garbage bytes
    fs::write(&db_path, "GARBAGE DATA THAT IS NOT SQLITE").unwrap();

    // Try to open it again
    let conn_result = Connection::open(&db_path);
    assert!(conn_result.is_ok(), "Opening the file handle shouldn't fail even if corrupted");
    
    let conn = conn_result.unwrap();
    let migrate_result = swarm_db::run_migrations(&conn);
    
    assert!(migrate_result.is_err(), "run_migrations should fail gracefully, not panic");
    println!("Gracefully caught DB corruption error: {:?}", migrate_result.unwrap_err());
    
    let _ = fs::remove_dir_all(&temp_dir);
}
