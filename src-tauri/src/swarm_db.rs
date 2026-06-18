use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// Global DB Connection
pub struct DbState(pub Mutex<Option<Connection>>);

pub fn init_db(app_handle: &AppHandle) -> Result<(), String> {
    // Get the path to app data directory
    let mut db_path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    
    // Ensure directory exists
    if !db_path.exists() {
        std::fs::create_dir_all(&db_path).map_err(|e| e.to_string())?;
    }
    
    db_path.push("swarm.db");
    
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    
    // Enable WAL mode and busy timeout for concurrent access
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;"
    ).map_err(|e| format!("Pragma failed: {}", e))?;

    run_migrations(&conn).map_err(|e| format!("Migration failed: {}", e))?;
    seed_default_agents(&conn).map_err(|e| format!("Seeding failed: {}", e))?;
    
    app_handle.manage(DbState(Mutex::new(Some(conn))));
    Ok(())
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Enable WAL mode and busy timeout for concurrent access
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;"
    )?;

    // Create schema version table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    )?;

    // Check current version
    let mut current_version = 0;
    let _ = conn.query_row(
        "SELECT MAX(version) FROM schema_version",
        [],
        |row| {
            current_version = row.get(0).unwrap_or(0);
            Ok(())
        },
    );

    let migrations = vec![
        // Version 1: Initial core tables
        "
        CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL,
            git_branch TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            repository_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            deleted_at DATETIME,
            FOREIGN KEY(repository_id) REFERENCES repositories(id)
        );

        CREATE TABLE IF NOT EXISTS task_dependencies (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            depends_on_task_id TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id),
            FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS executions (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            agent_id TEXT,
            worktree_id TEXT,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            status TEXT NOT NULL,
            deleted_at DATETIME,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS worktrees (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            execution_id TEXT,
            repository_id TEXT NOT NULL,
            path TEXT NOT NULL,
            branch_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL,
            deleted_at DATETIME,
            FOREIGN KEY(task_id) REFERENCES tasks(id),
            FOREIGN KEY(execution_id) REFERENCES executions(id),
            FOREIGN KEY(repository_id) REFERENCES repositories(id)
        );

        CREATE TABLE IF NOT EXISTS ownership_rules (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            pattern TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS execution_logs (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            FOREIGN KEY(execution_id) REFERENCES executions(id)
        );
        ",
        // Version 2: Agent Registry
        "
        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            version TEXT,
            enabled BOOLEAN NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS agent_capabilities (
            agent_id TEXT NOT NULL,
            capability TEXT NOT NULL,
            FOREIGN KEY(agent_id) REFERENCES agents(id),
            PRIMARY KEY (agent_id, capability)
        );
        );
        ",
        // Version 3: Agent Processes tracking & State Machine
        "
        CREATE TABLE IF NOT EXISTS agent_processes (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            pid INTEGER,
            command TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            exit_code INTEGER,
            status TEXT NOT NULL,
            FOREIGN KEY(execution_id) REFERENCES executions(id)
        );
        ",
        // Version 4: Phase 3 Validation Pipeline
        "
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
        ",
        // Version 5: Phase 4.6 Merge Candidates
        "
        CREATE TABLE IF NOT EXISTS merge_candidates (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            patch_artifact_id TEXT NOT NULL,
            status TEXT NOT NULL,
            reviewed_at DATETIME,
            reviewed_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(execution_id) REFERENCES executions(id),
            FOREIGN KEY(patch_artifact_id) REFERENCES artifacts(id)
        );
        ",
        // Version 6: Phase 5 — Execution Drafts + Timeline Events
        "
        CREATE TABLE IF NOT EXISTS execution_drafts (
            id TEXT PRIMARY KEY,
            repo_name TEXT NOT NULL,
            repo_path TEXT NOT NULL,
            task_title TEXT NOT NULL,
            task_description TEXT,
            agent_id TEXT NOT NULL,
            allowed_patterns TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS execution_events (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            detail TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(execution_id) REFERENCES executions(id)
        );
        ",
        // Version 7: Phase 5.5 — Indexing for query performance
        "
        CREATE INDEX IF NOT EXISTS idx_validation_runs_execution ON validation_runs(execution_id);
        CREATE INDEX IF NOT EXISTS idx_validation_steps_run ON validation_steps(validation_run_id);
        "
    ];

    for (i, migration) in migrations.iter().enumerate() {
        let version = (i + 1) as i32;
        if current_version < version {
            conn.execute_batch(migration)?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [version],
            )?;
        }
    }

    Ok(())
}

// Data Access Layer (CRUD)
pub fn insert_task(conn: &Connection, id: &str, repo_id: &str, title: &str, description: &str, status: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO tasks (id, repository_id, title, description, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        [id, repo_id, title, description, status],
    )?;
    Ok(())
}

pub fn insert_execution(conn: &Connection, id: &str, task_id: &str, agent_id: &str, worktree_id: &str, status: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO executions (id, task_id, agent_id, worktree_id, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        [id, task_id, agent_id, worktree_id, status],
    )?;
    Ok(())
}


pub fn insert_worktree(conn: &Connection, id: &str, task_id: &str, exec_id: &str, repo_id: &str, path: &str, branch: &str, status: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO worktrees (id, task_id, execution_id, repository_id, path, branch_name, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        [id, task_id, exec_id, repo_id, path, branch, status],
    )?;
    Ok(())
}

