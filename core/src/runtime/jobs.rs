use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub name: String,
    pub status: JobStatus,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

#[derive(Clone, Default)]
pub struct JobManager {
    jobs: Arc<RwLock<HashMap<String, Job>>>,
}

impl JobManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_job(&self, id: String, name: String) -> Job {
        let job = Job {
            id: id.clone(),
            name,
            status: JobStatus::Queued,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            error: None,
        };
        
        let mut jobs = self.jobs.write().await;
        jobs.insert(id.clone(), job.clone());
        job
    }

    pub async fn update_status(&self, id: &str, status: JobStatus, error: Option<String>) {
        let mut jobs = self.jobs.write().await;
        if let Some(job) = jobs.get_mut(id) {
            job.status = status;
            match status {
                JobStatus::Running => {
                    if job.started_at.is_none() {
                        job.started_at = Some(Utc::now());
                    }
                }
                JobStatus::Completed | JobStatus::Failed => {
                    job.completed_at = Some(Utc::now());
                    job.error = error;
                }
                _ => {}
            }
        }
    }

    pub async fn get_job(&self, id: &str) -> Option<Job> {
        let jobs = self.jobs.read().await;
        jobs.get(id).cloned()
    }
    
    pub async fn list_jobs(&self) -> Vec<Job> {
        let jobs = self.jobs.read().await;
        jobs.values().cloned().collect()
    }
}
