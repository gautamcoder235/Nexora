use nexora_lib::database::run_migrations;
use nexora_lib::ucte::provider::LocalProvider;
use nexora_lib::ucte::scanner::{IgnoreFilter, scan_directory};
use nexora_lib::ucte::snapshot::{
    db_create_workspace, db_create_snapshot, db_add_file, db_get_snapshot_files
};
use nexora_lib::ucte::diff::compare_snapshots;
use nexora_lib::ucte::hasher::hash_file;
use rusqlite::Connection;
use uuid::Uuid;
use std::fs;
use std::collections::HashMap;

#[test]
fn test_ucte_local_diff_detection() {
    // 1. Create a temp directory for our workspace
    let mut root_path_buf = std::env::temp_dir();
    root_path_buf.push(format!("ws-test-{}", Uuid::new_v4()));
    let root_path = root_path_buf.to_str().unwrap().to_string();
    fs::create_dir_all(&root_path).unwrap();

    // 2. Add some initial files to the workspace
    let file1_path = root_path_buf.join("main.rs");
    let file2_path = root_path_buf.join("utils.rs");

    fs::write(&file1_path, "fn main() {\n    println!(\"Hello World\");\n}\n").unwrap();
    fs::write(&file2_path, "pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}\n").unwrap();

    // 3. Connect to an in-memory database and run migrations
    let conn = Connection::open_in_memory().unwrap();
    run_migrations(&conn).unwrap();

    // 4. Register workspace in DB
    let workspace_id = "ws-test-123";
    let workspace_name = "Test Workspace";
    let provider_type = "local";
    db_create_workspace(&conn, workspace_id, workspace_name, provider_type, &root_path).unwrap();

    // 5. Scan directory and generate files listing
    let ignore = IgnoreFilter::new(&root_path);
    let provider = LocalProvider;
    let scan_res = scan_directory(&provider, &root_path, &ignore).unwrap();

    // 6. Insert snapshot into DB
    let snapshot_id = format!("snap-{}", Uuid::new_v4());
    db_create_snapshot(&conn, &snapshot_id, workspace_id, None, 100, scan_res.files.len() as i64).unwrap();

    // 7. Add files to snapshot
    for file in &scan_res.files {
        let hash = hash_file(&file.path).unwrap().file_hash;
        let file_id = format!("file-{}", Uuid::new_v4());
        db_add_file(
            &conn,
            &file_id,
            &snapshot_id,
            &file.path,
            file.size as i64,
            file.mtime as i64,
            &hash,
            0,
            "utf-8",
            "rust",
        ).unwrap();
    }

    // 8. Verify that getting changes on a fresh snapshot yields 0 changes
    let latest_snap_files = db_get_snapshot_files(&conn, &snapshot_id).unwrap();
    let scan_res_fresh = scan_directory(&provider, &root_path, &ignore).unwrap();

    let initial_changes = compare_snapshots(
        &latest_snap_files,
        &scan_res_fresh.files,
        |path| std::fs::read_to_string(path).map_err(|e| e.to_string()),
        |path| std::fs::read_to_string(path).map_err(|e| e.to_string()),
    );
    assert_eq!(initial_changes.len(), 0, "Expected no initial changes");

    // 9. Make a modification in file1
    fs::write(&file1_path, "fn main() {\n    println!(\"Hello Nexora\");\n}\n").unwrap();

    // 10. Add a new untracked file
    let file3_path = root_path_buf.join("config.json");
    fs::write(&file3_path, "{\"port\": 3000}\n").unwrap();

    // 11. Run scanner and compare again to detect modifications
    let scan_res_post = scan_directory(&provider, &root_path, &ignore).unwrap();
    
    let _map_a = latest_snap_files.iter().map(|f| (f.path.clone(), f)).collect::<HashMap<_, _>>();
    let map_b = scan_res_post.files.iter().map(|f| (f.path.clone(), f)).collect::<HashMap<_, _>>();

    // Verify file listings are correct
    assert!(map_b.contains_key(&file1_path.to_string_lossy().to_string()));
    assert!(map_b.contains_key(&file3_path.to_string_lossy().to_string()));

    // Run compare_snapshots with mocked snapshot provider to simulate retrieval of original content
    let post_edit_changes = compare_snapshots(
        &latest_snap_files,
        &scan_res_post.files,
        |path| {
            if path.contains("main.rs") {
                Ok("fn main() {\n    println!(\"Hello World\");\n}\n".to_string())
            } else {
                std::fs::read_to_string(path).map_err(|e| e.to_string())
            }
        },
        |path| std::fs::read_to_string(path).map_err(|e| e.to_string()),
    );

    assert_eq!(post_edit_changes.len(), 2, "Expected 2 changes (1 modified, 1 added)");

    // Find the changes
    let main_diff = post_edit_changes.iter().find(|d| d.path.contains("main.rs")).expect("Missing diff for main.rs");
    let config_diff = post_edit_changes.iter().find(|d| d.path.contains("config.json")).expect("Missing diff for config.json");

    // Assert correct diff statuses
    assert_eq!(main_diff.status, "modified");
    assert_eq!(config_diff.status, "added");

    // Let's assert on patch contents
    assert!(main_diff.patch.contains("-    println!(\"Hello World\");"));
    assert!(main_diff.patch.contains("+    println!(\"Hello Nexora\");"));

    // Clean up temporary workspace directory
    let _ = fs::remove_dir_all(&root_path);

    println!("UCTE integration test successfully passed! Detected local file modifications and additions perfectly.");
}
