use std::io::Write;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use nexora_core::error::NexoraError;

#[derive(Debug, Serialize, Deserialize)]
pub struct IpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
    pub id: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IpcResponse {
    pub jsonrpc: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
    pub id: u64,
}

pub trait IpcConnection: Send + Sync {
    fn connect(&mut self, timeout: Duration) -> Result<(), NexoraError>;
    fn send(&mut self, request: &IpcRequest) -> Result<IpcResponse, NexoraError>;
    fn send_streaming(&mut self, request: &IpcRequest, callback: &mut dyn FnMut(IpcResponse) -> bool) -> Result<(), NexoraError>;
    fn is_connected(&self) -> bool;
}

#[cfg(windows)]
pub struct NativeIpcConnection {
    pipe_name: String,
    stream: Option<std::fs::File>,
}

#[cfg(windows)]
impl NativeIpcConnection {
    pub fn new(pipe_name: &str) -> Self {
        Self {
            pipe_name: format!(r"\\.\pipe\{}", pipe_name),
            stream: None,
        }
    }
}

#[cfg(windows)]
impl IpcConnection for NativeIpcConnection {
    fn connect(&mut self, _timeout: Duration) -> Result<(), NexoraError> {
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&self.pipe_name)
            .map_err(|e| NexoraError::IpcError {
                message: format!("Failed to connect to Named Pipe '{}': {}", self.pipe_name, e),
                details: Some(e.to_string()),
            })?;
        
        self.stream = Some(file);
        Ok(())
    }

    fn send(&mut self, request: &IpcRequest) -> Result<IpcResponse, NexoraError> {
        let stream = self.stream.as_mut().ok_or_else(|| NexoraError::IpcError {
            message: "Not connected to IPC named pipe".to_string(),
            details: None,
        })?;

        let payload = serde_json::to_vec(request).map_err(|e| NexoraError::IpcError {
            message: "Failed to serialize IPC request".to_string(),
            details: Some(e.to_string()),
        })?;

        stream.write_all(&payload).map_err(|e| NexoraError::IpcError {
            message: "Failed to write to Named Pipe stream".to_string(),
            details: Some(e.to_string()),
        })?;
        stream.write_all(b"\n").map_err(|e| NexoraError::IpcError {
            message: "Failed to write newline separator to pipe".to_string(),
            details: Some(e.to_string()),
        })?;
        stream.flush().ok();

        // Read response
        let mut reader = std::io::BufReader::new(stream);
        let mut line = String::new();
        use std::io::BufRead;
        reader.read_line(&mut line).map_err(|e| NexoraError::IpcError {
            message: "Failed to read response from Named Pipe".to_string(),
            details: Some(e.to_string()),
        })?;

        let response = serde_json::from_str(&line).map_err(|e| NexoraError::IpcError {
            message: "Failed to parse IPC response JSON".to_string(),
            details: Some(e.to_string()),
        })?;

        Ok(response)
    }

    fn send_streaming(&mut self, request: &IpcRequest, callback: &mut dyn FnMut(IpcResponse) -> bool) -> Result<(), NexoraError> {
        let stream = self.stream.as_mut().ok_or_else(|| NexoraError::IpcError {
            message: "Not connected to IPC named pipe".to_string(),
            details: None,
        })?;

        let payload = serde_json::to_vec(request).map_err(|e| NexoraError::IpcError {
            message: "Failed to serialize IPC request".to_string(),
            details: Some(e.to_string()),
        })?;

        stream.write_all(&payload).map_err(|e| NexoraError::IpcError {
            message: "Failed to write to Named Pipe stream".to_string(),
            details: Some(e.to_string()),
        })?;
        stream.write_all(b"\n").map_err(|e| NexoraError::IpcError {
            message: "Failed to write newline separator to pipe".to_string(),
            details: Some(e.to_string()),
        })?;
        stream.flush().ok();

        // Read streaming responses
        let mut reader = std::io::BufReader::new(stream);
        use std::io::BufRead;
        loop {
            let mut line = String::new();
            if let Ok(n) = reader.read_line(&mut line) {
                if n == 0 { break; }
                if let Ok(response) = serde_json::from_str::<IpcResponse>(&line) {
                    let should_continue = callback(response);
                    if !should_continue { break; }
                }
            } else {
                break;
            }
        }
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.stream.is_some()
    }
}

#[cfg(unix)]
pub struct NativeIpcConnection {
    socket_path: String,
    stream: Option<std::os::unix::net::UnixStream>,
}

#[cfg(unix)]
impl NativeIpcConnection {
    pub fn new(socket_path: &str) -> Self {
        Self {
            socket_path: socket_path.to_string(),
            stream: None,
        }
    }
}

