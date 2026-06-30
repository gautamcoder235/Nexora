use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use serde::{Deserialize, Serialize};

/// Isolation mode for a project — determines how agent sandboxes are created.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IsolationMode {
    /// Git-based isolation using worktrees (existing behavior)
    Git,
    /// File-copy-based isolation for non-git projects
    FileCopy,
}

/// Detects whether a project directory is a git repository.
pub fn detect_isolation_mode(project_path: &str) -> IsolationMode {
    let git_dir = Path::new(project_path).join(".git");
    if git_dir.exists() {
        IsolationMode::Git
    } else {
        IsolationMode::FileCopy
    }
}

/// Result of creating a file-copy sandbox.
#[derive(Debug, Serialize, Deserialize)]
pub struct SandboxResult {
    pub success: bool,
    pub sandbox_path: String,
    pub sandbox_id: String,
    pub error: Option<String>,
}

/// A manifest entry tracking a single file's hash in the sandbox.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileManifestEntry {
    pub relative_path: String,
    pub hash: String,
    pub size: u64,
}

/// A full directory manifest for change detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryManifest {
    pub entries: HashMap<String, FileManifestEntry>,
    pub total_files: usize,
    pub manifest_hash: String,
}

/// Computes a hash for a single file's contents.
fn hash_file_contents(path: &Path) -> Result<(String, u64), String> {
    let contents = fs::read(path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let size = contents.len() as u64;
    let mut hasher = DefaultHasher::new();
    contents.hash(&mut hasher);
    Ok((format!("{:x}", hasher.finish()), size))
}

/// Creates a directory manifest by hashing all files in a directory.
pub fn create_directory_manifest(dir_path: &str) -> Result<DirectoryManifest, String> {
    let root = Path::new(dir_path);
    if !root.exists() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }

    let mut entries = HashMap::new();
    walk_directory(root, root, &mut entries)?;

    let total_files = entries.len();

    // Create a combined hash of all entries for quick comparison
    let mut manifest_hasher = DefaultHasher::new();
    let mut sorted_keys: Vec<&String> = entries.keys().collect();
    sorted_keys.sort();
    for key in &sorted_keys {
        if let Some(entry) = entries.get(*key) {
            entry.hash.hash(&mut manifest_hasher);
        }
    }
    let manifest_hash = format!("{:x}", manifest_hasher.finish());

    Ok(DirectoryManifest {
        entries,
        total_files,
        manifest_hash,
    })
}

/// Recursively walks a directory and hashes all files.
fn walk_directory(
    current: &Path,
    root: &Path,
    entries: &mut HashMap<String, FileManifestEntry>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(current)
        .map_err(|e| format!("Failed to read dir {}: {}", current.display(), e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        // Skip hidden dirs, node_modules, target, .nexora dirs
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == ".nexora-sandboxes"
                || name == ".nexora-worktrees"
            {
                continue;
            }
        }

        if path.is_dir() {
            walk_directory(&path, root, entries)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");

            match hash_file_contents(&path) {
                Ok((hash, size)) => {
                    entries.insert(
                        relative.clone(),
                        FileManifestEntry {
                            relative_path: relative,
                            hash,
                            size,
                        },
                    );
                }
                Err(_) => {
                    // Skip files we can't read (binary locks, etc.)
                    continue;
                }
            }
        }
    }
    Ok(())
}

/// Creates a file-copy sandbox for a non-git project.
/// Instead of copying the entire project, it creates an empty sandbox directory
/// and a manifest of the original project for change detection.
pub fn create_sandbox(
    project_path: &str,
    task_id: &str,
    execution_id: &str,
) -> SandboxResult {
    let project_dir = Path::new(project_path);
    let sandboxes_dir = project_dir.join(".nexora-sandboxes");
    let sandbox_id = format!("task-{}-exec-{}", task_id, execution_id);
    let sandbox_path = sandboxes_dir.join(&sandbox_id);

    // Create sandbox directory
    if let Err(e) = fs::create_dir_all(&sandbox_path) {
        return SandboxResult {
            success: false,
            sandbox_path: String::new(),
            sandbox_id,
            error: Some(format!("Failed to create sandbox directory: {}", e)),
        };
    }

    // Create the .nexora contract directory inside sandbox
    let contract_dir = sandbox_path.join(".nexora");
    if let Err(e) = fs::create_dir_all(&contract_dir) {
        return SandboxResult {
            success: false,
            sandbox_path: String::new(),
            sandbox_id,
            error: Some(format!("Failed to create contract directory: {}", e)),
        };
    }

    // Create a baseline manifest of the original project
    match create_directory_manifest(project_path) {
        Ok(manifest) => {
            let manifest_json = serde_json::to_string_pretty(&manifest).unwrap_or_default();
            let manifest_path = contract_dir.join("baseline_manifest.json");
            if let Err(e) = fs::write(&manifest_path, &manifest_json) {
                return SandboxResult {
                    success: false,
                    sandbox_path: String::new(),
                    sandbox_id,
                    error: Some(format!("Failed to write baseline manifest: {}", e)),
                };
            }
        }
        Err(e) => {
            return SandboxResult {
                success: false,
                sandbox_path: String::new(),
                sandbox_id,
                error: Some(format!("Failed to create baseline manifest: {}", e)),
            };
        }
    }

    // Write isolation mode marker
    let mode_path = contract_dir.join("isolation_mode.txt");
    let _ = fs::write(&mode_path, "filecopy");

    let sandbox_path_str = sandbox_path.to_string_lossy().to_string();

    SandboxResult {
        success: true,
        sandbox_path: sandbox_path_str,
        sandbox_id,
        error: None,
    }
}

