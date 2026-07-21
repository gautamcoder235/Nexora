use std::collections::HashMap;
use std::sync::Mutex;
use crate::team::models::KanbanTask;

pub struct TaskManager {
    tasks: Mutex<HashMap<String, KanbanTask>>,
}

impl TaskManager {
    pub fn new() -> Self {
        TaskManager {
            tasks: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_task(&self, task: KanbanTask) {
        let mut guard = self.tasks.lock().unwrap();
        guard.insert(task.id.clone(), task);
    }

    pub fn add_tasks(&self, new_tasks: Vec<KanbanTask>) {
        let mut guard = self.tasks.lock().unwrap();
        for t in new_tasks {
            guard.insert(t.id.clone(), t);
        }
    }

    pub fn update_task_state(&self, task_id: &str, state: &str) -> Result<(), String> {
        let mut guard = self.tasks.lock().unwrap();
        if let Some(task) = guard.get_mut(task_id) {
            task.state = state.to_string();
            task.updated_at = chrono::Utc::now().to_rfc3339();
            Ok(())
        } else {
            Err(format!("Task '{}' not found in manager", task_id))
        }
    }

    pub fn assign_task(&self, task_id: &str, agent_id: Option<String>) -> Result<(), String> {
        let mut guard = self.tasks.lock().unwrap();
        if let Some(task) = guard.get_mut(task_id) {
            task.assigned_agent_id = agent_id;
            task.state = if task.assigned_agent_id.is_some() { "assigned".to_string() } else { "backlog".to_string() };
            task.updated_at = chrono::Utc::now().to_rfc3339();
            Ok(())
        } else {
            Err(format!("Task '{}' not found in manager", task_id))
        }
    }

    pub fn get_task(&self, id: &str) -> Option<KanbanTask> {
        let guard = self.tasks.lock().unwrap();
        guard.get(id).cloned()
    }

    pub fn get_tasks(&self) -> Vec<KanbanTask> {
        let guard = self.tasks.lock().unwrap();
        guard.values().cloned().collect()
    }
}