pub fn insert_ownership_rule(conn: &Connection, id: &str, task_id: &str, pattern: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO ownership_rules (id, task_id, pattern) VALUES (?1, ?2, ?3)",
        [id, task_id, pattern],
    )?;
    Ok(())
}

pub fn mark_worktree_deleted(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE worktrees SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

pub fn insert_agent_process(conn: &Connection, id: &str, execution_id: &str, pid: Option<u32>, command: &str, status: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO agent_processes (id, execution_id, pid, command, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, execution_id, pid, command, status],
    )?;
    Ok(())
}

pub fn update_agent_process_status(conn: &Connection, id: &str, status: &str, exit_code: Option<i32>) -> Result<()> {
    if let Some(code) = exit_code {
        conn.execute(
            "UPDATE agent_processes SET status = ?1, exit_code = ?2, ended_at = CURRENT_TIMESTAMP WHERE id = ?3",
            rusqlite::params![status, code, id],
        )?;
    } else {
        conn.execute(
            "UPDATE agent_processes SET status = ?1 WHERE id = ?2",
            rusqlite::params![status, id],
        )?;
    }
    Ok(())
}

pub fn update_execution_status(conn: &Connection, execution_id: &str, new_status: &str) -> Result<()> {
    // 1. Enforce State Machine Integrity
    let current_status: String = conn.query_row(
        "SELECT status FROM executions WHERE id = ?1",
        [execution_id],
        |row| row.get(0),
    )?;

    // Define valid transitions
    let is_valid = match (current_status.as_str(), new_status) {
        // Idempotent updates are always valid
        (s, n) if s == n => true,
        // created -> queued -> starting -> worktree_created -> context_injected -> running -> validating -> completed | failed | terminated
        ("created", "queued") => true,
        ("queued", "starting") => true,
        ("starting", "worktree_created") => true,
        ("worktree_created", "context_injected") => true,
        ("context_injected", "running") => true,
        ("running", "validating") => true,
        ("running", "failed") => true, // Mid-flight crash
        ("running", "terminated") => true, // Killed by user
        ("validating", "completed") => true,
        ("validating", "failed") => true,
        // Any state can go to failed or terminated, but terminal states cannot be changed
        (s, "failed") | (s, "terminated") if s != "completed" && s != "failed" && s != "terminated" => true,
        _ => false,
    };

    if !is_valid {
        return Err(rusqlite::Error::InvalidParameterName(
            format!("Invalid state transition from {} to {}", current_status, new_status)
        ));
    }

    conn.execute(
        "UPDATE executions SET status = ?1 WHERE id = ?2",
        [new_status, execution_id],
    )?;
    Ok(())
}

pub fn insert_repository_if_missing(conn: &Connection, id: &str, name: &str, path: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO repositories (id, name, root_path) VALUES (?1, ?2, ?3)",
        [id, name, path],
    )?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ActiveExecution {
    pub execution_id: String,
    pub task_id: String,
    pub worktree_id: String,
    pub worktree_path: String,
    pub branch_name: String,
}

pub fn get_active_executions(conn: &Connection) -> Result<Vec<ActiveExecution>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.task_id, e.worktree_id, w.path, w.branch_name 
         FROM executions e 
         JOIN worktrees w ON e.worktree_id = w.id 
         WHERE e.status = 'running' AND e.deleted_at IS NULL AND w.deleted_at IS NULL"
    )?;
    
    let execs = stmt.query_map([], |row| {
        Ok(ActiveExecution {
            execution_id: row.get(0)?,
            task_id: row.get(1)?,
            worktree_id: row.get(2)?,
            worktree_path: row.get(3)?,
            branch_name: row.get(4)?,
        })
    })?;

    let mut result = Vec::new();
    for exec in execs {
        result.push(exec?);
    }
    
    Ok(result)
}

fn seed_default_agents(conn: &Connection) -> Result<()> {
    // Check if we already have agents
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM agents", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let default_agents = vec![
        ("claude", "Claude Code", "claude", vec!["react", "rust", "architecture", "typescript"]),
        ("aider", "Aider", "aider", vec!["python", "refactoring", "git"]),
        ("opencode", "OpenCode", "opencode", vec!["general", "bash", "terminal"]),
    ];

    for (id, name, cmd, caps) in default_agents {
        conn.execute(
            "INSERT INTO agents (id, name, command, enabled) VALUES (?1, ?2, ?3, 1)",
            [id, name, cmd],
        )?;
        
        for cap in caps {
            conn.execute(
                "INSERT INTO agent_capabilities (agent_id, capability) VALUES (?1, ?2)",
                [id, cap],
            )?;
        }
    }

    Ok(())
}

// -- Execution Events (Timeline) ----------------------------------------------

pub fn insert_execution_event(conn: &Connection, id: &str, execution_id: &str, event_type: &str, detail: Option<&str>) -> Result<()> {
    conn.execute(
        "INSERT INTO execution_events (id, execution_id, event_type, detail) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, execution_id, event_type, detail],
    )?;
    Ok(())
}

// -- Execution Drafts ---------------------------------------------------------

pub fn insert_execution_draft(conn: &Connection, id: &str, repo_name: &str, repo_path: &str, task_title: &str, task_description: &str, agent_id: &str, allowed_patterns_json: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO execution_drafts (id, repo_name, repo_path, task_title, task_description, agent_id, allowed_patterns) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, repo_name, repo_path, task_title, task_description, agent_id, allowed_patterns_json],
    )?;
    Ok(())
}

pub fn delete_execution_draft(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM execution_drafts WHERE id = ?1", [id])?;
    Ok(())
}
