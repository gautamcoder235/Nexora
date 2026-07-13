use rusqlite::{Connection, Result, params};
use crate::ucte::provider::FileMeta;

#[derive(Clone, Debug, serde::Serialize)]
pub struct UcteWorkspace {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub root: String,
    pub created: String,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct UcteSnapshot {
    pub id: String,
    pub workspace_id: String,
    pub parent_snapshot_id: Option<String>,
    pub created: String,
    pub scan_duration_ms: i64,
    pub total_files: i64,
}

pub fn db_create_workspace(
    conn: &Connection,
    id: &str,
    name: &str,
    provider: &str,
    root: &str,
) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO ucte_workspaces (id, name, provider, root) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, provider, root],
    )?;
    Ok(())
}

pub fn db_get_workspace(conn: &Connection, id: &str) -> Result<Option<UcteWorkspace>> {
    let mut stmt = conn.prepare("SELECT id, name, provider, root, created FROM ucte_workspaces WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(UcteWorkspace {
            id: row.get(0)?,
            name: row.get(1)?,
            provider: row.get(2)?,
            root: row.get(3)?,
            created: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn db_create_snapshot(
    conn: &Connection,
    id: &str,
    workspace_id: &str,
    parent_snapshot_id: Option<&str>,
    scan_duration_ms: i64,
    total_files: i64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO ucte_snapshots (id, workspace_id, parent_snapshot_id, scan_duration_ms, total_files) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, workspace_id, parent_snapshot_id, scan_duration_ms, total_files],
    )?;
    Ok(())
}

pub fn db_add_file(
    conn: &Connection,
    id: &str,
    snapshot_id: &str,
    path: &str,
    size: i64,
    mtime: i64,
    hash: &str,
    mode: i32,
    encoding: &str,
    file_type: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO ucte_files (id, snapshot_id, path, size, mtime, hash, mode, encoding, type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, snapshot_id, path, size, mtime, hash, mode, encoding, file_type],
    )?;
    Ok(())
}

pub fn db_add_chunk(
    conn: &Connection,
    id: &str,
    file_id: &str,
    chunk_index: i32,
    hash: &str,
    offset: i64,
    length: i64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO ucte_chunks (id, file_id, chunk_index, hash, offset_bytes, length_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, file_id, chunk_index, hash, offset, length],
    )?;
    Ok(())
}

pub fn db_get_latest_snapshot(conn: &Connection, workspace_id: &str) -> Result<Option<UcteSnapshot>> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, parent_snapshot_id, created, scan_duration_ms, total_files 
         FROM ucte_snapshots 
         WHERE workspace_id = ?1 
         ORDER BY created DESC LIMIT 1"
    )?;
    let mut rows = stmt.query(params![workspace_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(UcteSnapshot {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            parent_snapshot_id: row.get(2)?,
            created: row.get(3)?,
            scan_duration_ms: row.get(4)?,
            total_files: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn db_get_snapshot_files(conn: &Connection, snapshot_id: &str) -> Result<Vec<FileMeta>> {
    let mut stmt = conn.prepare("SELECT path, size, mtime FROM ucte_files WHERE snapshot_id = ?1")?;
    let mut rows = stmt.query(params![snapshot_id])?;
    let mut files = Vec::new();
    while let Some(row) = rows.next()? {
        let path: String = row.get(0)?;
        let size: i64 = row.get(1)?;
        let mtime: i64 = row.get(2)?;
        files.push(FileMeta {
            path,
            size: size as u64,
            mtime: mtime as u64,
            is_dir: false,
        });
    }
    Ok(files)
}

pub fn db_find_cached_hash(
    conn: &Connection,
    workspace_id: &str,
    path: &str,
    size: i64,
    mtime: i64,
) -> Result<Option<String>> {
    let mut stmt = conn.prepare(
        "SELECT f.hash 
         FROM ucte_files f
         JOIN ucte_snapshots s ON f.snapshot_id = s.id
         WHERE s.workspace_id = ?1 AND f.path = ?2 AND f.size = ?3 AND f.mtime = ?4
         LIMIT 1"
    )?;
    let mut rows = stmt.query(params![workspace_id, path, size, mtime])?;
    if let Some(row) = rows.next()? {
        let hash: String = row.get(0)?;
        Ok(Some(hash))
    } else {
        Ok(None)
    }
}
