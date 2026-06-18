use rusqlite::Connection;
use nexora_lib::swarm_db;

#[test]
fn test_database_initialization() {
    // 1. Connects to an in-memory SQLite database
    let conn = Connection::open_in_memory().expect("Failed to open in-memory DB");

    // 2. Runs the exact `run_migrations` function from `swarm_db.rs`
    swarm_db::run_migrations(&conn).expect("Failed to run migrations");

    // 3. Queries `sqlite_master` to list all created tables.
    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").unwrap();
    let table_names: Vec<String> = stmt.query_map([], |row| row.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();

    // 4. Asserts that all 7 required tables exist (plus schema_version).
    let expected_tables = vec![
        "schema_version",
        "repositories",
        "tasks",
        "task_dependencies",
        "executions",
        "worktrees",
        "ownership_rules",
        "execution_logs",
    ];

    for expected in &expected_tables {
        assert!(table_names.contains(&expected.to_string()), "Table '{}' is missing!", expected);
    }

    println!("All {} tables created successfully!", expected_tables.len());
    println!("Tables found: {:?}", table_names);
}
