use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Deserialize, Serialize)]
struct IpcRequest {
    jsonrpc: String,
    method: String,
    params: serde_json::Value,
    id: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct IpcResponse {
    jsonrpc: String,
    result: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
    id: u64,
}

#[cfg(windows)]
pub async fn start_ipc_server(app_handle: AppHandle) {
    let pipe_name = r"\\.\pipe\nexora-ipc";
    println!("[IPC Server] Starting Windows Named Pipe server on {}", pipe_name);

    loop {
        use tokio::net::windows::named_pipe::ServerOptions;
        
        let server_result = ServerOptions::new()
            .first_pipe_instance(true)
            .create(pipe_name);
            
        let mut server = match server_result {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[IPC Server] Failed to create Named Pipe: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
        };

        // Wait for client connection
        if server.connect().await.is_ok() {
            let app = app_handle.clone();
            tokio::spawn(async move {
                let (reader, mut writer) = tokio::io::split(server);
                let mut reader = BufReader::new(reader);
                let mut line = String::new();
                
                while let Ok(n) = reader.read_line(&mut line).await {
                    if n == 0 { break; }
                    
                    let response = handle_request(&line, &app).await;
                    if let Ok(serialized) = serde_json::to_string(&response) {
                        let _ = writer.write_all(serialized.as_bytes()).await;
                        let _ = writer.write_all(b"\n").await;
                        let _ = writer.flush().await;
                    }
                    line.clear();
                }
            });
        }
    }
}

#[cfg(not(windows))]
pub async fn start_ipc_server(app_handle: AppHandle) {
    let socket_path = "/tmp/nexora.sock";
    let _ = std::fs::remove_file(socket_path);
    println!("[IPC Server] Starting Unix Domain Socket server on {}", socket_path);

    let listener = match tokio::net::UnixListener::bind(socket_path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[IPC Server] Failed to bind Unix Socket: {}", e);
            return;
        }
    };

    loop {
        if let Ok((stream, _)) = listener.accept().await {
            let app = app_handle.clone();
            tokio::spawn(async move {
                let (reader, mut writer) = tokio::io::split(stream);
                let mut reader = BufReader::new(reader);
                let mut line = String::new();
                
                while let Ok(n) = reader.read_line(&mut line).await {
                    if n == 0 { break; }
                    
                    let response = handle_request(&line, &app).await;
                    if let Ok(serialized) = serde_json::to_string(&response) {
                        let _ = writer.write_all(serialized.as_bytes()).await;
                        let _ = writer.write_all(b"\n").await;
                        let _ = writer.flush().await;
                    }
                    line.clear();
                }
            });
        }
    }
}

async fn handle_request(raw_line: &str, _app: &AppHandle) -> IpcResponse {
    let request: IpcRequest = match serde_json::from_str(raw_line) {
        Ok(req) => req,
        Err(e) => {
            return IpcResponse {
                jsonrpc: "2.0".to_string(),
                result: None,
                error: Some(serde_json::json!({
                    "code": -32700,
                    "message": format!("Parse error: {}", e)
                })),
                id: 0,
            };
        }
    };

    let result = match request.method.as_str() {
        "chat/send" => {
            let prompt = request.params.get("prompt").and_then(|p| p.as_str()).unwrap_or("");
            serde_json::json!({
                "status": "success",
                "reply": format!(
                    "Hello from Nexora Desktop Application!\nReceived prompt: '{}'\nSystem Status: Idle, ready to orchestrate workspace commands.",
                    prompt
                )
            })
        }
        "workspace/open" => {
            let path = request.params.get("path").and_then(|p| p.as_str()).unwrap_or(".");
            serde_json::json!({
                "status": "success",
                "path_opened": path,
                "session_id": "0190a6e7-1339-78b1-bbfa-6b9432658b10"
            })
        }
        _ => {
            return IpcResponse {
                jsonrpc: "2.0".to_string(),
                result: None,
                error: Some(serde_json::json!({
                    "code": -32601,
                    "message": "Method not found"
                })),
                id: request.id,
            };
        }
    };

    IpcResponse {
        jsonrpc: "2.0".to_string(),
        result: Some(result),
        error: None,
        id: request.id,
    }
}
