use rusqlite::{Connection, Result};

pub fn init_team_db(conn: &Connection) -> Result<(), String> {
    // Create team schema version table if not exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS team_schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    ).map_err(|e| format!("Failed to create team_schema_version table: {}", e))?;

    // Check current version
    let mut current_version = 0;
    let _ = conn.query_row("SELECT MAX(version) FROM team_schema_version", [], |row| {
        current_version = row.get(0).unwrap_or(0);
        Ok(())
    });

    let migrations = vec![
        // Version 1: Core tables for Nexora Team
        "
        CREATE TABLE IF NOT EXISTS team_agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL,
            capabilities TEXT NOT NULL, -- JSON array of strings
            execution_id TEXT,
            active_task_id TEXT
        );

        CREATE TABLE IF NOT EXISTS team_messages (
            id TEXT PRIMARY KEY,
            from_agent_id TEXT NOT NULL,
            to_agent_id TEXT,
            task_id TEXT,
            message_type TEXT NOT NULL, -- request, response, review, warning, directive, validation
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL -- unix epoch in milliseconds
        );

        CREATE TABLE IF NOT EXISTS team_tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            assignee_id TEXT,
            state TEXT NOT NULL, -- backlog, planning, assigned, running, review, validation, blocked, quarantined, done
            priority TEXT NOT NULL, -- low, medium, high, urgent
            dependencies TEXT NOT NULL, -- JSON array of strings
            attempts INTEGER NOT NULL DEFAULT 0,
            execution_id TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS team_metrics (
            agent_id TEXT PRIMARY KEY,
            cpu REAL NOT NULL DEFAULT 0.0,
            memory REAL NOT NULL DEFAULT 0.0,
            tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0.0,
            task_duration_secs INTEGER NOT NULL DEFAULT 0,
            messages_sent INTEGER NOT NULL DEFAULT 0,
            messages_received INTEGER NOT NULL DEFAULT 0,
            validation_count INTEGER NOT NULL DEFAULT 0,
            failure_count INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(agent_id) REFERENCES team_agents(id) ON DELETE CASCADE
        );
        ",
    ];

    for (i, migration) in migrations.iter().enumerate() {
        let version = (i + 1) as i32;
        if current_version < version {
            conn.execute_batch(migration)
                .map_err(|e| format!("Failed to apply team migration version {}: {}", version, e))?;
            conn.execute(
                "INSERT INTO team_schema_version (version) VALUES (?1)",
                [version],
            ).map_err(|e| format!("Failed to insert team version {}: {}", version, e))?;
        }
    }

    // Seed initial team agents if empty
    seed_initial_team_agents(conn)?;

    Ok(())
}

fn seed_initial_team_agents(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM team_agents", [], |row| row.get(0))
        .map_err(|e| format!("Count team agents failed: {}", e))?;

    if count > 0 {
        return Ok(());
    }

    let initial_agents = vec![
        ("coord", "Coordinator", "coordinator", "idle", "[\"orchestration\", \"planning\", \"delegation\"]"),
        ("fe", "Frontend Engineer", "agent", "offline", "[\"react\", \"typescript\", \"tailwind\", \"html\"]"),
        ("be", "Backend Engineer", "agent", "offline", "[\"rust\", \"go\", \"python\", \"api\"]"),
        ("db", "Database Engineer", "agent", "offline", "[\"sql\", \"migrations\", \"postgres\", \"sqlite\"]"),
        ("qa", "QA Engineer", "validation", "offline", "[\"testing\", \"cypress\", \"jest\", \"linting\"]"),
        ("rev", "Code Reviewer", "reviewer", "offline", "[\"security\", \"review\", \"architecture\"]"),
    ];

    for (id, name, role, status, caps) in initial_agents {
        conn.execute(
            "INSERT INTO team_agents (id, name, role, status, capabilities) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, name, role, status, caps],
        ).map_err(|e| format!("Failed to seed agent {}: {}", id, e))?;

        // Initialize empty metrics for each agent
        conn.execute(
            "INSERT INTO team_metrics (agent_id) VALUES (?1)",
            [id],
        ).map_err(|e| format!("Failed to initialize metrics for agent {}: {}", id, e))?;
    }

    Ok(())
}