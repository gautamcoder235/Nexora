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
    seed_mock_changeset(&conn).map_err(|e| format!("Seeding mock changeset failed: {}", e))?;
    
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
        ",
        // Version 8: Changesets & Agent Review Center
        "
        CREATE TABLE IF NOT EXISTS changesets (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            origin_agent_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            applied_at DATETIME,
            explanation TEXT
        );

        CREATE TABLE IF NOT EXISTS changeset_files (
            id TEXT PRIMARY KEY,
            changeset_id TEXT NOT NULL,
            path TEXT NOT NULL,
            old_content TEXT NOT NULL,
            new_content TEXT NOT NULL,
            patch TEXT NOT NULL,
            change_source TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            FOREIGN KEY(changeset_id) REFERENCES changesets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS review_comments (
            id TEXT PRIMARY KEY,
            changeset_id TEXT NOT NULL,
            path TEXT,
            line_number INTEGER,
            agent_name TEXT NOT NULL,
            comment TEXT NOT NULL,
            severity TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(changeset_id) REFERENCES changesets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS review_decisions (
            id TEXT PRIMARY KEY,
            changeset_id TEXT NOT NULL,
            user_action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            details TEXT,
            FOREIGN KEY(changeset_id) REFERENCES changesets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS changeset_snapshots (
            id TEXT PRIMARY KEY,
            changeset_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            content_backup TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(changeset_id) REFERENCES changesets(id) ON DELETE CASCADE
        );
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

// -- Changeset Database Actions -----------------------------------------------

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbChangeset {
    pub id: String,
    pub title: String,
    pub status: String,
    pub origin_agent_id: String,
    pub created_at: String,
    pub applied_at: Option<String>,
    pub explanation: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbChangesetFile {
    pub id: String,
    pub changeset_id: String,
    pub path: String,
    pub old_content: String,
    pub new_content: String,
    pub patch: String,
    pub change_source: String,
    pub status: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbReviewComment {
    pub id: String,
    pub changeset_id: String,
    pub path: Option<String>,
    pub line_number: Option<i32>,
    pub agent_name: String,
    pub comment: String,
    pub severity: String,
    pub created_at: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbChangesetSnapshot {
    pub id: String,
    pub changeset_id: String,
    pub file_path: String,
    pub content_backup: String,
    pub timestamp: String,
}

pub fn insert_changeset(
    conn: &Connection,
    id: &str,
    title: &str,
    status: &str,
    origin_agent_id: &str,
    explanation: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO changesets (id, title, status, origin_agent_id, explanation) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, title, status, origin_agent_id, explanation],
    )?;
    Ok(())
}

pub fn update_changeset_status(conn: &Connection, id: &str, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE changesets SET status = ?1, applied_at = CASE WHEN ?1 = 'applied' THEN CURRENT_TIMESTAMP ELSE applied_at END WHERE id = ?2",
        rusqlite::params![status, id],
    )?;
    Ok(())
}

pub fn insert_changeset_file(
    conn: &Connection,
    id: &str,
    changeset_id: &str,
    path: &str,
    old_content: &str,
    new_content: &str,
    patch: &str,
    change_source: &str,
    status: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO changeset_files (id, changeset_id, path, old_content, new_content, patch, change_source, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, changeset_id, path, old_content, new_content, patch, change_source, status],
    )?;
    Ok(())
}

pub fn update_changeset_file_status(
    conn: &Connection,
    changeset_id: &str,
    file_path: &str,
    status: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE changeset_files SET status = ?1 WHERE changeset_id = ?2 AND path = ?3",
        rusqlite::params![status, changeset_id, file_path],
    )?;
    Ok(())
}

pub fn insert_review_comment(
    conn: &Connection,
    id: &str,
    changeset_id: &str,
    path: Option<&str>,
    line_number: Option<i32>,
    agent_name: &str,
    comment: &str,
    severity: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO review_comments (id, changeset_id, path, line_number, agent_name, comment, severity) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, changeset_id, path, line_number, agent_name, comment, severity],
    )?;
    Ok(())
}

pub fn insert_review_decision(
    conn: &Connection,
    id: &str,
    changeset_id: &str,
    user_action: &str,
    details: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO review_decisions (id, changeset_id, user_action, details) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, changeset_id, user_action, details],
    )?;
    Ok(())
}

pub fn insert_changeset_snapshot(
    conn: &Connection,
    id: &str,
    changeset_id: &str,
    file_path: &str,
    content_backup: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO changeset_snapshots (id, changeset_id, file_path, content_backup) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, changeset_id, file_path, content_backup],
    )?;
    Ok(())
}

pub fn get_changesets(conn: &Connection) -> Result<Vec<DbChangeset>> {
    let mut stmt = conn.prepare("SELECT id, title, status, origin_agent_id, created_at, applied_at, explanation FROM changesets ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(DbChangeset {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            origin_agent_id: row.get(3)?,
            created_at: row.get(4)?,
            applied_at: row.get(5)?,
            explanation: row.get(6)?,
        })
    })?;
    
    let mut results = Vec::new();
    for r in rows {
        results.push(r?);
    }
    Ok(results)
}

