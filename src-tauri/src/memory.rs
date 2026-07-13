// ╔══════════════════════════════════════════════════════════════╗
// ║  Nexora Memory Core                                        ║
// ║  Content-addressable offline file history & review engine   ║
// ║  No Git dependency. Works with any project.                 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Storage:
//   .nexora/objects/<hash[0..2]>/<hash[2..]>   — blob store
//   .nexora/memory.db                          — SQLite timeline
//
// Tables:
//   memory_history      — immutable record of every file state change
//   change_reviews      — mutable approval/rejection layer on top of history
//   checkpoint_files    — complete project state per checkpoint
//   memory_checkpoints  — named checkpoints (like commits without git)

use rusqlite::{Connection, params};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::command;

// ── Constants ──

static IGNORE_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "dist", "build", ".next",
    ".nexora", ".nexora_baselines", "__pycache__", ".vscode", ".idea",
    ".cache", "bin", ".svn", ".hg",
];

static IGNORE_EXTS: &[&str] = &[
    "exe", "dll", "so", "dylib", "wasm",
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp",
    "woff", "woff2", "ttf", "eot",
    "mp3", "mp4", "avi", "mov", "mkv", "flac", "wav",
    "zip", "tar", "gz", "rar", "7z",
    "pdf", "lock",
];

// ── Data Types ──

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub file_path: String,
    pub old_hash: Option<String>,
    pub new_hash: String,
    pub size: i64,
    pub operation: String,     // created | modified | deleted | renamed
    pub source: String,        // user | agent | terminal | external | system | restore
    pub timestamp: String,
    pub old_path: Option<String>,
    // Joined review status (if exists)
    pub review_status: Option<String>,  // pending | approved | rejected | null
    pub review_id: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ChangeReview {
    pub id: String,
    pub history_id: String,
    pub status: String,        // pending | approved | rejected
    pub reviewed_by: String,   // user | auto
    pub review_time: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct MemoryCheckpoint {
    pub id: String,
    pub name: String,
    pub timestamp: String,
    pub file_count: i64,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct CaptureResult {
    pub total_scanned: u64,
    pub changes_found: u64,
    pub new_entries: Vec<HistoryEntry>,
}

// ── Internal helpers ──

fn nexora_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".nexora")
}

fn objects_dir(project_path: &str) -> PathBuf {
    nexora_dir(project_path).join("objects")
}

fn db_path(project_path: &str) -> PathBuf {
    nexora_dir(project_path).join("memory.db")
}

fn hash_bytes(content: &[u8]) -> String {
    blake3::hash(content).to_hex().to_string()
}

fn store_blob(project_path: &str, hash: &str, content: &[u8]) -> Result<(), String> {
    if hash.len() < 4 { return Err("Hash too short".into()); }
    let dir = objects_dir(project_path).join(&hash[..2]);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let blob = dir.join(&hash[2..]);
    if !blob.exists() {
        std::fs::write(&blob, content).map_err(|e| e.to_string())?;
    }
    Ok(()) // deduplicated
}

fn read_blob(project_path: &str, hash: &str) -> Result<Vec<u8>, String> {
    if hash.len() < 4 { return Err("Hash too short".into()); }
    let blob = objects_dir(project_path).join(&hash[..2]).join(&hash[2..]);
    if blob.exists() {
        std::fs::read(&blob).map_err(|e| e.to_string())
    } else {
        Err(format!("Object {} not found", hash))
    }
}

fn should_skip_name(name: &str) -> bool {
    name.starts_with('.') && name != ".env" && name != ".gitignore" && name != ".prettierrc"
}

fn should_skip_ext(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        IGNORE_EXTS.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
}

