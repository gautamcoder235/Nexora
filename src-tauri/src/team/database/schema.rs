pub const CREATE_SCHEMA_VERSION_TABLE: &str = "
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);
";

pub const MIGRATIONS: &[&str] = &[
    // Migration 1: Agent profiles and settings
    "
    CREATE TABLE IF NOT EXISTS agent_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        preferred_model TEXT NOT NULL,
        known_mistakes TEXT NOT NULL DEFAULT '[]', -- JSON Array
        languages TEXT NOT NULL DEFAULT '[]',      -- JSON Array
        expertise TEXT NOT NULL DEFAULT '[]'       -- JSON Array
    );

    CREATE TABLE IF NOT EXISTS agent_stats (
        agent_id TEXT PRIMARY KEY,
        success_rate REAL NOT NULL DEFAULT 1.0,
        tasks_completed INTEGER NOT NULL DEFAULT 0,
        tasks_failed INTEGER NOT NULL DEFAULT 0,
        avg_completion_time_sec REAL NOT NULL DEFAULT 0.0,
        total_tokens_used INTEGER NOT NULL DEFAULT 0,
        total_commands_executed INTEGER NOT NULL DEFAULT 0,
        total_files_modified INTEGER NOT NULL DEFAULT 0,
        active_runtime_ms INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(agent_id) REFERENCES agent_profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_preferences (
        agent_id TEXT,
        pref_key TEXT,
        pref_value TEXT NOT NULL,
        PRIMARY KEY(agent_id, pref_key),
        FOREIGN KEY(agent_id) REFERENCES agent_profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_capabilities (
        agent_id TEXT,
        capability TEXT,
        PRIMARY KEY(agent_id, capability),
        FOREIGN KEY(agent_id) REFERENCES agent_profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
        session_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL,
        FOREIGN KEY(agent_id) REFERENCES agent_profiles(id) ON DELETE CASCADE
    );
    ",

    // Migration 2: Tasks, dependencies and attempts
    "
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        state TEXT NOT NULL,
        assigned_agent_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        priority TEXT NOT NULL,
        estimated_tokens INTEGER,
        estimated_duration INTEGER,
        priority_score REAL NOT NULL DEFAULT 0.0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        blocked_reason TEXT,
        created_by TEXT NOT NULL,
        assigned_by TEXT,
        approval_required INTEGER NOT NULL DEFAULT 0,
        reviewer TEXT,
        parent_task TEXT,
        child_tasks TEXT NOT NULL DEFAULT '[]', -- JSON Array
        checkpoint TEXT,
        quarantine_reason TEXT,
        execution_id TEXT,
        FOREIGN KEY(assigned_agent_id) REFERENCES agent_profiles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT,
        depends_on_task_id TEXT,
        PRIMARY KEY(task_id, depends_on_task_id),
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_attempts (
        task_id TEXT,
        attempt_number INTEGER,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        log_output TEXT,
        validation_errors TEXT DEFAULT '[]', -- JSON Array
        PRIMARY KEY(task_id, attempt_number),
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_diffs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        original_content TEXT NOT NULL,
        new_content TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    ",

    // Migration 3: Agent memory / learning logs
    "
    CREATE TABLE IF NOT EXISTS agent_learning (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        success INTEGER NOT NULL,
        mistake_description TEXT,
        rollback_performed INTEGER NOT NULL DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(agent_id) REFERENCES agent_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    "
];