#[cfg(unix)]
impl IpcConnection for NativeIpcConnection {
    fn connect(&mut self, _timeout: Duration) -> Result<(), NexoraError> {
        let stream = std::os::unix::net::UnixStream::connect(&self.socket_path).map_err(|e| {
            NexoraError::IpcError {
                message: format!("Failed to connect to UNIX Socket '{}': {}", self.socket_path, e),
                details: Some(e.to_string()),
            }
        })?;
        
        self.stream = Some(stream);
        Ok(())
    }

    fn send(&mut self, request: &IpcRequest) -> Result<IpcResponse, NexoraError> {
        let stream = self.stream.as_mut().ok_or_else(|| NexoraError::IpcError {
            message: "Not connected to UNIX Socket".to_string(),
            details: None,
        })?;

        let payload = serde_json::to_vec(request).map_err(|e| NexoraError::IpcError {
            message: "Failed to serialize IPC request".to_string(),
            details: Some(e.to_string()),
        })?;

        stream.write_all(&payload).map_err(|e| NexoraError::IpcError {
            message: "Failed to write to UNIX socket".to_string(),
            details: Some(e.to_string()),
        })?;
        stream.write_all(b"\n").map_err(|e| NexoraError::IpcError {
            message: "Failed to write newline separator to socket".to_string(),
            details: Some(e.to_string()),
        })?;
        stream.flush().ok();

        // Read response
        let mut reader = std::io::BufReader::new(stream);
        let mut line = String::new();
        use std::io::BufRead;
        reader.read_line(&mut line).map_err(|e| NexoraError::IpcError {
            message: "Failed to read response from UNIX socket".to_string(),
            details: Some(e.to_string()),
        })?;

        let response = serde_json::from_str(&line).map_err(|e| NexoraError::IpcError {
            message: "Failed to parse IPC response JSON".to_string(),
            details: Some(e.to_string()),
        })?;

        Ok(response)
    }

    fn send_streaming(&mut self, request: &IpcRequest, callback: &mut dyn FnMut(IpcResponse) -> bool) -> Result<(), NexoraError> {
        let stream = self.stream.as_mut().ok_or_else(|| NexoraError::IpcError {
            message: "Not connected to UNIX Socket".to_string(),
            details: None,
        })?;

        let payload = serde_json::to_vec(request).map_err(|e| NexoraError::IpcError {
            message: "Failed to serialize IPC request".to_string(),
            details: Some(e.to_string()),
        })?;

        stream.write_all(&payload).map_err(|e| NexoraError::IpcError {
            message: "Failed to write to UNIX socket".to_string(),
            details: Some(e.to_string()),
        })?;
        stream.write_all(b"\n").map_err(|e| NexoraError::IpcError {
            message: "Failed to write newline separator to socket".to_string(),
            details: Some(e.to_string()),
        })?;
        stream.flush().ok();

        // Read streaming responses
        let mut reader = std::io::BufReader::new(stream);
        use std::io::BufRead;
        loop {
            let mut line = String::new();
            if let Ok(n) = reader.read_line(&mut line) {
                if n == 0 { break; }
                if let Ok(response) = serde_json::from_str::<IpcResponse>(&line) {
                    let should_continue = callback(response);
                    if !should_continue { break; }
                }
            } else {
                break;
            }
        }
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.stream.is_some()
    }
}

// Fallback Mockup for development / environments where pipes are unavailable
pub struct MockIpcConnection {
    connected: bool,
}

impl MockIpcConnection {
    pub fn new() -> Self {
        Self { connected: false }
    }
}

impl IpcConnection for MockIpcConnection {
    fn connect(&mut self, _timeout: Duration) -> Result<(), NexoraError> {
        self.connected = true;
        Ok(())
    }

    fn send(&mut self, request: &IpcRequest) -> Result<IpcResponse, NexoraError> {
        if !self.connected {
            return Err(NexoraError::IpcError {
                message: "Mock IPC not connected".to_string(),
                details: None,
            });
        }
        
        // Mock responses for testing
        let result_val = match request.method.as_str() {
            "workspace/open" => {
                let path = request.params.get("path").and_then(|p| p.as_str()).unwrap_or(".");
                serde_json::json!({
                    "status": "success",
                    "path_opened": path,
                    "session_id": "mock-session-123"
                })
            },
            "chat/send" => {
                serde_json::json!({
                    "status": "success",
                    "reply": "This is a mockup reply from Nexora Core."
                })
            },
            _ => serde_json::json!({ "status": "unsupported_method" })
        };

        Ok(IpcResponse {
            jsonrpc: "2.0".to_string(),
            result: Some(result_val),
            error: None,
            id: request.id,
        })
    }

    fn send_streaming(&mut self, request: &IpcRequest, callback: &mut dyn FnMut(IpcResponse) -> bool) -> Result<(), NexoraError> {
        let resp = self.send(request)?;
        callback(resp);
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }
}