fn open_db(project_path: &str) -> Result<Connection, String> {
    let p = db_path(project_path);
    let conn = Connection::open(&p).map_err(|e| format!("DB open failed: {}", e))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS memory_history (
            id          TEXT PRIMARY KEY,
            file_path   TEXT NOT NULL,
            old_hash    TEXT,
            new_hash    TEXT NOT NULL,
            size        INTEGER NOT NULL DEFAULT 0,
            operation   TEXT NOT NULL DEFAULT 'modified',
            source      TEXT NOT NULL DEFAULT 'user',
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            old_path    TEXT
        );

        CREATE TABLE IF NOT EXISTS change_reviews (
            id          TEXT PRIMARY KEY,
            history_id  TEXT NOT NULL UNIQUE,
            status      TEXT NOT NULL DEFAULT 'pending',
            reviewed_by TEXT NOT NULL DEFAULT 'user',
            review_time DATETIME,
            FOREIGN KEY(history_id) REFERENCES memory_history(id)
        );

        CREATE TABLE IF NOT EXISTS memory_checkpoints (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            file_count  INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS checkpoint_files (
            checkpoint_id TEXT NOT NULL,
            file_path     TEXT NOT NULL,
            content_hash  TEXT NOT NULL,
            PRIMARY KEY(checkpoint_id, file_path),
            FOREIGN KEY(checkpoint_id) REFERENCES memory_checkpoints(id)
        );

        CREATE INDEX IF NOT EXISTS idx_hist_path ON memory_history(file_path);
        CREATE INDEX IF NOT EXISTS idx_hist_time ON memory_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_rev_status ON change_reviews(status);
    ").map_err(|e| format!("Schema init failed: {}", e))?;
    Ok(())
}

/// Scan all trackable files. Returns HashMap<relative_path, (bytes, hash)>.
fn scan_all_files(project_path: &str) -> Result<HashMap<String, (Vec<u8>, String)>, String> {
    let root = Path::new(project_path);
    let mut result = HashMap::new();

    fn walk(dir: &Path, root: &Path, out: &mut HashMap<String, (Vec<u8>, String)>) -> Result<(), String> {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return Ok(()),
        };
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if should_skip_name(&name) { continue; }

            if path.is_dir() {
                if IGNORE_DIRS.contains(&name.as_str()) { continue; }
                walk(&path, root, out)?;
            } else {
                if should_skip_ext(&path) { continue; }
                // Read file bytes — works for any file type
                match std::fs::read(&path) {
                    Ok(bytes) => {
                        let rel = path.strip_prefix(root)
                            .map_err(|e| e.to_string())?
                            .to_string_lossy()
                            .replace("\\", "/");
                        let hash = hash_bytes(&bytes);
                        out.insert(rel, (bytes, hash));
                    }
                    Err(_) => continue, // permission denied / locked
                }
            }
        }
        Ok(())
    }

    walk(root, root, &mut result)?;
    Ok(result)
}

/// Build the "latest known state" of each file from history (last entry per path wins).
fn get_known_state(conn: &Connection) -> Result<HashMap<String, String>, String> {
    let mut stmt = conn.prepare(
        "SELECT file_path, new_hash, operation FROM memory_history ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;

    let mut map: HashMap<String, String> = HashMap::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let path: String = row.get(0).map_err(|e| e.to_string())?;
        let hash: String = row.get(1).map_err(|e| e.to_string())?;
        let op: String = row.get(2).map_err(|e| e.to_string())?;
        if op == "deleted" {
            map.remove(&path);
        } else {
            map.insert(path, hash);
        }
    }
    Ok(map)
}

/// Detect renames: if a file was deleted and a new file has the same hash, it's a rename.
fn detect_renames(
    deleted: &mut Vec<(String, String)>,   // (path, hash)
    created: &mut Vec<(String, String)>,   // (path, hash)
) -> Vec<(String, String, String)> {       // (old_path, new_path, hash)
    let mut renames = Vec::new();
    let mut used_created: std::collections::HashSet<usize> = std::collections::HashSet::new();
    let mut used_deleted: std::collections::HashSet<usize> = std::collections::HashSet::new();

    for (di, (del_path, del_hash)) in deleted.iter().enumerate() {
        for (ci, (cre_path, cre_hash)) in created.iter().enumerate() {
            if used_created.contains(&ci) { continue; }
            if del_hash == cre_hash {
                renames.push((del_path.clone(), cre_path.clone(), del_hash.clone()));
                used_created.insert(ci);
                used_deleted.insert(di);
                break;
            }
        }
    }

    // Remove matched entries from deleted/created in reverse order
    let mut del_indices: Vec<usize> = used_deleted.into_iter().collect();
    del_indices.sort_unstable_by(|a, b| b.cmp(a));
    for i in del_indices { deleted.remove(i); }

    let mut cre_indices: Vec<usize> = used_created.into_iter().collect();
    cre_indices.sort_unstable_by(|a, b| b.cmp(a));
    for i in cre_indices { created.remove(i); }

    renames
}

fn new_id() -> String {
    format!("mem-{}", uuid::Uuid::new_v4())
}

