use rusqlite::Connection;
use std::path::Path;

pub fn open_memory_db(project_path: &str) -> Result<Connection, String> {
    let db_dir = Path::new(project_path).join(".nexora");
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(db_dir.join("memory.db")).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn initialize_db_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            source      TEXT NOT NULL,
            description TEXT,
            started     DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended       DATETIME
        );

        CREATE TABLE IF NOT EXISTS commits (
            id              TEXT PRIMARY KEY,
            session_id      TEXT,
            git_commit_hash TEXT NOT NULL UNIQUE,
            type            TEXT NOT NULL,
            source          TEXT NOT NULL,
            description     TEXT,
            timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP,
            status          TEXT DEFAULT 'pending',
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS operations (
            id             TEXT PRIMARY KEY,
            commit_id      TEXT NOT NULL,
            file_path      TEXT NOT NULL,
            operation_type TEXT NOT NULL,
            old_path       TEXT,
            FOREIGN KEY(commit_id) REFERENCES commits(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS refs (
            name           TEXT PRIMARY KEY,
            commit_hash    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id             TEXT PRIMARY KEY,
            commit_hash    TEXT NOT NULL UNIQUE,
            status         TEXT NOT NULL,
            reviewed_by    TEXT NOT NULL,
            review_time    DATETIME
        );

        CREATE TABLE IF NOT EXISTS checkpoints (
            id        TEXT PRIMARY KEY,
            commit_id TEXT NOT NULL,
            name      TEXT NOT NULL,
            FOREIGN KEY(commit_id) REFERENCES commits(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_commits_sess ON commits(session_id);
        CREATE INDEX IF NOT EXISTS idx_ops_commit ON operations(commit_id);
    ").map_err(|e| format!("Failed to create Memory Core schema: {}", e))?;
    Ok(())
}
