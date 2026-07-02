use serde_json::Value;
use std::fs;
use std::path::Path;
use anyhow::Result;
use crate::ai::tools::registry::Tool;

pub struct WriteFileTool;

#[async_trait::async_trait]
impl Tool for WriteFileTool {
    fn name(&self) -> &'static str {
        "write_file"
    }

    fn description(&self) -> &'static str {
        "Writes content to a file on the local filesystem. This can be used to create new files or edit existing ones."
    }

    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "The absolute or relative path to the file you want to edit/create."
                },
                "content": {
                    "type": "string",
                    "description": "The exact content to write into the file. This will completely overwrite the file's current contents."
                }
            },
            "required": ["file_path", "content"]
        })
    }

    fn permissions(&self) -> Vec<String> {
        vec!["fs:write".to_string()]
    }

    async fn execute(&self, args: Value) -> Result<Value> {
        let file_path = args.get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing or invalid 'file_path' argument"))?;
            
        let content = args.get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing or invalid 'content' argument"))?;

        let path = Path::new(file_path);
        
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        fs::write(path, content)?;

        Ok(serde_json::json!({
            "status": "success",
            "message": format!("Successfully wrote {} bytes to '{}'", content.len(), file_path)
        }))
    }
}
