use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    pub id: String,
    pub action_type: String, // e.g., "shell", "filesystem_write"
    pub details: String,
    pub status: ApprovalStatus,
}

pub struct ApprovalManager {
    requests: Arc<RwLock<HashMap<String, ApprovalRequest>>>,
    // In a real app we'd use broadcast channels or oneshot channels per request
}

impl ApprovalManager {
    pub fn new() -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn request_approval(&self, action_type: &str, details: &str) -> String {
        let id = Uuid::new_v4().to_string();
        let req = ApprovalRequest {
            id: id.clone(),
            action_type: action_type.to_string(),
            details: details.to_string(),
            status: ApprovalStatus::Pending,
        };
        
        self.requests.write().await.insert(id.clone(), req);
        id
    }
    
    pub async fn resolve_approval(&self, id: &str, approved: bool) {
        if let Some(req) = self.requests.write().await.get_mut(id) {
            req.status = if approved { ApprovalStatus::Approved } else { ApprovalStatus::Denied };
        }
    }
    
    pub async fn get_status(&self, id: &str) -> Option<ApprovalStatus> {
        self.requests.read().await.get(id).map(|r| r.status.clone())
    }
}