pub fn get_changeset_files(conn: &Connection, changeset_id: &str) -> Result<Vec<DbChangesetFile>> {
    let mut stmt = conn.prepare("SELECT id, changeset_id, path, old_content, new_content, patch, change_source, status FROM changeset_files WHERE changeset_id = ?1")?;
    let rows = stmt.query_map([changeset_id], |row| {
        Ok(DbChangesetFile {
            id: row.get(0)?,
            changeset_id: row.get(1)?,
            path: row.get(2)?,
            old_content: row.get(3)?,
            new_content: row.get(4)?,
            patch: row.get(5)?,
            change_source: row.get(6)?,
            status: row.get(7)?,
        })
    })?;
    
    let mut results = Vec::new();
    for r in rows {
        results.push(r?);
    }
    Ok(results)
}

pub fn get_changeset_comments(conn: &Connection, changeset_id: &str) -> Result<Vec<DbReviewComment>> {
    let mut stmt = conn.prepare("SELECT id, changeset_id, path, line_number, agent_name, comment, severity, created_at FROM review_comments WHERE changeset_id = ?1 ORDER BY created_at ASC")?;
    let rows = stmt.query_map([changeset_id], |row| {
        Ok(DbReviewComment {
            id: row.get(0)?,
            changeset_id: row.get(1)?,
            path: row.get(2)?,
            line_number: row.get(3)?,
            agent_name: row.get(4)?,
            comment: row.get(5)?,
            severity: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    
    let mut results = Vec::new();
    for r in rows {
        results.push(r?);
    }
    Ok(results)
}

pub fn get_changeset_snapshots(conn: &Connection, changeset_id: &str) -> Result<Vec<DbChangesetSnapshot>> {
    let mut stmt = conn.prepare("SELECT id, changeset_id, file_path, content_backup, timestamp FROM changeset_snapshots WHERE changeset_id = ?1")?;
    let rows = stmt.query_map([changeset_id], |row| {
        Ok(DbChangesetSnapshot {
            id: row.get(0)?,
            changeset_id: row.get(1)?,
            file_path: row.get(2)?,
            content_backup: row.get(3)?,
            timestamp: row.get(4)?,
        })
    })?;
    
    let mut results = Vec::new();
    for r in rows {
        results.push(r?);
    }
    Ok(results)
}

pub fn seed_mock_changeset(conn: &Connection) -> Result<()> {
    // Check if we already have changesets
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM changesets", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    insert_changeset(
        conn,
        "cset-mock-auth",
        "Implement User Authentication Hook",
        "pending",
        "builder-agent",
        Some("This changeset adds a custom useAuth hook and mock login logic."),
    )?;

    insert_changeset_file(
        conn,
        "cfile-1",
        "cset-mock-auth",
        "src/hooks/useAuth.ts",
        "",
        "import { useState } from 'react';\nexport function useAuth() {\n  const [user, setUser] = useState<string | null>(null);\n  const login = (u: string) => setUser(u);\n  const logout = () => setUser(null);\n  return { user, login, logout };\n}",
        "@@ -0,0 +1,8 @@\n+import { useState } from 'react';\n+export function useAuth() {\n+  const [user, setUser] = useState<string | null>(null);\n+  const login = (u: string) => setUser(u);\n+  const logout = () => setUser(null);\n+  return { user, login, logout };\n+}",
        "Builder Agent",
        "pending",
    )?;

    insert_changeset_file(
        conn,
        "cfile-2",
        "cset-mock-auth",
        "src/App.tsx",
        "import React from 'react';\nexport default function App() {\n  return <div>Welcome</div>;\n}",
        "import React from 'react';\nimport { useAuth } from './hooks/useAuth';\nexport default function App() {\n  const { user } = useAuth();\n  return <div>Welcome {user || 'Guest'}</div>;\n}",
        "@@ -1,4 +1,5 @@\n import React from 'react';\n+import { useAuth } from './hooks/useAuth';\n export default function App() {\n-  return <div>Welcome</div>;\n+  const { user } = useAuth();\n+  return <div>Welcome {user || 'Guest'}</div>;\n }",
        "Builder Agent",
        "pending",
    )?;

    insert_review_comment(
        conn,
        "ccmt-1",
        "cset-mock-auth",
        None,
        None,
        "Tester Agent",
        "Linter Warning: 'useAuth' should be imported only once.",
        "WARNING",
    )?;

    insert_review_comment(
        conn,
        "ccmt-2",
        "cset-mock-auth",
        Some("src/hooks/useAuth.ts"),
        Some(2),
        "Reviewer Agent",
        "Potential security leak: state is not persistent across refreshes.",
        "ERROR",
    )?;

    insert_review_comment(
        conn,
        "ccmt-3",
        "cset-mock-auth",
        None,
        None,
        "Architect Agent",
        "Matches auth architecture guidelines in doc RFC-11.",
        "INFO",
    )?;

    Ok(())
}
