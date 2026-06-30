use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SymbolInfo {
    pub name: String,
    pub kind: String, // "function" | "struct" | "class" | "interface" | "enum"
    pub file_path: String,
    pub line_number: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RepoFileMap {
    pub file_path: String,
    pub size_bytes: u64,
    pub imports: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkspaceIndex {
    pub schema_version: u32,
    pub project_path: String,
    pub symbols: Vec<SymbolInfo>,
    pub files: Vec<RepoFileMap>,
    pub last_indexed_at: i64,
}

pub fn get_index_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".nexora").join("index")
}

pub fn get_index_file(project_path: &str) -> PathBuf {
    get_index_dir(project_path).join("index.json")
}

pub fn run_indexing(project_path: &str) -> Result<WorkspaceIndex, String> {
    let root = Path::new(project_path);
    if !root.exists() || !root.is_dir() {
        return Err("Project directory does not exist".to_string());
    }

    let mut symbols = Vec::new();
    let mut files = Vec::new();

    // Traverse directory recursively
    traverse_dir(root, root, &mut symbols, &mut files)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let index = WorkspaceIndex {
        schema_version: 1,
        project_path: project_path.to_string(),
        symbols,
        files,
        last_indexed_at: now,
    };

    // Save index
    let index_dir = get_index_dir(project_path);
    fs::create_dir_all(&index_dir).map_err(|e| e.to_string())?;
    
    let path = get_index_file(project_path);
    let json = serde_json::to_string_pretty(&index).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;

    Ok(index)
}

fn traverse_dir(
    root: &Path,
    dir: &Path,
    symbols: &mut Vec<SymbolInfo>,
    files: &mut Vec<RepoFileMap>,
) -> Result<(), String> {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
                // Skip ignored directories
                if name.starts_with('.') 
                    || name == "node_modules" 
                    || name == "target" 
                    || name == "dist" 
                    || name == "build"
                    || name == ".next"
                {
                    continue;
                }
                traverse_dir(root, &path, symbols, files)?;
            } else if path.is_file() {
                let rel_path = path.strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                if ext == "rs" || ext == "ts" || ext == "tsx" || ext == "js" || ext == "jsx" || ext == "py" {
                    if let Ok(metadata) = fs::metadata(&path) {
                        let size_bytes = metadata.len();
                        if let Ok(content) = fs::read_to_string(&path) {
                            let (file_symbols, imports) = parse_file_content(&content, &rel_path, ext);
                            symbols.extend(file_symbols);
                            files.push(RepoFileMap {
                                file_path: rel_path,
                                size_bytes,
                                imports,
                            });
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn parse_file_content(content: &str, file_path: &str, ext: &str) -> (Vec<SymbolInfo>, Vec<String>) {
    let mut symbols = Vec::new();
    let mut imports = Vec::new();

    for (idx, line) in content.lines().enumerate() {
        let line_num = idx + 1;
        let trimmed = line.trim();

        // 1. Parse Imports
        if ext == "rs" {
            if trimmed.starts_with("use ") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    imports.push(parts[1].trim_end_matches(';').to_string());
                }
            }
        } else if ext == "ts" || ext == "tsx" || ext == "js" || ext == "jsx" {
            if trimmed.starts_with("import ") {
                if let Some(from_idx) = trimmed.find(" from ") {
                    let from_part = &trimmed[from_idx + 6..];
                    let import_path = from_part.trim().trim_matches('\'').trim_matches('"').trim_end_matches(';').to_string();
                    imports.push(import_path);
                } else {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 2 {
                        imports.push(parts[1].trim_end_matches(';').trim_matches('\'').trim_matches('"').to_string());
                    }
                }
            } else if trimmed.contains("require(") {
                if let Some(req_idx) = trimmed.find("require(") {
                    let sub = &trimmed[req_idx + 8..];
                    if let Some(end_idx) = sub.find(')') {
                        let import_path = sub[..end_idx].trim().trim_matches('\'').trim_matches('"').to_string();
                        imports.push(import_path);
                    }
                }
            }
        } else if ext == "py" {
            if trimmed.starts_with("import ") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    imports.push(parts[1].to_string());
                }
            } else if trimmed.starts_with("from ") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    imports.push(parts[1].to_string());
                }
            }
        }

        // 2. Parse Symbols
        if ext == "rs" {
            if trimmed.contains("fn ") {
                if let Some(name) = extract_next_word(trimmed, "fn ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "function".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            } else if trimmed.contains("struct ") {
                if let Some(name) = extract_next_word(trimmed, "struct ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "struct".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            } else if trimmed.contains("enum ") {
                if let Some(name) = extract_next_word(trimmed, "enum ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "enum".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            } else if trimmed.contains("trait ") {
                if let Some(name) = extract_next_word(trimmed, "trait ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "interface".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            }
        } else if ext == "ts" || ext == "tsx" || ext == "js" || ext == "jsx" {
            if trimmed.contains("class ") {
                if let Some(name) = extract_next_word(trimmed, "class ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "class".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            } else if trimmed.contains("function ") {
                if let Some(name) = extract_next_word(trimmed, "function ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "function".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            } else if trimmed.contains("interface ") {
                if let Some(name) = extract_next_word(trimmed, "interface ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "interface".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            } else if trimmed.contains("type ") && (trimmed.contains('=') || trimmed.contains('{')) {
                if let Some(name) = extract_next_word(trimmed, "type ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "interface".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            } else if trimmed.contains("enum ") {
                if let Some(name) = extract_next_word(trimmed, "enum ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "enum".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            }
        } else if ext == "py" {
            if trimmed.starts_with("def ") {
                if let Some(name) = extract_next_word(trimmed, "def ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "function".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            } else if trimmed.starts_with("class ") {
                if let Some(name) = extract_next_word(trimmed, "class ") {
                    symbols.push(SymbolInfo {
                        name,
                        kind: "class".to_string(),
                        file_path: file_path.to_string(),
                        line_number: line_num,
                    });
                }
            }
        }
    }

    (symbols, imports)
}

fn extract_next_word(line: &str, keyword: &str) -> Option<String> {
    if let Some(idx) = line.find(keyword) {
        let after = &line[idx + keyword.len()..];
        let word = after.split(|c: char| c.is_whitespace() || c == '(' || c == '{' || c == '<' || c == ':' || c == ';' || c == '=')
            .next()
            .unwrap_or("");
        
        let cleaned = word.trim().to_string();
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    None
}

// ==========================================
// Tauri Commands
// ==========================================

#[tauri::command]
pub fn index_workspace(project_path: String) -> Result<WorkspaceIndex, String> {
    run_indexing(&project_path)
}

#[tauri::command]
pub fn get_symbols(project_path: String) -> Result<Vec<SymbolInfo>, String> {
    let path = get_index_file(&project_path);
    if !path.exists() {
        let index = run_indexing(&project_path)?;
        return Ok(index.symbols);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let index: WorkspaceIndex = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(index.symbols)
}

#[tauri::command]
pub fn get_repo_map(project_path: String) -> Result<Vec<RepoFileMap>, String> {
    let path = get_index_file(&project_path);
    if !path.exists() {
        let index = run_indexing(&project_path)?;
        return Ok(index.files);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let index: WorkspaceIndex = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(index.files)
}
