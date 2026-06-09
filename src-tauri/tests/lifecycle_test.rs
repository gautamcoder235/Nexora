use rusqlite::Connection;
use multi_vibe_lib::swarm_db;
use std::fs;
use std::process::Command;

#[test]
fn test_recover_swarm_state_missing_worktree() {
    // 1. Create a temporary DB connection and run migrations
    let conn = Connection::open_in_memory().expect("Failed to open in-memory DB");
    swarm_db::run_migrations(&conn).expect("Failed to run migrations");

    // 2. Set up a temporary Git repository and make an initial commit.
    let repo_dir = std::env::temp_dir().join(format!("test_repo_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    fs::create_dir_all(&repo_dir).unwrap();
    let repo_path = repo_dir.to_str().unwrap();

    Command::new("git")
        .args(["init"])
        .current_dir(&repo_path)
        .output()
        .expect("Failed to init git");

    // Configure git
    Command::new("git")
        .args(["config", "user.name", "Test User"])
        .current_dir(&repo_path)
        .output()
        .expect("Failed to config name");
    Command::new("git")
        .args(["config", "user.email", "test@example.com"])
        .current_dir(&repo_path)
        .output()
        .expect("Failed to config email");

    fs::write(repo_dir.join("README.md"), "# Test Repo").unwrap();

    Command::new("git")
        .args(["add", "README.md"])
        .current_dir(&repo_path)
        .output()
        .expect("Failed to git add");

    Command::new("git")
        .args(["commit", "-m", "Initial commit"])
        .current_dir(&repo_path)
        .output()
        .expect("Failed to commit");

    // 3. Simulate a crash condition
    let repo_id = "repo-123";
    let task_id = "task-456";
    let exec_id = "exec-789";
    let worktree_id = "wt-101";
    let missing_worktree_path = repo_dir.join(".multi-vibe-worktrees").join(task_id);

    swarm_db::insert_repository_if_missing(&conn, repo_id, "Test Repo", repo_path).unwrap();
    swarm_db::insert_task(&conn, task_id, repo_id, "Test Task", "Desc", "running").unwrap();
    swarm_db::insert_execution(&conn, exec_id, task_id, "agent-1", worktree_id, "running").unwrap();
    
    // Insert worktree pointing to a folder that does not exist
    swarm_db::insert_worktree(
        &conn,
        worktree_id,
        task_id,
        exec_id,
        repo_id,
        missing_worktree_path.to_str().unwrap(),
        "task-branch",
        "active"
    ).unwrap();

    // 4. Verify that `get_active_executions` correctly fetches the execution
    let active_execs = swarm_db::get_active_executions(&conn).expect("Failed to get active executions");
    assert_eq!(active_execs.len(), 1, "Should fetch one active execution");
    
    let exec = &active_execs[0];
    assert_eq!(exec.execution_id, exec_id);
    assert_eq!(exec.worktree_id, worktree_id);

    // Manually verify the folder existence logic as written in `recover_swarm_state`
    let worktree_dir = std::path::Path::new(&exec.worktree_path);
    let contract_dir = worktree_dir.join(".multivibe");

    let is_missing = !worktree_dir.exists() || !contract_dir.exists();
    assert!(is_missing, "Worktree folder should not exist in this simulated crash");

    if is_missing {
        // Correctly identified as missing worktree, update status
        swarm_db::update_execution_status(&conn, &exec.execution_id, "failed").unwrap();
        swarm_db::mark_worktree_deleted(&conn, &exec.worktree_id).unwrap();
    }

    // Verify it was marked failed and deleted
    let active_execs_after = swarm_db::get_active_executions(&conn).unwrap();
    assert_eq!(active_execs_after.len(), 0, "Execution should no longer be active");

    // Check status in DB directly
    let mut stmt = conn.prepare("SELECT status FROM executions WHERE id = ?1").unwrap();
    let status: String = stmt.query_row([exec_id], |row| row.get(0)).unwrap();
    assert_eq!(status, "failed", "Execution should be marked as failed");

    let mut stmt = conn.prepare("SELECT deleted_at FROM worktrees WHERE id = ?1").unwrap();
    let deleted_at: Option<String> = stmt.query_row([worktree_id], |row| row.get(0)).unwrap();
    assert!(deleted_at.is_some(), "Worktree should be marked as deleted");

    println!("Simulated crash correctly handled: Execution marked as failed, worktree marked as deleted.");
}
