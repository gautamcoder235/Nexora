pub mod provider;
pub mod hasher;
pub mod scanner;
pub mod diff;
pub mod snapshot;
pub mod watcher;

use tauri::{State, command};
use crate::database::DbState;
use crate::ucte::provider::{FileProvider, LocalProvider, GitProvider, RemoteProvider};
use crate::ucte::scanner::{IgnoreFilter, scan_directory};
use crate::ucte::snapshot::*;
use crate::ucte::diff::{compare_snapshots, FileDiff};
use crate::ucte::hasher::hash_file;
use uuid::Uuid;
use std::time::Instant;

#[command]
pub fn ucte_create_snapshot(
    state: State<DbState>,
    workspace_id: &str,
    name: &str,
    provider_type: &str,
    root_path: &str,
) -> Result<String, String> {
    let mutex = &state.inner().0;
    let conn_guard = mutex.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    db_create_workspace(conn, workspace_id, name, provider_type, root_path)
        .map_err(|e| format!("DB Error creating workspace: {}", e))?;

    let provider: Box<dyn FileProvider> = match provider_type {
        "git" => Box::new(GitProvider::new()),
        "ssh" | "s3" | "onedrive" => Box::new(RemoteProvider::new(provider_type)),
        _ => Box::new(LocalProvider),
    };

    let start_time = Instant::now();
    let ignore = IgnoreFilter::new(root_path);

    let scan_res = scan_directory(provider.as_ref(), root_path, &ignore)
        .map_err(|e| format!("Scanner failed: {}", e))?;

    let scan_duration = start_time.elapsed().as_millis() as i64;
    let snapshot_id = format!("snap-{}", Uuid::new_v4());

    let parent = db_get_latest_snapshot(conn, workspace_id)
        .map(|opt| opt.map(|s| s.id))
        .unwrap_or(None);

    db_create_snapshot(
        conn,
        &snapshot_id,
        workspace_id,
        parent.as_deref(),
        scan_duration,
        scan_res.files.len() as i64,
    )
    .map_err(|e| format!("DB Error creating snapshot: {}", e))?;

    for file in &scan_res.files {
        let size = file.size as i64;
        let mtime = file.mtime as i64;

        let hash = match db_find_cached_hash(conn, workspace_id, &file.path, size, mtime) {
            Ok(Some(h)) => h,
            _ => {
                match hash_file(&file.path) {
                    Ok(hash_res) => {
                        let file_id = format!("file-{}", Uuid::new_v4());
                        for chunk in hash_res.chunks {
                            let chunk_id = format!("chunk-{}", Uuid::new_v4());
                            let _ = db_add_chunk(
                                conn,
                                &chunk_id,
                                &file_id,
                                chunk.index as i32,
                                &chunk.hash,
                                chunk.offset as i64,
                                chunk.length as i64,
                            );
                        }
                        hash_res.file_hash
                    }
                    Err(err) => {
                        eprintln!("[UCTE] Hashing failed for {}: {}", file.path, err);
                        "unknown".to_string()
                    }
                }
            }
        };

        let file_id = format!("file-{}", Uuid::new_v4());
        let encoding = "utf-8";
        let file_type = if file.path.ends_with(".rs") {
            "rust"
        } else if file.path.ends_with(".js") || file.path.ends_with(".ts") || file.path.ends_with(".tsx") {
            "typescript"
        } else {
            "text"
        };

        db_add_file(
            conn,
            &file_id,
            &snapshot_id,
            &file.path,
            size,
            mtime,
            &hash,
            0,
            encoding,
            file_type,
        )
        .map_err(|e| format!("DB Error inserting file metadata: {}", e))?;
    }

    Ok(snapshot_id)
}

#[command]
pub fn ucte_get_snapshot_diff(
    state: State<DbState>,
    snapshot_a_id: &str,
    snapshot_b_id: &str,
) -> Result<Vec<FileDiff>, String> {
    let mutex = &state.inner().0;
    let conn_guard = mutex.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let files_a = db_get_snapshot_files(conn, snapshot_a_id)
        .map_err(|e| format!("DB Error loading files for A: {}", e))?;
    let files_b = db_get_snapshot_files(conn, snapshot_b_id)
        .map_err(|e| format!("DB Error loading files for B: {}", e))?;

    let content_provider_a = |path: &str| -> Result<String, String> {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    };
    let content_provider_b = |path: &str| -> Result<String, String> {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    };

    let diffs = compare_snapshots(&files_a, &files_b, content_provider_a, content_provider_b);
    Ok(diffs)
}

#[command]
pub fn ucte_get_changes(
    state: State<DbState>,
    workspace_id: &str,
    root_path: &str,
) -> Result<Vec<FileDiff>, String> {
    let mutex = &state.inner().0;
    let conn_guard = mutex.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let latest_snap = db_get_latest_snapshot(conn, workspace_id)
        .map_err(|e| format!("DB Error fetching latest snapshot: {}", e))?;

    let latest_snap_files = if let Some(ref snap) = latest_snap {
        db_get_snapshot_files(conn, &snap.id)
            .map_err(|e| format!("DB Error fetching snapshot files: {}", e))?
    } else {
        Vec::new()
    };

    let ignore = IgnoreFilter::new(root_path);
    let provider = LocalProvider;
    let scan_res = scan_directory(&provider, root_path, &ignore)
        .map_err(|e| format!("Scanner failed: {}", e))?;

    let content_provider_snap = |path: &str| -> Result<String, String> {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    };
    let content_provider_live = |path: &str| -> Result<String, String> {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    };

    let diffs = compare_snapshots(
        &latest_snap_files,
        &scan_res.files,
        content_provider_snap,
        content_provider_live,
    );

    Ok(diffs)
}
