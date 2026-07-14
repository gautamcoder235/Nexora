use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimelineEntry {
    pub id: String,
    pub session_id: Option<String>,
    pub git_commit_hash: String,
    pub r#type: String,         // snapshot | checkpoint | ai | restore
    pub source: String,       // user | agent | terminal | external
    pub description: Option<String>,
    pub timestamp: String,
    pub status: String,        // pending | approved | rejected
    pub files: Vec<FileOperation>,
    pub session_source: Option<String>,
    pub session_desc: Option<String>,
    pub project_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileOperation {
    pub id: String,
    pub file_path: String,
    pub operation_type: String, // created | modified | deleted | renamed
    pub old_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemorySession {
    pub id: String,
    pub source: String,
    pub description: Option<String>,
    pub started: String,
    pub ended: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HunkSelection {
    pub file_path: String,
    pub approved: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectConfig {
    pub project_id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupMetadata {
    pub project_id: String,
    pub name: String,
    pub original_path: String,
    pub timestamp: String,
    pub repo_bundle_hash: String,
    pub memory_db_hash: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MissingProject {
    pub id: String,
    pub name: String,
    pub original_path: String,
    pub last_backup: String,
    pub status: String, // "healthy" | "corrupted" | "missing"
}
