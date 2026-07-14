use rusqlite::params;
use crate::memory::models::{TimelineEntry, FileOperation};

pub fn get_timeline_history(project_path: &str) -> Result<Vec<TimelineEntry>, String> {
    let conn = super::database::open_memory_db(project_path)?;
    super::database::initialize_db_schema(&conn)?;

    let mut stmt = conn.prepare(
        "SELECT c.id, c.session_id, c.git_commit_hash, c.type, c.source, c.description, c.timestamp, c.status,
                s.source, s.description
         FROM commits c
         LEFT JOIN sessions s ON s.id = c.session_id
         ORDER BY c.timestamp DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(TimelineEntry {
            id: row.get(0)?,
            session_id: row.get(1)?,
            git_commit_hash: row.get(2)?,
            r#type: row.get(3)?,
            source: row.get(4)?,
            description: row.get(5)?,
            timestamp: row.get(6)?,
            status: row.get(7)?,
            files: Vec::new(),
            session_source: row.get(8)?,
            session_desc: row.get(9)?,
            project_path: project_path.to_string(),
        })
    }).map_err(|e| e.to_string())?;

    let mut history = Vec::new();
    for entry_res in rows {
        if let Ok(mut entry) = entry_res {
            // Find files for this commit
            let mut file_stmt = conn.prepare(
                "SELECT id, file_path, operation_type, old_path FROM operations WHERE commit_id = ?1"
            ).map_err(|e| e.to_string())?;
            
            let file_rows = file_stmt.query_map(params![entry.id], |r| {
                Ok(FileOperation {
                    id: r.get(0)?,
                    file_path: r.get(1)?,
                    operation_type: r.get(2)?,
                    old_path: r.get(3)?,
                })
            }).map_err(|e| e.to_string())?;

            for f in file_rows {
                if let Ok(file_op) = f {
                    entry.files.push(file_op);
                }
            }

            history.push(entry);
        }
    }

    Ok(history)
}
