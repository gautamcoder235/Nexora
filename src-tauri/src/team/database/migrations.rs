use rusqlite::Connection;
use crate::team::database::schema::{CREATE_SCHEMA_VERSION_TABLE, MIGRATIONS};

pub fn run_team_migrations(conn: &Connection) -> Result<(), String> {
    // 1. Create schema_version table
    conn.execute(CREATE_SCHEMA_VERSION_TABLE, [])
        .map_err(|e| format!("Failed to create schema_version table: {}", e))?;

    // 2. Query current version
    let current_version: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0);

    println!("[TeamDB] Current migration schema version: {}", current_version);

    // 3. Apply missing migrations
    for (i, migration_sql) in MIGRATIONS.iter().enumerate() {
        let migration_version = (i + 1) as i32;
        if current_version < migration_version {
            println!("[TeamDB] Running migration version {}...", migration_version);
            
            // Execute migration statements
            conn.execute_batch(migration_sql)
                .map_err(|e| format!("Migration version {} failed: {}", migration_version, e))?;

            // Record migration version
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [migration_version],
            )
            .map_err(|e| format!("Failed to write schema version {}: {}", migration_version, e))?;
            
            println!("[TeamDB] Migration version {} completed successfully.", migration_version);
        }
    }

    Ok(())
}
