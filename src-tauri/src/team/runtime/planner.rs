use crate::team::models::{KanbanTask, TaskGraph};

pub struct Planner;

impl Planner {
    pub fn new() -> Self {
        Planner
    }

    pub fn plan(&self, prompt: &str) -> TaskGraph {
        println!("[Planner] Generating Task DAG for prompt: '{}'", prompt);

        // Simple/extensible prompt-splitting heuristic for production foundation
        let mut nodes = Vec::new();
        let mut edges = Vec::new();

        // 1. Research Task (Root)
        let t1_id = format!("task-research-{}", uuid::Uuid::new_v4().simple());
        nodes.push(KanbanTask {
            id: t1_id.clone(),
            title: format!("Research: {}", prompt),
            description: "Analyze codebase, search for symbols, and plan modifications.".to_string(),
            state: "backlog".to_string(),
            assigned_agent_id: Some("scout".to_string()),
            dependencies: Vec::new(),
            attempts: Vec::new(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            priority: "high".to_string(),
            estimated_tokens: Some(50000),
            estimated_duration: Some(60),
            priority_score: 1.0,
            retry_count: 0,
            blocked_reason: None,
            created_by: "planner".to_string(),
            assigned_by: Some("coordinator".to_string()),
            approval_required: false,
            reviewer: None,
            parent_task: None,
            child_tasks: Vec::new(),
            checkpoint: None,
            file_diffs: None,
            quarantine_reason: None,
            execution_id: None,
            execution_id_camel: None,
        });

        // 2. Implementation Task (Depends on Research)
        let t2_id = format!("task-build-{}", uuid::Uuid::new_v4().simple());
        nodes.push(KanbanTask {
            id: t2_id.clone(),
            title: format!("Build: {}", prompt),
            description: "Implement code changes conforming to specifications.".to_string(),
            state: "backlog".to_string(),
            assigned_agent_id: Some("builder".to_string()),
            dependencies: vec![t1_id.clone()],
            attempts: Vec::new(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            priority: "critical".to_string(),
            estimated_tokens: Some(150000),
            estimated_duration: Some(120),
            priority_score: 2.0,
            retry_count: 0,
            blocked_reason: None,
            created_by: "planner".to_string(),
            assigned_by: Some("coordinator".to_string()),
            approval_required: true,
            reviewer: Some("reviewer".to_string()),
            parent_task: Some(t1_id.clone()),
            child_tasks: Vec::new(),
            checkpoint: None,
            file_diffs: None,
            quarantine_reason: None,
            execution_id: None,
            execution_id_camel: None,
        });
        edges.push((t1_id.clone(), t2_id.clone()));

        // 3. Review Task (Depends on Build)
        let t3_id = format!("task-review-{}", uuid::Uuid::new_v4().simple());
        nodes.push(KanbanTask {
            id: t3_id.clone(),
            title: format!("Review & Test: {}", prompt),
            description: "Review implementation changes, compile, lint, and run tests.".to_string(),
            state: "backlog".to_string(),
            assigned_agent_id: Some("reviewer".to_string()),
            dependencies: vec![t2_id.clone()],
            attempts: Vec::new(),
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            priority: "high".to_string(),
            estimated_tokens: Some(30000),
            estimated_duration: Some(30),
            priority_score: 1.5,
            retry_count: 0,
            blocked_reason: None,
            created_by: "planner".to_string(),
            assigned_by: Some("coordinator".to_string()),
            approval_required: true,
            reviewer: None,
            parent_task: Some(t2_id.clone()),
            child_tasks: Vec::new(),
            checkpoint: None,
            file_diffs: None,
            quarantine_reason: None,
            execution_id: None,
            execution_id_camel: None,
        });
        edges.push((t2_id.clone(), t3_id.clone()));

        let critical_path = vec![t1_id, t2_id, t3_id];
        
        TaskGraph {
            nodes,
            edges,
            critical_path,
            estimated_cost: 0.15, // Mock token cost calculation
            estimated_duration: 210, // Total estimated duration in seconds
        }
    }
}
