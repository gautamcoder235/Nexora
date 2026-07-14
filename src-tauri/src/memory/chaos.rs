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

    #[test]
    fn test_create_snapshot_flow() {
        if crate::memory::database_worker::DB_WORKER_SENDER.get().is_none() {
            crate::memory::database_worker::start_db_worker();
        }
        if crate::memory::scheduler::SCHEDULER_SENDER.get().is_none() {
            crate::memory::scheduler::start_scheduler_worker();
        }

        let temp_dir = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("snapshot_test_project");
        cleanup_test_project(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let app_data_dir = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("snapshot_test_app_data");
        let _ = fs::remove_dir_all(&app_data_dir);
        fs::create_dir_all(&app_data_dir).unwrap();

        let git_path = std::path::PathBuf::from("C:\\Git\\cmd\\git.exe");
        let project_id = "test-proj-uuid".to_string();

        // 1. Initialize project
        let init_hash = crate::memory::manager::initialize_project_sync(
            &git_path,
            &app_data_dir,
            &project_id,
            temp_dir.to_str().unwrap(),
        ).unwrap();
        assert!(!init_hash.is_empty());

        // 2. Snapshot when clean: should return "no-changes"
        let snap_hash_1 = crate::memory::manager::create_snapshot_sync(
            &git_path,
            temp_dir.to_str().unwrap(),
            "user",
            Some("No changes snapshot".to_string()),
            None,
        ).unwrap();
        assert_eq!(snap_hash_1, "no-changes");

        // 3. Make change in project
        let test_file = temp_dir.join("test_change.txt");
        fs::write(&test_file, "This is a test change").unwrap();

        // 4. Snapshot when modified: should succeed and return a new hash
        let snap_hash_2 = crate::memory::manager::create_snapshot_sync(
            &git_path,
            temp_dir.to_str().unwrap(),
            "user",
            Some("Active test change snapshot".to_string()),
            None,
        ).unwrap();
        assert_ne!(snap_hash_2, "no-changes");
        assert_ne!(snap_hash_2, init_hash);

        // 5. Query DB via Connection to verify operations was inserted
        let db_path = temp_dir.join(".nexora").join("memory.db");
        let conn = Connection::open(db_path).unwrap();
        
        let count_commit: i64 = conn.query_row(
            "SELECT COUNT(*) FROM commits WHERE git_commit_hash = ?1 AND status = 'pending'",
            params![snap_hash_2],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count_commit, 1);

        let op_file_path: String = conn.query_row(
            "SELECT file_path FROM operations o JOIN commits c ON o.commit_id = c.id WHERE c.git_commit_hash = ?1",
            params![snap_hash_2],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(op_file_path, "test_change.txt");

        cleanup_test_project(&temp_dir);
    }
}
