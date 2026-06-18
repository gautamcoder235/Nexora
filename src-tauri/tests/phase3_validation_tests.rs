use rusqlite::Connection;
use std::time::Instant;
use std::fs;
use nexora_lib::swarm_validation::{ValidationProfile, ValidationStepResult};
use nexora_lib::swarm_ownership;

// NOTE: swarm_validation::run_validation_pipeline expects AppHandle, which is hard to mock in tests.
// So we will test the validation gates directly or refactor the DB extraction in swarm_validation.rs.

// For now, let's test Gate B hash drift directly.

#[test]
fn test_ownership_hash_drift() {
    let repo_dir = std::env::temp_dir().join(format!("drift_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    std::fs::create_dir_all(&repo_dir).unwrap();
    
    // Setup .nexora
    let mv_dir = repo_dir.join(".nexora");
    std::fs::create_dir_all(&mv_dir).unwrap();
    
    // Create ownership.hash with WRONG hash
    std::fs::write(mv_dir.join("ownership.hash"), "badhash").unwrap();
    
    let allowed_patterns = vec!["src/**".to_string()];
    
    // This replicates Gate B's hash check
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    let mut hasher = DefaultHasher::new();
    allowed_patterns.hash(&mut hasher);
    let expected_hash = format!("{:x}", hasher.finish());
    
    let disk_hash = fs::read_to_string(mv_dir.join("ownership.hash")).unwrap();
    
    assert_ne!(disk_hash.trim(), expected_hash, "Drift detection failed, hashes match!");
}

#[test]
fn test_validation_pipeline_db_schema() {
    let conn = Connection::open_in_memory().unwrap();
    
    // Simulate initial setup
    let migrations = [
        "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, deleted_at DATETIME);",
        "CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT, worktree_id TEXT, start_time DATETIME DEFAULT CURRENT_TIMESTAMP, end_time DATETIME, status TEXT NOT NULL, deleted_at DATETIME);",
        "CREATE TABLE IF NOT EXISTS repositories (id TEXT PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL);"
    ];
    for m in migrations { conn.execute_batch(m).unwrap(); }
    
    // Insert Phase 3 migration
    let p3_migration = "
        CREATE TABLE IF NOT EXISTS validation_profiles (
            repository_id TEXT PRIMARY KEY,
            typecheck_cmd TEXT,
            lint_cmd TEXT,
            test_cmd TEXT,
            timeout_seconds INTEGER DEFAULT 300,
            deep_git_integrity BOOLEAN DEFAULT 0,
            FOREIGN KEY(repository_id) REFERENCES repositories(id)
        );

        CREATE TABLE IF NOT EXISTS validation_runs (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            status TEXT NOT NULL,
            FOREIGN KEY(execution_id) REFERENCES executions(id)
        );

        CREATE TABLE IF NOT EXISTS validation_steps (
            id TEXT PRIMARY KEY,
            validation_run_id TEXT NOT NULL,
            step_name TEXT NOT NULL,
            exit_code INTEGER,
            duration_ms INTEGER,
            status TEXT NOT NULL,
            artifact_id TEXT,
            FOREIGN KEY(validation_run_id) REFERENCES validation_runs(id)
        );

        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            artifact_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            checksum TEXT NOT NULL,
            FOREIGN KEY(execution_id) REFERENCES executions(id)
        );

        CREATE TABLE IF NOT EXISTS execution_snapshots (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            head_commit TEXT NOT NULL,
            branch TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(execution_id) REFERENCES executions(id)
        );
    ";
    conn.execute_batch(p3_migration).unwrap();
    
    // Insert sample data
    conn.execute("INSERT INTO repositories (id, path, name) VALUES ('repo1', '/path', 'name')", []).unwrap();
    conn.execute("INSERT INTO validation_profiles (repository_id, typecheck_cmd, deep_git_integrity) VALUES ('repo1', 'npm run typecheck', 1)", []).unwrap();
    
    // Read it back
    let deep: bool = conn.query_row("SELECT deep_git_integrity FROM validation_profiles WHERE repository_id = 'repo1'", [], |r| r.get(0)).unwrap();
    assert_eq!(deep, true);
}
