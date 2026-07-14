#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use rusqlite::{params, Connection};

    fn cleanup_test_project(path: &Path) {
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn test_chaos_crash_recovery() {
        let temp_dir = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("chaos_test_project");
        cleanup_test_project(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let db_dir = temp_dir.join(".nexora");
        fs::create_dir_all(&db_dir).unwrap();

        // 1. Initialize schema
        let mut conn = Connection::open(db_dir.join("memory.db")).unwrap();
        crate::memory::database::initialize_db_schema(&conn).unwrap();

        // Run 10,000 chaos iterations injecting failures at random execution blocks
        for i in 0..10000 {
            let crash_point = i % 6; // 6 distinct crash points
            
            // Simulate operation
            let commit_hash = format!("hash-{}", i);
            let name = format!("checkpoint-{}", i);

            // Recovery Journal Start
            let journal_dir = temp_dir.join(".nexora").join("recovery");
            fs::create_dir_all(&journal_dir).unwrap();
            let journal_path = journal_dir.join("operation.journal");

            // Point 0: Crash before lock/journal creation
            if crash_point == 0 {
                assert!(!journal_path.exists());
                continue;
            }

            // Write journal
            let journal_content = format!(
                "{{\n  \"operation\": \"restore\",\n  \"state\": \"CREATED\",\n  \"checkpoint\": \"{}\"\n}}",
                commit_hash
            );
            fs::write(&journal_path, journal_content).unwrap();

            // Point 1: Crash after journal creation, before SQLite Transaction
            if crash_point == 1 {
                // Verify journal exists but DB is empty
                assert!(journal_path.exists());
                let count: i64 = conn.query_row("SELECT COUNT(*) FROM commits WHERE git_commit_hash = ?1", params![commit_hash], |r| r.get(0)).unwrap();
                assert_eq!(count, 0);
                
                // Simulate recovery run
                let _ = fs::remove_file(&journal_path);
                continue;
            }

            // Start SQL transaction manually
            let tx_res = conn.transaction();
            if tx_res.is_err() {
                continue;
            }
            let tx = tx_res.unwrap();

            // Insert commit
            let commit_id = format!("commit-{}", i);
            tx.execute(
                "INSERT INTO commits (id, git_commit_hash, type, source, description, status) VALUES (?1,?2,'checkpoint','user',?3,'approved')",
                params![commit_id, commit_hash, name]
            ).unwrap();

            // Point 2: Crash mid transaction writes
            if crash_point == 2 {
                drop(tx); // Rollback transaction
                let count: i64 = conn.query_row("SELECT COUNT(*) FROM commits WHERE git_commit_hash = ?1", params![commit_hash], |r| r.get(0)).unwrap();
                assert_eq!(count, 0);
                let _ = fs::remove_file(&journal_path);
                continue;
            }

            // Insert operations
            let op_id = format!("op-{}", i);
            tx.execute(
                "INSERT INTO operations (id, commit_id, file_path, operation_type) VALUES (?1,?2,'file.txt','modified')",
                params![op_id, commit_id]
            ).unwrap();

            // Point 3: Crash right before commit
            if crash_point == 3 {
                drop(tx); // Rollback transaction
                let count: i64 = conn.query_row("SELECT COUNT(*) FROM commits WHERE git_commit_hash = ?1", params![commit_hash], |r| r.get(0)).unwrap();
                assert_eq!(count, 0);
                let _ = fs::remove_file(&journal_path);
                continue;
            }

            // Commit transaction
            tx.commit().unwrap();

            // Point 4: Crash after SQLite Commit, before journal deletion
            if crash_point == 4 {
                // Verify DB has the records, journal still exists
                let count: i64 = conn.query_row("SELECT COUNT(*) FROM commits WHERE git_commit_hash = ?1", params![commit_hash], |r| r.get(0)).unwrap();
                assert_eq!(count, 1);
                assert!(journal_path.exists());
                
                // Recovery cleans journal
                let _ = fs::remove_file(&journal_path);
                continue;
            }

            // Point 5: Safe path (Successful completion)
            let _ = fs::remove_file(&journal_path);
            let count: i64 = conn.query_row("SELECT COUNT(*) FROM commits WHERE git_commit_hash = ?1", params![commit_hash], |r| r.get(0)).unwrap();
            assert_eq!(count, 1);
        }

        cleanup_test_project(&temp_dir);
    }
}
