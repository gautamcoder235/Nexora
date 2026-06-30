use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum DriverError {
    ExecutableNotFound(String),
    AuthenticationFailed(String),
    VersionUnsupported { current: String, required: String },
    SessionExpired(String),
    ProcessCrash(String),
    IoError(String),
    Internal(String),
}

impl fmt::Display for DriverError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DriverError::ExecutableNotFound(msg) => write!(f, "Executable not found: {}", msg),
            DriverError::AuthenticationFailed(msg) => write!(f, "Authentication failed: {}", msg),
            DriverError::VersionUnsupported { current, required } => {
                write!(f, "Version unsupported: current = {}, required = {}", current, required)
            }
            DriverError::SessionExpired(msg) => write!(f, "Session expired: {}", msg),
            DriverError::ProcessCrash(msg) => write!(f, "Process crashed: {}", msg),
            DriverError::IoError(msg) => write!(f, "IO Error: {}", msg),
            DriverError::Internal(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}

impl std::error::Error for DriverError {}

impl From<std::io::Error> for DriverError {
    fn from(err: std::io::Error) -> Self {
        DriverError::IoError(err.to_string())
    }
}
