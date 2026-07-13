use std::collections::{HashMap, HashSet};
use crate::ucte::provider::FileMeta;

#[derive(Clone, Debug, serde::Serialize)]
pub struct FileDiff {
    pub path: String,
    pub status: String, // "added" | "deleted" | "modified" | "renamed" | "moved" | "conflict"
    pub old_path: Option<String>,
    pub patch: String,
    pub size_delta: i64,
}

pub fn compare_snapshots(
    files_a: &[FileMeta],
    files_b: &[FileMeta],
    content_provider_a: impl Fn(&str) -> Result<String, String>,
    content_provider_b: impl Fn(&str) -> Result<String, String>,
) -> Vec<FileDiff> {
    let map_a: HashMap<String, &FileMeta> = files_a.iter().map(|f| (f.path.clone(), f)).collect();
    let map_b: HashMap<String, &FileMeta> = files_b.iter().map(|f| (f.path.clone(), f)).collect();

    let mut diffs = Vec::new();
    let mut deleted_files = Vec::new();
    let mut added_files = Vec::new();

    // 1. Detect deletes and modifications
    for (path, meta_a) in &map_a {
        if let Some(meta_b) = map_b.get(path) {
            if meta_a.size != meta_b.size || meta_a.mtime != meta_b.mtime {
                let old_content = content_provider_a(path).unwrap_or_default();
                let new_content = content_provider_b(path).unwrap_or_default();
                if old_content != new_content {
                    let patch = generate_unified_diff(path, &old_content, &new_content);
                    diffs.push(FileDiff {
                        path: path.clone(),
                        status: "modified".to_string(),
                        old_path: None,
                        patch,
                        size_delta: (meta_b.size as i64) - (meta_a.size as i64),
                    });
                }
            }
        } else {
            deleted_files.push(*meta_a);
        }
    }

    // 2. Detect additions
    for (path, meta_b) in &map_b {
        if !map_a.contains_key(path) {
            added_files.push(*meta_b);
        }
    }

    // 3. Rename & Move Detection
    let mut matched_adds = HashSet::new();
    let mut matched_deletes = HashSet::new();

    for meta_del in &deleted_files {
        let old_content = content_provider_a(&meta_del.path).unwrap_or_default();
        
        for (add_idx, meta_add) in added_files.iter().enumerate() {
            if matched_adds.contains(&add_idx) {
                continue;
            }
            
            if meta_del.size == meta_add.size {
                let new_content = content_provider_b(&meta_add.path).unwrap_or_default();
                if old_content == new_content {
                    diffs.push(FileDiff {
                        path: meta_add.path.clone(),
                        status: "renamed".to_string(),
                        old_path: Some(meta_del.path.clone()),
                        patch: format!("Rename from {} to {}", meta_del.path, meta_add.path),
                        size_delta: 0,
                    });
                    matched_adds.insert(add_idx);
                    matched_deletes.insert(meta_del.path.clone());
                    break;
                }
            }
        }
    }

    // 4. Remaining additions and deletions
    for (idx, meta_add) in added_files.iter().enumerate() {
        if !matched_adds.contains(&idx) {
            let content = content_provider_b(&meta_add.path).unwrap_or_default();
            let patch = generate_unified_diff(&meta_add.path, "", &content);
            diffs.push(FileDiff {
                path: meta_add.path.clone(),
                status: "added".to_string(),
                old_path: None,
                patch,
                size_delta: meta_add.size as i64,
            });
        }
    }

    for meta_del in &deleted_files {
        if !matched_deletes.contains(&meta_del.path) {
            let content = content_provider_a(&meta_del.path).unwrap_or_default();
            let patch = generate_unified_diff(&meta_del.path, &content, "");
            diffs.push(FileDiff {
                path: meta_del.path.clone(),
                status: "deleted".to_string(),
                old_path: None,
                patch,
                size_delta: -(meta_del.size as i64),
            });
        }
    }

    diffs
}

pub fn generate_unified_diff(filename: &str, old: &str, new: &str) -> String {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();

    let mut patch = format!("diff --git a/{} b/{}\n", filename, filename);
    patch.push_str("--- a/\n+++ b/\n");

    let mut i = 0;
    let mut j = 0;

    while i < old_lines.len() || j < new_lines.len() {
        if i < old_lines.len() && j < new_lines.len() {
            if old_lines[i] == new_lines[j] {
                patch.push_str(&format!(" {}\n", old_lines[i]));
                i += 1;
                j += 1;
            } else {
                let mut match_found = false;
                for lookahead in 1..5 {
                    if i + lookahead < old_lines.len() && old_lines[i + lookahead] == new_lines[j] {
                        for k in 0..lookahead {
                            patch.push_str(&format!("-{}\n", old_lines[i + k]));
                        }
                        i += lookahead;
                        match_found = true;
                        break;
                    }
                    if j + lookahead < new_lines.len() && old_lines[i] == new_lines[j + lookahead] {
                        for k in 0..lookahead {
                            patch.push_str(&format!("+{}\n", new_lines[j + k]));
                        }
                        j += lookahead;
                        match_found = true;
                        break;
                    }
                }
                if !match_found {
                    patch.push_str(&format!("-{}\n", old_lines[i]));
                    patch.push_str(&format!("+{}\n", new_lines[j]));
                    i += 1;
                    j += 1;
                }
            }
        } else if i < old_lines.len() {
            patch.push_str(&format!("-{}\n", old_lines[i]));
            i += 1;
        } else {
            patch.push_str(&format!("+{}\n", new_lines[j]));
            j += 1;
        }
    }

    patch
}
