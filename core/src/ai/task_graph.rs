use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TaskId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: TaskId,
    pub description: String,
    pub dependencies: Vec<TaskId>,
    pub status: TaskStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGraph {
    nodes: HashMap<TaskId, Node>,
}

impl TaskGraph {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
        }
    }

    pub fn add_node(&mut self, node: Node) {
        self.nodes.insert(node.id.clone(), node);
    }

    pub fn get_ready_tasks(&self) -> Vec<TaskId> {
        self.nodes
            .values()
            .filter(|n| matches!(n.status, TaskStatus::Pending))
            .filter(|n| {
                n.dependencies.iter().all(|dep_id| {
                    self.nodes.get(dep_id)
                        .map(|dep| matches!(dep.status, TaskStatus::Completed))
                        .unwrap_or(false)
                })
            })
            .map(|n| n.id.clone())
            .collect()
    }

    pub fn update_status(&mut self, id: &TaskId, status: TaskStatus) {
        if let Some(node) = self.nodes.get_mut(id) {
            node.status = status;
        }
    }

    pub fn is_complete(&self) -> bool {
        self.nodes.values().all(|n| matches!(n.status, TaskStatus::Completed))
    }
}
