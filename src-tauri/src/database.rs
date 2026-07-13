use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// Global DB Connection
pub struct DbState(pub Mutex<Option<Connection>>);

pub fn init_db(app_handle: &AppHandle) -> Result<(), String> {
    // Get the path to app data directory
    let mut db_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;// Ensure directory exists
    if !db_path.exists() {
        std::fs::create_dir_all(&db_path).map_err(|e| e.to_string())?;
    }

    db_path.push("swarm.db");

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;

    // Enable WAL mode and busy timeout for concurrent access
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;",
    )
    .map_err(|e| format!("Pragma failed: {}", e))?;

    run_migrations(&conn).map_err(|e| format!("Migration failed: {}", e))?;

    app_handle.manage(DbState(Mutex::new(Some(conn))));
    Ok(())
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Create schema version table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    )?;

    // Check current version
    let mut current_version = 0;
    let _ = conn.query_row("SELECT MAX(version) FROM schema_version", [], |row| {
        current_version = row.get(0).unwrap_or(0);
        Ok(())
    });

    let migrations = vec![
        // Version 1: Core single-user tables
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
        ",
        // Version 2: Universal Change Tracking Engine (UCTE)
        "
        CREATE TABLE IF NOT EXISTS ucte_workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            root TEXT NOT NULL UNIQUE,
            created DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_scanned DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ucte_snapshots (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            parent_snapshot_id TEXT,
            created DATETIME DEFAULT CURRENT_TIMESTAMP,
            scan_duration_ms INTEGER,
            total_files INTEGER,
            FOREIGN KEY(workspace_id) REFERENCES ucte_workspaces(id)
        );

        CREATE TABLE IF NOT EXISTS ucte_files (
            id TEXT PRIMARY KEY,
            snapshot_id TEXT NOT NULL,
            path TEXT NOT NULL,
            size INTEGER,
            mtime INTEGER,
            hash TEXT,
            mode INTEGER,
            encoding TEXT,
            type TEXT,
            FOREIGN KEY(snapshot_id) REFERENCES ucte_snapshots(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ucte_chunks (
            id TEXT PRIMARY KEY,
            file_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            hash TEXT NOT NULL,
            offset_bytes INTEGER NOT NULL,
            length_bytes INTEGER NOT NULL,
            FOREIGN KEY(file_id) REFERENCES ucte_files(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ucte_history (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            snapshot_id TEXT NOT NULL,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(snapshot_id) REFERENCES ucte_snapshots(id)
        );
        ",
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
