#[cfg(test)]
mod tests {
    use tokio::sync::oneshot;
    use serde_json::json;
    use crate::team::runtime::{TeamRuntime, TeamCommand};
    use crate::team::models::*;
    use crate::team::runtime::scheduler::{Scheduler, SchedulingPolicyType};
    use crate::team::runtime::planner::Planner;

    #[tokio::test]
    async fn test_team_actor_initialize() {
        let temp_id = uuid::Uuid::new_v4().to_string();
        let workspace_path = std::env::temp_dir()
            .join(format!("nexora-test-{}", temp_id))
            .to_string_lossy()
            .to_string();
        let _ = std::fs::create_dir_all(&workspace_path);

        let runtime = TeamRuntime::new(None);
        let (tx, rx) = oneshot::channel();
        
        // Initialize workspace database & default profiles
        runtime.get_tx()
            .send(TeamCommand::Initialize {
                workspace_path: workspace_path.clone(),
                responder: tx,
            })
            .await
            .unwrap();

        let init_res = rx.await.unwrap();
        assert!(init_res.is_ok(), "Swarm runtime initialization should succeed");

        // Fetch state
        let (state_tx, state_rx) = oneshot::channel();
        runtime.get_tx()
            .send(TeamCommand::GetState { responder: state_tx })
            .await
            .unwrap();
        
        let state = state_rx.await.unwrap();
        assert_eq!(state.nodes.len(), 2, "Seeded agents should be 2 (coordinator and builder)");
        
        let coordinator = state.nodes.iter().find(|n| n.id == "coordinator").unwrap();
        assert_eq!(coordinator.role, "coordinator");
        
        let builder = state.nodes.iter().find(|n| n.id == "builder").unwrap();
        assert_eq!(builder.role, "builder");

        let _ = std::fs::remove_dir_all(&workspace_path);
    }

    #[tokio::test]
    async fn test_team_actor_perform_action() {
        let temp_id = uuid::Uuid::new_v4().to_string();
        let workspace_path = std::env::temp_dir()
            .join(format!("nexora-test-{}", temp_id))
            .to_string_lossy()
            .to_string();
        let _ = std::fs::create_dir_all(&workspace_path);

        let runtime = TeamRuntime::new(None);
        
        let (tx, rx) = oneshot::channel();
        runtime.get_tx()
            .send(TeamCommand::Initialize {
                workspace_path: workspace_path.clone(),
                responder: tx,
            })
            .await
            .unwrap();
        let _ = rx.await.unwrap();

        // 1. Pause Agent
        let (act_tx, act_rx) = oneshot::channel();
        runtime.get_tx()
            .send(TeamCommand::PerformAction {
                action: "Pause".to_string(),
                agent_id: Some("builder".to_string()),
                payload: serde_json::Value::Null,
                responder: act_tx,
            })
            .await
            .unwrap();
        act_rx.await.unwrap().unwrap();

        // Verify Agent state is paused
        let (state_tx, state_rx) = oneshot::channel();
        runtime.get_tx().send(TeamCommand::GetState { responder: state_tx }).await.unwrap();
        let state = state_rx.await.unwrap();
        let builder = state.nodes.iter().find(|n| n.id == "builder").unwrap();
        assert_eq!(builder.status, "paused");

        // 2. Spawn Custom Agent
        let (spawn_tx, spawn_rx) = oneshot::channel();
        runtime.get_tx()
            .send(TeamCommand::PerformAction {
                action: "Spawn".to_string(),
                agent_id: None,
                payload: json!({
                    "name": "React Specialist",
                    "role": "builder",
                    "cliCommand": "npm run dev",
                    "connections": ["coordinator"]
                }),
                responder: spawn_tx,
            })
            .await
            .unwrap();
        spawn_rx.await.unwrap().unwrap();

        // Verify Custom Agent was spawned and edge was added
        let (state2_tx, state2_rx) = oneshot::channel();
        runtime.get_tx().send(TeamCommand::GetState { responder: state2_tx }).await.unwrap();
        let state2 = state2_rx.await.unwrap();
        assert_eq!(state2.nodes.len(), 3);
        assert_eq!(state2.edges.len(), 2);

        let _ = std::fs::remove_dir_all(&workspace_path);
    }

    #[test]
    fn test_task_graph_planner() {
        let planner = Planner::new();
        let graph = planner.plan("Implement authentication page styling");
        
        assert_eq!(graph.nodes.len(), 3);
        assert_eq!(graph.edges.len(), 2);
        assert_eq!(graph.critical_path.len(), 3);
        assert!(graph.estimated_duration > 0);
    }

