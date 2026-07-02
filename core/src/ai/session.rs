use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub tool_calls: Option<Vec<Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub messages: Vec<Message>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub total_tokens: usize,
}

#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, Conversation>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_session(&self, title: &str) -> Conversation {
        let id = uuid::Uuid::new_v4().to_string();
        let conv = Conversation {
            id: id.clone(),
            title: title.to_string(),
            messages: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            total_tokens: 0,
        };
        
        self.sessions.write().await.insert(id, conv.clone());
        conv
    }

    pub async fn add_message(&self, session_id: &str, role: &str, content: &str) -> Option<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(conv) = sessions.get_mut(session_id) {
            conv.messages.push(Message {
                role: role.to_string(),
                content: content.to_string(),
                timestamp: Utc::now(),
                tool_calls: None,
            });
            conv.updated_at = Utc::now();
            Some(())
        } else {
            None
        }
    }

    pub async fn get_session(&self, session_id: &str) -> Option<Conversation> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id).cloned()
    }
}
