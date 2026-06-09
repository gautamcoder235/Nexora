use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::Path;
use globset::{Glob, GlobSetBuilder};

#[derive(Serialize, Deserialize)]
pub struct OwnershipValidationResult {
    pub is_valid: bool,
    pub violated_files: Vec<String>,
    pub modified_files: Vec<String>,
}

#[tauri::command]
pub fn validate_ownership(worktree_path: String, allowed_patterns: Vec<String>) -> Result<OwnershipValidationResult, String> {
    let root = Path::new(&worktree_path);

    if !root.exists() {
        return Err("Worktree path does not exist".to_string());
    }

    // 1. Get all modified, added, deleted, or untracked files
    // `git status --porcelain` gives us everything that has changed.
    let output = Command::new("git")
        .current_dir(root)
        .arg("status")
        .arg("--porcelain")
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        return Err(format!("git status failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let status_output = String::from_utf8_lossy(&output.stdout);
    let mut modified_files = Vec::new();

    for line in status_output.lines() {
        if line.len() > 3 {
            // git status --porcelain format: "XY filename"
            // We just need the filename part, which starts at index 3
            let filename = &line[3..];
            modified_files.push(filename.to_string());
        }
    }

    // If no files changed, automatically valid
    if modified_files.is_empty() {
        return Ok(OwnershipValidationResult {
            is_valid: true,
            violated_files: vec![],
            modified_files: vec![],
        });
    }

    // 2. Compile glob patterns
    let mut builder = GlobSetBuilder::new();
    for pattern in allowed_patterns {
        let glob = Glob::new(&pattern).map_err(|e| format!("Invalid glob pattern '{}': {}", pattern, e))?;
        builder.add(glob);
    }
    
    let globset = builder.build().map_err(|e| format!("Failed to compile globset: {}", e))?;

    // 3. Match modified files against patterns
    let mut violated_files = Vec::new();
    
    for file in &modified_files {
        // If the globset is empty, ANY modification is a violation.
        // If it's not empty, check if it matches.
        if !globset.is_match(file) {
            violated_files.push(file.clone());
        }
    }

    Ok(OwnershipValidationResult {
        is_valid: violated_files.is_empty(),
        violated_files,
        modified_files,
    })
}
