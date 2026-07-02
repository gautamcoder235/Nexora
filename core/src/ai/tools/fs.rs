use serde_json::Value;
use std::fs;
use std::path::Path;
use anyhow::Result;
use crate::ai::tools::registry::Tool;

pub struct WriteFileTool;
#[async_trait::async_trait]
impl Tool for WriteFileTool {
    fn name(&self) -> &'static str { "write_file" }
    fn description(&self) -> &'static str { "Writes content to a file on the local filesystem. This can be used to create new files or edit existing ones." }
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "file_path": { "type": "string" },
                "content": { "type": "string" }
            },
            "required": ["file_path", "content"]
        })
    }
    fn permissions(&self) -> Vec<String> { vec!["fs:write".to_string()] }
    async fn execute(&self, args: Value) -> Result<Value> {
        let file_path = args.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
        let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let path = Path::new(file_path);
        if let Some(parent) = path.parent() {
            if !parent.exists() { fs::create_dir_all(parent)?; }
        }
        fs::write(path, content)?;
        Ok(serde_json::json!({ "status": "success", "message": format!("Successfully wrote to '{}'", file_path) }))
    }
}

pub struct ReadFileTool;
#[async_trait::async_trait]
impl Tool for ReadFileTool {
    fn name(&self) -> &'static str { "read_file" }
    fn description(&self) -> &'static str { "Reads the contents of a file on the local filesystem." }
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": { "file_path": { "type": "string" } },
            "required": ["file_path"]
        })
    }
    fn permissions(&self) -> Vec<String> { vec!["fs:read".to_string()] }
    async fn execute(&self, args: Value) -> Result<Value> {
        let file_path = args.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
        let content = fs::read_to_string(file_path)?;
        Ok(serde_json::json!({ "content": content }))
    }
}

pub struct ReplaceFileContentTool;
#[async_trait::async_trait]
impl Tool for ReplaceFileContentTool {
    fn name(&self) -> &'static str { "replace_file_content" }
    fn description(&self) -> &'static str { "Surgically replaces a specific exact string with a new string in a file." }
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "file_path": { "type": "string" },
                "target_content": { "type": "string" },
                "replacement_content": { "type": "string" }
            },
            "required": ["file_path", "target_content", "replacement_content"]
        })
    }
    fn permissions(&self) -> Vec<String> { vec!["fs:write".to_string()] }
    async fn execute(&self, args: Value) -> Result<Value> {
        let file_path = args.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
        let target = args.get("target_content").and_then(|v| v.as_str()).unwrap_or("");
        let replace = args.get("replacement_content").and_then(|v| v.as_str()).unwrap_or("");
        let mut content = fs::read_to_string(file_path)?;
        if !content.contains(target) {
            return Err(anyhow::anyhow!("Target content not found in file."));
        }
        content = content.replace(target, replace);
        fs::write(file_path, content)?;
        Ok(serde_json::json!({ "status": "success", "message": "Content replaced successfully" }))
    }
}

pub struct ListDirTool;
#[async_trait::async_trait]
impl Tool for ListDirTool {
    fn name(&self) -> &'static str { "list_dir" }
    fn description(&self) -> &'static str { "Lists files in a directory recursively, ignoring .git and target folders." }
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": { "dir_path": { "type": "string" } },
            "required": ["dir_path"]
        })
    }
    fn permissions(&self) -> Vec<String> { vec!["fs:read".to_string()] }
    async fn execute(&self, args: Value) -> Result<Value> {
        let dir_path = args.get("dir_path").and_then(|v| v.as_str()).unwrap_or("");
        let mut results = Vec::new();
        fn walk(dir: &Path, results: &mut Vec<String>) {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name == ".git" || name == "target" || name == "node_modules" { continue; }
                    results.push(path.to_string_lossy().to_string());
                    if path.is_dir() { walk(&path, results); }
                }
            }
        }
        walk(Path::new(dir_path), &mut results);
        Ok(serde_json::json!({ "files": results }))
    }
}

pub struct GrepSearchTool;
#[async_trait::async_trait]
impl Tool for GrepSearchTool {
    fn name(&self) -> &'static str { "grep_search" }
    fn description(&self) -> &'static str { "Searches for a string pattern across files in a directory." }
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "dir_path": { "type": "string" },
                "query": { "type": "string" }
            },
            "required": ["dir_path", "query"]
        })
    }
    fn permissions(&self) -> Vec<String> { vec!["fs:read".to_string()] }
    async fn execute(&self, args: Value) -> Result<Value> {
        let dir_path = args.get("dir_path").and_then(|v| v.as_str()).unwrap_or("");
        let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
        let mut matches = Vec::new();
        
        fn search(dir: &Path, query: &str, matches: &mut Vec<String>) {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name == ".git" || name == "target" || name == "node_modules" { continue; }
                    if path.is_dir() {
                        search(&path, query, matches);
                    } else if let Ok(content) = fs::read_to_string(&path) {
                        for (i, line) in content.lines().enumerate() {
                            if line.contains(query) {
                                matches.push(format!("{}:{}: {}", path.to_string_lossy(), i + 1, line.trim()));
                            }
                        }
                    }
                }
            }
        }
        search(Path::new(dir_path), query, &mut matches);
        
        if matches.len() > 100 {
            matches.truncate(100);
            matches.push("... (truncated to 100 matches)".to_string());
        }
        
        Ok(serde_json::json!({ "matches": matches }))
    }
}