    #[test]
    fn test_scheduler_ready_tasks() {
        let scheduler = Scheduler::new(SchedulingPolicyType::Priority);
        
        let tasks = vec![
            KanbanTask {
                id: "task-1".to_string(),
                title: "Task 1".to_string(),
                description: "".to_string(),
                state: "done".to_string(),
                assigned_agent_id: None,
                dependencies: Vec::new(),
                attempts: Vec::new(),
                created_at: "".to_string(),
                updated_at: "".to_string(),
                priority: "".to_string(),
                estimated_tokens: None,
                estimated_duration: None,
                priority_score: 1.0,
                retry_count: 0,
                blocked_reason: None,
                created_by: "".to_string(),
                assigned_by: None,
                approval_required: false,
                reviewer: None,
                parent_task: None,
                child_tasks: Vec::new(),
                checkpoint: None,
                file_diffs: None,
                quarantine_reason: None,
                execution_id: None,
                execution_id_camel: None,
            },
            KanbanTask {
                id: "task-2".to_string(),
                title: "Task 2".to_string(),
                description: "".to_string(),
                state: "backlog".to_string(),
                assigned_agent_id: None,
                dependencies: vec!["task-1".to_string()],
                attempts: Vec::new(),
                created_at: "".to_string(),
                updated_at: "".to_string(),
                priority: "".to_string(),
                estimated_tokens: None,
                estimated_duration: None,
                priority_score: 5.0, // Higher priority
                retry_count: 0,
                blocked_reason: None,
                created_by: "".to_string(),
                assigned_by: None,
                approval_required: false,
                reviewer: None,
                parent_task: None,
                child_tasks: Vec::new(),
                checkpoint: None,
                file_diffs: None,
                quarantine_reason: None,
                execution_id: None,
                execution_id_camel: None,
            },
            KanbanTask {
                id: "task-3".to_string(),
                title: "Task 3".to_string(),
                description: "".to_string(),
                state: "backlog".to_string(),
                assigned_agent_id: None,
                dependencies: vec!["task-1".to_string()],
                attempts: Vec::new(),
                created_at: "".to_string(),
                updated_at: "".to_string(),
                priority: "".to_string(),
                estimated_tokens: None,
                estimated_duration: None,
                priority_score: 2.0, // Lower priority
                retry_count: 0,
                blocked_reason: None,
                created_by: "".to_string(),
                assigned_by: None,
                approval_required: false,
                reviewer: None,
                parent_task: None,
                child_tasks: Vec::new(),
                checkpoint: None,
                file_diffs: None,
                quarantine_reason: None,
                execution_id: None,
                execution_id_camel: None,
            },
            KanbanTask {
                id: "task-4".to_string(),
                title: "Task 4".to_string(),
                description: "".to_string(),
                state: "backlog".to_string(),
                assigned_agent_id: None,
                dependencies: vec!["task-2".to_string()],
                attempts: Vec::new(),
                created_at: "".to_string(),
                updated_at: "".to_string(),
                priority: "".to_string(),
                estimated_tokens: None,
                estimated_duration: None,
                priority_score: 10.0,
                retry_count: 0,
                blocked_reason: None,
                created_by: "".to_string(),
                assigned_by: None,
                approval_required: false,
                reviewer: None,
                parent_task: None,
                child_tasks: Vec::new(),
                checkpoint: None,
                file_diffs: None,
                quarantine_reason: None,
                execution_id: None,
                execution_id_camel: None,
            }
        ];

        let runnable = scheduler.get_runnable_tasks(&tasks);
        
        assert_eq!(runnable.len(), 2);
        assert_eq!(runnable[0].id, "task-2");
        assert_eq!(runnable[1].id, "task-3");
    }

    #[tokio::test]
    async fn test_stress_events() {
        let temp_id = uuid::Uuid::new_v4().to_string();
        let workspace_path = std::env::temp_dir()
            .join(format!("nexora-test-{}", temp_id))
            .to_string_lossy()
            .to_string();
        let _ = std::fs::create_dir_all(&workspace_path);

        let runtime = TeamRuntime::new(None);
        
        let (tx, rx) = oneshot::channel();
        runtime.get_tx()
            .send(TeamCommand::Initialize {
                workspace_path: workspace_path.clone(),
                responder: tx,
            })
            .await
            .unwrap();
        let _ = rx.await.unwrap();

        let start = std::time::Instant::now();
        
        let mut futures = Vec::new();
        for i in 0..100 {
            let tx = runtime.get_tx();
            futures.push(tokio::spawn(async move {
                let (resp_tx, resp_rx) = oneshot::channel();
                tx.send(TeamCommand::PostMessage {
                    message: TeamMessage {
                        id: format!("msg-stress-{}", i),
                        sender: "user".to_string(),
                        sender_name: Some("User".to_string()),
                        receiver: None,
                        priority: "low".to_string(),
                        message_type: "broadcast".to_string(),
                        content: format!("stress message {}", i),
                        timestamp: "".to_string(),
                        attachments: Vec::new(),
                        block_id: None,
                    },
                    responder: resp_tx,
                }).await.unwrap();
                resp_rx.await.unwrap().unwrap();
            }));
        }

        futures::future::join_all(futures).await;
        let elapsed = start.elapsed();
        println!("[StressTest] Sent 100 messages in {:?}", elapsed);
        assert!(elapsed < std::time::Duration::from_millis(1000), "Stress test should process 100 messages in under 1000ms");

        let _ = std::fs::remove_dir_all(&workspace_path);
    }
}