fn insert_history(conn: &Connection, id: &str, file_path: &str, old_hash: Option<&str>, new_hash: &str, size: i64, operation: &str, source: &str, old_path: Option<&str>) -> Result<(), String> {
    conn.execute(
        "INSERT INTO memory_history (id, file_path, old_hash, new_hash, size, operation, source, old_path) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![id, file_path, old_hash, new_hash, size, operation, source, old_path],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn insert_review(conn: &Connection, history_id: &str, status: &str) -> Result<(), String> {
    let rev_id = format!("rev-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO change_reviews (id, history_id, status, reviewed_by) VALUES (?1,?2,?3,'auto')",
        params![rev_id, history_id, status],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ╔════════════════════════╗
// ║   Tauri Commands       ║
// ╚════════════════════════╝

/// Initialize .nexora/ for a project. Auto-captures initial baseline.
/// Returns the number of files in the initial baseline.
#[command]
pub fn memory_init(project_path: String) -> Result<u64, String> {
    std::fs::create_dir_all(objects_dir(&project_path)).map_err(|e| e.to_string())?;

    let conn = open_db(&project_path)?;
    ensure_schema(&conn)?;

    // Check if already initialized
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM memory_history", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    if count > 0 {
        return Ok(count as u64);
    }

    // First time: capture everything as initial baseline
    let files = scan_all_files(&project_path)?;
    let mut stored: u64 = 0;

    for (rel_path, (bytes, hash)) in &files {
        store_blob(&project_path, hash, bytes)?;
        let id = new_id();
        insert_history(&conn, &id, rel_path, None, hash, bytes.len() as i64, "created", "system", None)?;
        insert_review(&conn, &id, "approved")?;
        stored += 1;
    }

    // Create initial checkpoint
    let cp_id = format!("cp-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO memory_checkpoints (id, name, file_count) VALUES (?1, 'Initial Baseline', ?2)",
        params![cp_id, stored as i64],
    ).map_err(|e| e.to_string())?;

    for (rel_path, (_bytes, hash)) in &files {
        conn.execute(
            "INSERT INTO checkpoint_files (checkpoint_id, file_path, content_hash) VALUES (?1,?2,?3)",
            params![cp_id, rel_path, hash],
        ).map_err(|e| e.to_string())?;
    }

    // Add .nexora/ to .gitignore if present
    let gi = Path::new(&project_path).join(".gitignore");
    if gi.exists() {
        let content = std::fs::read_to_string(&gi).unwrap_or_default();
        if !content.contains(".nexora") {
            let mut new_c = content;
            if !new_c.ends_with('\n') { new_c.push('\n'); }
            new_c.push_str(".nexora/\n");
            let _ = std::fs::write(&gi, new_c);
        }
    }

    Ok(stored)
}

/// Scan files, detect changes (with rename detection), store blobs, create history entries + pending reviews.
#[command]
pub fn memory_capture(project_path: String, source: Option<String>) -> Result<CaptureResult, String> {
    let conn = open_db(&project_path)?;
    ensure_schema(&conn)?;

    let change_source = source.unwrap_or_else(|| "user".into());
    let current_files = scan_all_files(&project_path)?;
    let known_state = get_known_state(&conn)?;
    let total_scanned = current_files.len() as u64;
    let mut new_entries: Vec<HistoryEntry> = Vec::new();

    let mut deleted_list: Vec<(String, String)> = Vec::new(); // (path, hash)
    let mut created_list: Vec<(String, String)> = Vec::new(); // (path, hash)

    // Pass 1: Detect modifications and collect created/deleted candidates
    for (rel_path, (bytes, hash)) in &current_files {
        match known_state.get(rel_path) {
            Some(old_hash) if old_hash == hash => {} // unchanged
            Some(old_hash) => {
                // Modified
                store_blob(&project_path, hash, bytes)?;
                let id = new_id();
                insert_history(&conn, &id, rel_path, Some(old_hash), hash, bytes.len() as i64, "modified", &change_source, None)?;
                insert_review(&conn, &id, "pending")?;
                new_entries.push(HistoryEntry {
                    id, file_path: rel_path.clone(), old_hash: Some(old_hash.clone()),
                    new_hash: hash.clone(), size: bytes.len() as i64,
                    operation: "modified".into(), source: change_source.clone(),
                    timestamp: String::new(), old_path: None,
                    review_status: Some("pending".into()), review_id: None,
                });
            }
            None => {
                // Candidate for "created" (might be a rename)
                store_blob(&project_path, hash, bytes)?;
                created_list.push((rel_path.clone(), hash.clone()));
            }
        }
    }

    // Collect deleted candidates
    for (known_path, known_hash) in &known_state {
        if !current_files.contains_key(known_path) {
            deleted_list.push((known_path.clone(), known_hash.clone()));
        }
    }

    // Pass 2: Rename detection (same hash in deleted + created = rename)
    let renames = detect_renames(&mut deleted_list, &mut created_list);

    for (old_path, new_path, hash) in &renames {
        let size = current_files.get(new_path).map(|(b, _)| b.len() as i64).unwrap_or(0);
        let id = new_id();
        insert_history(&conn, &id, new_path, Some(hash), hash, size, "renamed", &change_source, Some(old_path))?;
        insert_review(&conn, &id, "pending")?;
        new_entries.push(HistoryEntry {
            id, file_path: new_path.clone(), old_hash: Some(hash.clone()),
            new_hash: hash.clone(), size,
            operation: "renamed".into(), source: change_source.clone(),
            timestamp: String::new(), old_path: Some(old_path.clone()),
            review_status: Some("pending".into()), review_id: None,
        });
    }

    // Pass 3: Remaining created files
    for (rel_path, hash) in &created_list {
        let size = current_files.get(rel_path).map(|(b, _)| b.len() as i64).unwrap_or(0);
        let id = new_id();
        insert_history(&conn, &id, rel_path, None, hash, size, "created", &change_source, None)?;
        insert_review(&conn, &id, "pending")?;
        new_entries.push(HistoryEntry {
            id, file_path: rel_path.clone(), old_hash: None,
            new_hash: hash.clone(), size,
            operation: "created".into(), source: change_source.clone(),
            timestamp: String::new(), old_path: None,
            review_status: Some("pending".into()), review_id: None,
        });
    }

    // Pass 4: Remaining deleted files
    for (del_path, del_hash) in &deleted_list {
        let empty_hash = hash_bytes(b"");
        let id = new_id();
        insert_history(&conn, &id, del_path, Some(del_hash), &empty_hash, 0, "deleted", &change_source, None)?;
        insert_review(&conn, &id, "pending")?;
        new_entries.push(HistoryEntry {
            id, file_path: del_path.clone(), old_hash: Some(del_hash.clone()),
            new_hash: empty_hash, size: 0,
            operation: "deleted".into(), source: change_source.clone(),
            timestamp: String::new(), old_path: None,
            review_status: Some("pending".into()), review_id: None,
        });
    }

    Ok(CaptureResult { total_scanned, changes_found: new_entries.len() as u64, new_entries })
}

/// Get all pending changes (history entries with pending reviews).
#[command]
pub fn memory_get_pending(project_path: String) -> Result<Vec<HistoryEntry>, String> {
    let conn = open_db(&project_path)?;
    ensure_schema(&conn)?;

    let mut stmt = conn.prepare(
        "SELECT h.id, h.file_path, h.old_hash, h.new_hash, h.size, h.operation, h.source, h.timestamp, h.old_path, r.status, r.id
         FROM memory_history h
         JOIN change_reviews r ON r.history_id = h.id
         WHERE r.status = 'pending'
         ORDER BY h.timestamp DESC"
    ).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        result.push(HistoryEntry {
            id: row.get(0).map_err(|e| e.to_string())?,
            file_path: row.get(1).map_err(|e| e.to_string())?,
            old_hash: row.get(2).map_err(|e| e.to_string())?,
            new_hash: row.get(3).map_err(|e| e.to_string())?,
            size: row.get(4).map_err(|e| e.to_string())?,
            operation: row.get(5).map_err(|e| e.to_string())?,
            source: row.get(6).map_err(|e| e.to_string())?,
            timestamp: row.get(7).map_err(|e| e.to_string())?,
            old_path: row.get(8).map_err(|e| e.to_string())?,
            review_status: row.get(9).map_err(|e| e.to_string())?,
            review_id: row.get(10).map_err(|e| e.to_string())?,
        });
    }
    Ok(result)
}

/// Get full timeline (all history entries with their review status).
#[command]
pub fn memory_get_timeline(project_path: String, limit: Option<u32>) -> Result<Vec<HistoryEntry>, String> {
    let conn = open_db(&project_path)?;
    ensure_schema(&conn)?;
    let lim = limit.unwrap_or(500);

    let mut stmt = conn.prepare(
        "SELECT h.id, h.file_path, h.old_hash, h.new_hash, h.size, h.operation, h.source, h.timestamp, h.old_path, r.status, r.id
         FROM memory_history h
         LEFT JOIN change_reviews r ON r.history_id = h.id
         ORDER BY h.timestamp DESC
         LIMIT ?1"
    ).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let mut rows = stmt.query(params![lim]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        result.push(HistoryEntry {
            id: row.get(0).map_err(|e| e.to_string())?,
            file_path: row.get(1).map_err(|e| e.to_string())?,
            old_hash: row.get(2).map_err(|e| e.to_string())?,
            new_hash: row.get(3).map_err(|e| e.to_string())?,
            size: row.get(4).map_err(|e| e.to_string())?,
            operation: row.get(5).map_err(|e| e.to_string())?,
            source: row.get(6).map_err(|e| e.to_string())?,
            timestamp: row.get(7).map_err(|e| e.to_string())?,
            old_path: row.get(8).map_err(|e| e.to_string())?,
            review_status: row.get(9).map_err(|e| e.to_string())?,
            review_id: row.get(10).map_err(|e| e.to_string())?,
        });
    }
    Ok(result)
}

/// Get all versions of a single file.
#[command]
pub fn memory_get_file_history(project_path: String, file_path: String) -> Result<Vec<HistoryEntry>, String> {
    let conn = open_db(&project_path)?;
    ensure_schema(&conn)?;

    let mut stmt = conn.prepare(
        "SELECT h.id, h.file_path, h.old_hash, h.new_hash, h.size, h.operation, h.source, h.timestamp, h.old_path, r.status, r.id
         FROM memory_history h
         LEFT JOIN change_reviews r ON r.history_id = h.id
         WHERE h.file_path = ?1
         ORDER BY h.timestamp DESC"
    ).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let mut rows = stmt.query(params![file_path]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        result.push(HistoryEntry {
            id: row.get(0).map_err(|e| e.to_string())?,
            file_path: row.get(1).map_err(|e| e.to_string())?,
            old_hash: row.get(2).map_err(|e| e.to_string())?,
            new_hash: row.get(3).map_err(|e| e.to_string())?,
            size: row.get(4).map_err(|e| e.to_string())?,
            operation: row.get(5).map_err(|e| e.to_string())?,
            source: row.get(6).map_err(|e| e.to_string())?,
            timestamp: row.get(7).map_err(|e| e.to_string())?,
            old_path: row.get(8).map_err(|e| e.to_string())?,
            review_status: row.get(9).map_err(|e| e.to_string())?,
            review_id: row.get(10).map_err(|e| e.to_string())?,
        });
    }
    Ok(result)
}

/// Read file content from the object store by hash.
#[command]
pub fn memory_read_version(project_path: String, hash: String) -> Result<String, String> {
    let bytes = read_blob(&project_path, &hash)?;
    String::from_utf8(bytes).map_err(|_| "Binary file — cannot display as text".into())
}

/// Restore a file to a specific version by hash. Records a 'restore' history entry.
#[command]
pub fn memory_restore_file(project_path: String, file_path: String, hash: String) -> Result<(), String> {
    let bytes = read_blob(&project_path, &hash)?;
    let abs = Path::new(&project_path).join(&file_path);
    if let Some(p) = abs.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    std::fs::write(&abs, &bytes).map_err(|e| e.to_string())?;

    // Record restore in immutable history
    let conn = open_db(&project_path)?;
    let id = new_id();
    let known = get_known_state(&conn)?;
    let old_hash = known.get(&file_path).cloned();
    insert_history(&conn, &id, &file_path, old_hash.as_deref(), &hash, bytes.len() as i64, "modified", "restore", None)?;
    insert_review(&conn, &id, "approved")?;
    Ok(())
}

/// Approve a change. History is immutable — only the review status changes.
#[command]
pub fn memory_approve_change(project_path: String, history_id: String) -> Result<(), String> {
    let conn = open_db(&project_path)?;
    conn.execute(
        "UPDATE change_reviews SET status = 'approved', review_time = CURRENT_TIMESTAMP, reviewed_by = 'user' WHERE history_id = ?1",
        params![history_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Reject a change. Restores the file to its previous version, marks review as rejected.
/// History entry remains immutable — rejection is recorded in change_reviews.
#[command]
pub fn memory_reject_change(project_path: String, history_id: String) -> Result<(), String> {
    let conn = open_db(&project_path)?;
    ensure_schema(&conn)?;

    // Fetch the history entry
    let (file_path, old_hash, operation): (String, Option<String>, String) = conn.query_row(
        "SELECT file_path, old_hash, operation FROM memory_history WHERE id = ?1",
        params![history_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|e| e.to_string())?;

    // Restore old state
    if let Some(ref oh) = old_hash {
        if operation != "deleted" {
            // Restore file content from object store
            let bytes = read_blob(&project_path, oh)?;
            let abs = Path::new(&project_path).join(&file_path);
            if let Some(p) = abs.parent() { std::fs::create_dir_all(p).map_err(|e| e.to_string())?; }
            std::fs::write(&abs, &bytes).map_err(|e| e.to_string())?;
        }
    } else if operation == "created" {
        // New file was created — remove it
        let abs = Path::new(&project_path).join(&file_path);
        if abs.exists() { std::fs::remove_file(&abs).map_err(|e| e.to_string())?; }
    }

    if operation == "deleted" {
        // File was deleted — recreate it from old_hash
        if let Some(ref oh) = old_hash {
            let bytes = read_blob(&project_path, oh)?;
            let abs = Path::new(&project_path).join(&file_path);
            if let Some(p) = abs.parent() { std::fs::create_dir_all(p).map_err(|e| e.to_string())?; }
            std::fs::write(&abs, &bytes).map_err(|e| e.to_string())?;
        }
    }

    // Mark review as rejected (history stays immutable)
    conn.execute(
        "UPDATE change_reviews SET status = 'rejected', review_time = CURRENT_TIMESTAMP, reviewed_by = 'user' WHERE history_id = ?1",
        params![history_id],
    ).map_err(|e| e.to_string())?;

    // Record the revert as a new history entry
    if let Some(ref oh) = old_hash {
        let rid = new_id();
        let size = read_blob(&project_path, oh).map(|b| b.len() as i64).unwrap_or(0);
        insert_history(&conn, &rid, &file_path, None, oh, size, "modified", "restore", None)?;
        insert_review(&conn, &rid, "approved")?;
    }

    Ok(())
}

/// Create a named checkpoint representing complete project state.
/// Approves all pending reviews.
#[command]
pub fn memory_create_checkpoint(project_path: String, name: String) -> Result<String, String> {
    let conn = open_db(&project_path)?;
    ensure_schema(&conn)?;

    // Approve all pending reviews
    conn.execute(
        "UPDATE change_reviews SET status = 'approved', review_time = CURRENT_TIMESTAMP, reviewed_by = 'auto' WHERE status = 'pending'",
        [],
    ).map_err(|e| e.to_string())?;

    // Build current project state from history
    let state = get_known_state(&conn)?;
    let file_count = state.len() as i64;

    let cp_id = format!("cp-{}", uuid::Uuid::new_v4());
    conn.execute(
        "INSERT INTO memory_checkpoints (id, name, file_count) VALUES (?1, ?2, ?3)",
        params![cp_id, name, file_count],
    ).map_err(|e| e.to_string())?;

    for (path, hash) in &state {
        conn.execute(
            "INSERT INTO checkpoint_files (checkpoint_id, file_path, content_hash) VALUES (?1,?2,?3)",
            params![cp_id, path, hash],
        ).map_err(|e| e.to_string())?;
    }

    Ok(cp_id)
}

/// List all checkpoints.
#[command]
pub fn memory_get_checkpoints(project_path: String) -> Result<Vec<MemoryCheckpoint>, String> {
    let conn = open_db(&project_path)?;
    ensure_schema(&conn)?;

    let mut stmt = conn.prepare(
        "SELECT id, name, timestamp, file_count FROM memory_checkpoints ORDER BY timestamp DESC"
    ).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        result.push(MemoryCheckpoint {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            timestamp: row.get(2).map_err(|e| e.to_string())?,
            file_count: row.get(3).map_err(|e| e.to_string())?,
        });
    }
    Ok(result)
}

/// Check if memory is initialized for a project path.
#[command]
pub fn memory_is_initialized(project_path: String) -> Result<bool, String> {
    let db = db_path(&project_path);
    Ok(db.exists())
}