/// Removes a file-copy sandbox directory.
pub fn remove_sandbox(sandbox_path: &str) -> Result<(), String> {
    let path = Path::new(sandbox_path);
    if path.exists() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to remove sandbox {}: {}", sandbox_path, e))?;
    }
    Ok(())
}

/// Detects which files have changed in the project since the sandbox was created.
/// Compares the current project state against the baseline manifest.
pub fn detect_changed_files(
    project_path: &str,
    sandbox_path: &str,
) -> Result<Vec<String>, String> {
    let contract_dir = Path::new(sandbox_path).join(".nexora");
    let manifest_path = contract_dir.join("baseline_manifest.json");

    let manifest_json = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read baseline manifest: {}", e))?;
    let baseline: DirectoryManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Failed to parse baseline manifest: {}", e))?;

    let current = create_directory_manifest(project_path)?;

    let mut changed_files = Vec::new();

    // Find modified and new files
    for (path, current_entry) in &current.entries {
        match baseline.entries.get(path) {
            Some(baseline_entry) => {
                if baseline_entry.hash != current_entry.hash {
                    changed_files.push(path.clone());
                }
            }
            None => {
                // New file
                changed_files.push(path.clone());
            }
        }
    }

    // Find deleted files
    for path in baseline.entries.keys() {
        if !current.entries.contains_key(path) {
            changed_files.push(path.clone());
        }
    }

    Ok(changed_files)
}

/// Validates file ownership for a non-git project by comparing changed files
/// against allowed glob patterns.
pub fn validate_ownership_filecopy(
    project_path: &str,
    sandbox_path: &str,
    allowed_patterns: Vec<String>,
) -> Result<crate::swarm_ownership::OwnershipValidationResult, String> {
    let changed_files = detect_changed_files(project_path, sandbox_path)?;

    // Build glob set from patterns
    let mut glob_builder = globset::GlobSetBuilder::new();
    for pattern in &allowed_patterns {
        let glob = globset::Glob::new(pattern)
            .map_err(|e| format!("Invalid glob pattern '{}': {}", pattern, e))?;
        glob_builder.add(glob);
    }
    let glob_set = glob_builder
        .build()
        .map_err(|e| format!("Failed to build glob set: {}", e))?;

    let mut violated_files = Vec::new();
    let mut valid_files = Vec::new();

    for file_path in &changed_files {
        if glob_set.is_match(file_path) {
            valid_files.push(file_path.clone());
        } else {
            violated_files.push(file_path.clone());
        }
    }

    Ok(crate::swarm_ownership::OwnershipValidationResult {
        is_valid: violated_files.is_empty(),
        modified_files: valid_files,
        violated_files,
    })
}

/// Merges changes from a non-git sandbox back into the project.
/// Only copies files that have actually changed (file-watcher approach).
pub fn merge_sandbox_changes(
    project_path: &str,
    sandbox_path: &str,
) -> Result<Vec<String>, String> {
    let changed_files = detect_changed_files(project_path, sandbox_path)?;

    if changed_files.is_empty() {
        return Ok(Vec::new());
    }

    let project_dir = Path::new(project_path);
    let mut merged_files = Vec::new();

    // Create backup before merging
    let backup_dir = std::env::temp_dir().join(format!(
        "nexora-sandbox-backup-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    // Backup existing files that will be overwritten
    for file_path in &changed_files {
        let full_path = project_dir.join(file_path);
        if full_path.exists() {
            let backup_path = backup_dir.join(file_path);
            if let Some(parent) = backup_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(&full_path, &backup_path);
        }
    }

    // The changed files are already in the project directory
    // (since file-watcher mode means agents edit files in-place)
    // We just need to track what changed for the audit trail
    for file_path in &changed_files {
        merged_files.push(file_path.clone());
    }

    // Clean up backup on success
    let _ = fs::remove_dir_all(&backup_dir);

    Ok(merged_files)
}

/// Rolls back sandbox merge by restoring files from backup.
pub fn rollback_sandbox_merge(
    project_path: &str,
    backup_dir: &Path,
    changed_files: &[String],
) {
    let project_dir = Path::new(project_path);
    for file_path in changed_files {
        let full_path = project_dir.join(file_path);
        let backup_path = backup_dir.join(file_path);
        if backup_path.exists() {
            if let Some(parent) = full_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(&backup_path, &full_path);
        } else if full_path.exists() {
            // File didn't exist before, remove it
            let _ = fs::remove_file(&full_path);
        }
    }
}

// ==========================================
// Tauri Commands
// ==========================================

#[tauri::command]
pub fn detect_project_type(project_path: String) -> Result<serde_json::Value, String> {
    let mode = detect_isolation_mode(&project_path);
    Ok(serde_json::json!({
        "isGit": mode == IsolationMode::Git,
        "isolationMode": match mode {
            IsolationMode::Git => "git",
            IsolationMode::FileCopy => "filecopy",
        }
    }))
}
