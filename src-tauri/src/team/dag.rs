use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::team::task_types::{TaskSpec, WorkerSpec};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TemplateTaskSpec {
    pub task_id_suffix: String,
    pub title: String,
    pub description: String,
    pub dependencies: Vec<String>,
    pub priority: String,
    pub worker: WorkerSpec,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskTemplate {
    pub schema_version: u32,
    pub template_id: String,
    pub name: String,
    pub description: String,
    pub tasks: Vec<TemplateTaskSpec>,
}

pub fn get_templates_dir(project_path: &str) -> PathBuf {
    Path::new(project_path).join(".nexora").join("templates")
}

#[tauri::command]
pub fn initialize_default_templates(project_path: String) -> Result<(), String> {
    let dir = get_templates_dir(&project_path);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Write a default Feature development template
    let feature_template = TaskTemplate {
        schema_version: 1,
        template_id: "feature".to_string(),
        name: "Feature Development".to_string(),
        description: "Standard pipeline: implementation -> unit tests -> code review".to_string(),
        tasks: vec![
            TemplateTaskSpec {
                task_id_suffix: "impl".to_string(),
                title: "Implement feature".to_string(),
                description: "Write code implementation for the specified requirements.".to_string(),
                dependencies: vec![],
                priority: "normal".to_string(),
                worker: WorkerSpec {
                    runtime: "aider".to_string(),
                    model: "claude-3-5-sonnet".to_string(),
                    temperature: 0.1,
                    max_cost_usd: 0.50,
                    max_runtime_sec: 900,
                    retry_limit: 3,
                },
            },
            TemplateTaskSpec {
                task_id_suffix: "test".to_string(),
                title: "Write and run unit tests".to_string(),
                description: "Create tests and verify compile & test runs pass successfully.".to_string(),
                dependencies: vec!["impl".to_string()],
                priority: "high".to_string(),
                worker: WorkerSpec {
                    runtime: "aider".to_string(),
                    model: "claude-3-5-sonnet".to_string(),
                    temperature: 0.1,
                    max_cost_usd: 0.25,
                    max_runtime_sec: 600,
                    retry_limit: 3,
                },
            },
            TemplateTaskSpec {
                task_id_suffix: "review".to_string(),
                title: "Perform code review".to_string(),
                description: "Audit code against guidelines and specifications.".to_string(),
                dependencies: vec!["test".to_string()],
                priority: "normal".to_string(),
                worker: WorkerSpec {
                    runtime: "claude_code".to_string(),
                    model: "claude-3-5-sonnet".to_string(),
                    temperature: 0.0,
                    max_cost_usd: 0.20,
                    max_runtime_sec: 300,
                    retry_limit: 1,
                },
            },
        ],
    };

    let path = dir.join("feature.json");
    if !path.exists() {
        let json = serde_json::to_string_pretty(&feature_template).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_templates(project_path: String) -> Result<Vec<TaskTemplate>, String> {
    let dir = get_templates_dir(&project_path);
    if !dir.exists() {
        initialize_default_templates(project_path.clone())?;
    }

    let mut templates = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
            let template: TaskTemplate = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            templates.push(template);
        }
    }
    Ok(templates)
}

#[tauri::command]
pub fn expand_template(
    project_path: String,
    template_id: String,
    prefix: String,
) -> Result<Vec<TaskSpec>, String> {
    let dir = get_templates_dir(&project_path);
    let path = dir.join(format!("{}.json", template_id));
    if !path.exists() {
        return Err(format!("Template not found: {}", template_id));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let template: TaskTemplate = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let mut expanded = Vec::new();
    for task in &template.tasks {
        let task_id = format!("{}_{}", prefix, task.task_id_suffix);
        let dependencies = task
            .dependencies
            .iter()
            .map(|dep| format!("{}_{}", prefix, dep))
            .collect();

        let spec = TaskSpec {
            schema_version: 1,
            task_id,
            title: format!("{} - {}", prefix, task.title),
            description: task.description.clone(),
            dependencies,
            priority: task.priority.clone(),
            worker: task.worker.clone(),
        };

        expanded.push(spec);
    }

    Ok(expanded)
}

/// Topological Sorter and Cycle Detector
pub struct TaskGraph {
    /// Mapping of Task ID -> dependencies (other Task IDs)
    pub adj_list: HashMap<String, Vec<String>>,
}

impl TaskGraph {
    pub fn new() -> Self {
        TaskGraph {
            adj_list: HashMap::new(),
        }
    }

    pub fn add_task(&mut self, task_id: String, dependencies: Vec<String>) {
        self.adj_list.insert(task_id, dependencies);
    }

    /// Run DFS to check for cycles and produce a topological sorting
    pub fn topological_sort(&self) -> Result<Vec<String>, String> {
        let mut visited = HashSet::new();
        let mut visiting = HashSet::new();
        let mut order = Vec::new();

        for node in self.adj_list.keys() {
            if !visited.contains(node) {
                self.dfs_visit(node, &mut visiting, &mut visited, &mut order)?;
            }
        }

        // Return order (leaves to roots, or dependencies first)
        Ok(order)
    }

    fn dfs_visit(
        &self,
        node: &str,
        visiting: &mut HashSet<String>,
        visited: &mut HashSet<String>,
        order: &mut Vec<String>,
    ) -> Result<(), String> {
        visiting.insert(node.to_string());

        if let Some(deps) = self.adj_list.get(node) {
            for dep in deps {
                if visiting.contains(dep) {
                    return Err(format!("Cycle detected: {} depends on a path containing {}", node, dep));
                }
                if !visited.contains(dep) {
                    self.dfs_visit(dep, visiting, visited, order)?;
                }
            }
        }

        visiting.remove(node);
        visited.insert(node.to_string());
        order.push(node.to_string());
        Ok(())
    }
}

// ==========================================
// Tauri command to sort and validate a task list
// ==========================================

#[derive(Serialize, Deserialize)]
pub struct TaskSortInput {
    pub id: String,
    pub dependencies: Vec<String>,
}

#[tauri::command]
pub fn sort_and_validate_tasks(tasks: Vec<TaskSortInput>) -> Result<Vec<String>, String> {
    let mut graph = TaskGraph::new();
    for task in tasks {
        graph.add_task(task.id, task.dependencies);
    }
    graph.topological_sort()
}
