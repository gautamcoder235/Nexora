use std::collections::HashMap;
use tokio::sync::{mpsc, oneshot};
use serde::{Serialize, Deserialize};
use tauri::AppHandle;

use crate::team::models::*;
use crate::team::database::{TeamDb, DbWriteRequest};
use crate::team::runtime::agent_manager::AgentManager;
use crate::team::runtime::task_manager::TaskManager;
use crate::team::runtime::message_manager::MessageManager;
use crate::team::runtime::lock_manager::LockManager;
use crate::team::runtime::resource_manager::ResourceManager;
use crate::team::runtime::scheduler::{Scheduler, SchedulingPolicyType};
use crate::team::runtime::planner::Planner;
use crate::team::runtime::event_bus::EventBus;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TeamStateResponse {
    pub nodes: Vec<TeamNode>,
    pub edges: Vec<TeamEdge>,
    pub tasks: Vec<KanbanTask>,
    pub messages: Vec<TeamMessage>,
    pub is_team_paused: bool,
}

pub enum TeamCommand {
    Initialize {
        workspace_path: String,
        responder: oneshot::Sender<Result<(), String>>,
    },
    PerformAction {
        action: String,
        agent_id: Option<String>,
        payload: serde_json::Value,
        responder: oneshot::Sender<Result<(), String>>,
    },
    PostMessage {
        message: TeamMessage,
        responder: oneshot::Sender<Result<(), String>>,
    },
    GetState {
        responder: oneshot::Sender<TeamStateResponse>,
    },
    ClearAllMessages {
        responder: oneshot::Sender<Result<(), String>>,
    },
}

pub struct TeamRuntime {
    cmd_tx: mpsc::Sender<TeamCommand>,
}

#[allow(dead_code)]
struct TeamRuntimeInner {
    workspace_path: Option<String>,
    db: Option<TeamDb>,
    agent_mgr: AgentManager,
    task_mgr: TaskManager,
    msg_mgr: MessageManager,
    lock_mgr: LockManager,
    resource_mgr: ResourceManager,
    scheduler: Scheduler,
    planner: Planner,
    event_bus: EventBus,
    edges: Vec<TeamEdge>,
    is_team_paused: bool,
}

impl TeamRuntime {
    pub fn new(app_handle: Option<AppHandle>) -> Self {
        let (tx, mut rx) = mpsc::channel::<TeamCommand>(500);
        
        let mut inner = TeamRuntimeInner {
            workspace_path: None,
            db: None,
            agent_mgr: AgentManager::new(),
            task_mgr: TaskManager::new(),
            msg_mgr: MessageManager::new(),
            lock_mgr: LockManager::new(),
            resource_mgr: ResourceManager::new(),
            scheduler: Scheduler::new(SchedulingPolicyType::Priority),
            planner: Planner::new(),
            event_bus: EventBus::new(app_handle),
            edges: Vec::new(),
            is_team_paused: false,
        };

        // Spawn the central Actor thread
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();

            rt.block_on(async {
                println!("[TeamRuntime] Actor loop started.");
                while let Some(cmd) = rx.recv().await {
                    match cmd {
                        TeamCommand::Initialize { workspace_path, responder } => {
                            let res = inner.initialize(workspace_path);
                            let _ = responder.send(res);
                        }
                        TeamCommand::PerformAction { action, agent_id, payload, responder } => {
                            let res = inner.perform_action(action, agent_id, payload);
                            let _ = responder.send(res);
                        }
                        TeamCommand::PostMessage { message, responder } => {
                            inner.msg_mgr.add_message(message.clone());
                            
                            // Dispatch event
                            inner.event_bus.emit(SystemEvent {
                                id: format!("evt-msg-{}", uuid::Uuid::new_v4().simple()),
                                event_type: "message_received".to_string(),
                                priority: "medium".to_string(),
                                message: format!("New message from {}", message.sender),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                                agent_id: Some(message.sender.clone()),
                                task_id: None,
                                metadata: None,
                            });

                            let _ = responder.send(Ok(()));
                        }
                        TeamCommand::GetState { responder } => {
                            let state = inner.get_state_response();
                            let _ = responder.send(state);
                        }
                        TeamCommand::ClearAllMessages { responder } => {
                            inner.msg_mgr.clear_messages();
                            let _ = responder.send(Ok(()));
                        }
                    }
                }
                println!("[TeamRuntime] Actor loop stopped.");
            });
        });

        TeamRuntime { cmd_tx: tx }
    }

    pub fn get_tx(&self) -> mpsc::Sender<TeamCommand> {
        self.cmd_tx.clone()
    }
}

impl TeamRuntimeInner {
    fn initialize(&mut self, workspace_path: String) -> Result<(), String> {
        println!("[TeamRuntime] Initializing for workspace: {}", workspace_path);
        
        let db = TeamDb::new(&workspace_path)?;
        
        // 1. Load Agent Profiles
        let profiles = TeamDb::load_profiles(&workspace_path)?;
        if profiles.is_empty() {
            println!("[TeamRuntime] No profiles found, seeding default agents...");
            // Seed default coordinator
            let coord = AgentProfile {
                id: "coordinator".to_string(),
                name: "Coordinator".to_string(),
                role: AgentRole::Coordinator,
                preferred_model: "claude-3-5-sonnet".to_string(),
                success_rate: 1.0,
                tasks_completed: 0,
                tasks_failed: 0,
                avg_completion_time_sec: 0.0,
                known_mistakes: Vec::new(),
                languages: vec!["Rust".to_string(), "TypeScript".to_string()],
                expertise: vec!["Orchestration".to_string(), "Project Management".to_string()],
                preferences: HashMap::new(),
            };
            
            // Seed default builder
            let builder = AgentProfile {
                id: "builder".to_string(),
                name: "Builder Agent".to_string(),
                role: AgentRole::Builder,
                preferred_model: "claude-3-5-sonnet".to_string(),
                success_rate: 1.0,
                tasks_completed: 0,
                tasks_failed: 0,
                avg_completion_time_sec: 0.0,
                known_mistakes: Vec::new(),
                languages: vec!["Rust".to_string(), "TypeScript".to_string(), "Python".to_string()],
                expertise: vec!["Coding".to_string(), "Debugging".to_string()],
                preferences: HashMap::new(),
            };

            db.queue_write(DbWriteRequest::SaveAgentProfile(coord.clone()));
            db.queue_write(DbWriteRequest::SaveAgentProfile(builder.clone()));

            let _ = self.agent_mgr.spawn_agent(coord, None);
            let _ = self.agent_mgr.spawn_agent(builder, None);
        } else {
            for p in profiles {
                let _ = self.agent_mgr.spawn_agent(p, None);
            }
        }

        // 2. Load Tasks
        let tasks = TeamDb::load_tasks(&workspace_path)?;
        self.task_mgr.add_tasks(tasks);

        // 3. Initialize default Edges
        self.edges = vec![TeamEdge {
            id: "e-coord-builder".to_string(),
            source: "coordinator".to_string(),
            target: "builder".to_string(),
            message_count: 0,
            review_requests: 0,
            task_transfers: 0,
            is_active: false,
        }];

        self.db = Some(db);
        self.workspace_path = Some(workspace_path);

        // Dispatch startup event
        self.event_bus.emit(SystemEvent {
            id: format!("evt-init-{}", uuid::Uuid::new_v4().simple()),
            event_type: "workspace_initialized".to_string(),
            priority: "high".to_string(),
            message: "Team Swarm Runtime initialized successfully.".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            agent_id: None,
            task_id: None,
            metadata: None,
        });

        Ok(())
    }

    fn perform_action(&mut self, action: String, agent_id: Option<String>, payload: serde_json::Value) -> Result<(), String> {
        println!("[TeamRuntime] Action: {}, Agent: {:?}, Payload: {}", action, agent_id, payload);

        match action.as_str() {
            "Pause" => {
                if let Some(ref aid) = agent_id {
                    self.agent_mgr.pause_agent(aid)?;
                    self.event_bus.emit(SystemEvent {
                        id: format!("evt-pause-{}", uuid::Uuid::new_v4().simple()),
                        event_type: "agent_paused".to_string(),
                        priority: "high".to_string(),
                        message: format!("Agent '{}' paused by user directive.", aid),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        agent_id: Some(aid.clone()),
                        task_id: None,
                        metadata: None,
                    });
                }
            }
            "Resume" => {
                if let Some(ref aid) = agent_id {
                    self.agent_mgr.resume_agent(aid)?;
                    self.event_bus.emit(SystemEvent {
                        id: format!("evt-resume-{}", uuid::Uuid::new_v4().simple()),
                        event_type: "agent_resumed".to_string(),
                        priority: "high".to_string(),
                        message: format!("Agent '{}' resumed.", aid),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        agent_id: Some(aid.clone()),
                        task_id: None,
                        metadata: None,
                    });
                }
            }
            "Kill" => {
                if let Some(ref aid) = agent_id {
                    self.agent_mgr.kill_agent(aid)?;
                    let released = self.lock_mgr.release_all_locks_for_agent(aid);
                    self.agent_mgr.update_agent_locks(aid, Vec::new());

                    for file in released {
                        self.event_bus.emit(SystemEvent {
                            id: format!("evt-lock-rel-{}", uuid::Uuid::new_v4().simple()),
                            event_type: "lock_released".to_string(),
                            priority: "medium".to_string(),
                            message: format!("Released lock on file '{}' held by terminated agent '{}'.", file, aid),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            agent_id: Some(aid.clone()),
                            task_id: None,
                            metadata: None,
                        });
                    }

                    self.event_bus.emit(SystemEvent {
                        id: format!("evt-kill-{}", uuid::Uuid::new_v4().simple()),
                        event_type: "agent_killed".to_string(),
                        priority: "high".to_string(),
                        message: format!("Agent '{}' terminated.", aid),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        agent_id: Some(aid.clone()),
                        task_id: None,
                        metadata: None,
                    });
                }
            }
            "Spawn" => {
                let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("Custom Agent").to_string();
                let role_str = payload.get("role").and_then(|v| v.as_str()).unwrap_or("builder");
                let cli_command = payload.get("cliCommand").and_then(|v| v.as_str()).map(|s| s.to_string());
                let connections = payload.get("connections").and_then(|v| v.as_array());

                let id = format!("agent-{}", uuid::Uuid::new_v4().simple());
                let role = AgentRole::from_str(role_str);

                let profile = AgentProfile {
                    id: id.clone(),
                    name: name.clone(),
                    role: role.clone(),
                    preferred_model: "claude-3-5-flash".to_string(),
                    success_rate: 1.0,
                    tasks_completed: 0,
                    tasks_failed: 0,
                    avg_completion_time_sec: 0.0,
                    known_mistakes: Vec::new(),
                    languages: Vec::new(),
                    expertise: Vec::new(),
                    preferences: HashMap::new(),
                };

                if let Some(ref db) = self.db {
                    db.queue_write(DbWriteRequest::SaveAgentProfile(profile.clone()));
                }

                let _runtime = self.agent_mgr.spawn_agent(profile, cli_command)?;
                
                // Add connections as edges
                if let Some(arr) = connections {
                    for conn in arr {
                        if let Some(conn_str) = conn.as_str() {
                            self.edges.push(TeamEdge {
                                id: format!("e-{}-{}", id, conn_str),
                                source: id.clone(),
                                target: conn_str.to_string(),
                                message_count: 0,
                                review_requests: 0,
                                task_transfers: 0,
                                is_active: false,
                            });
                        }
                    }
                }

                self.event_bus.emit(SystemEvent {
                    id: format!("evt-spawn-{}", uuid::Uuid::new_v4().simple()),
                    event_type: "agent_spawned".to_string(),
                    priority: "high".to_string(),
                    message: format!("Spawned custom agent '{}' with role '{}'.", name, role.as_str()),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    agent_id: Some(id),
                    task_id: None,
                    metadata: None,
                });
            }
            "PauseSwarm" => {
                self.is_team_paused = true;
            }
            "ResumeSwarm" => {
                self.is_team_paused = false;
            }
            "ReleaseLocks" => {
                if let Some(ref aid) = agent_id {
                    let released = self.lock_mgr.release_all_locks_for_agent(aid);
                    self.agent_mgr.update_agent_locks(aid, Vec::new());
                    for file in released {
                        self.event_bus.emit(SystemEvent {
                            id: format!("evt-lock-rel-{}", uuid::Uuid::new_v4().simple()),
                            event_type: "lock_released".to_string(),
                            priority: "medium".to_string(),
                            message: format!("Released lock on file '{}' held by agent '{}'.", file, aid),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            agent_id: Some(aid.clone()),
                            task_id: None,
                            metadata: None,
                        });
                    }
                }
            }
            "SubmitDirective" => {
                // Split work / plan DAG and execute
                let content = payload.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let graph = self.planner.plan(content);
                self.task_mgr.add_tasks(graph.nodes.clone());

                if let Some(ref db) = self.db {
                    for t in &graph.nodes {
                        db.queue_write(DbWriteRequest::SaveTask(Box::new(t.clone())));
                    }
                }

                self.event_bus.emit(SystemEvent {
                    id: format!("evt-plan-{}", uuid::Uuid::new_v4().simple()),
                    event_type: "task_planning_completed".to_string(),
                    priority: "high".to_string(),
                    message: format!("Planner generated {} tasks for the swarm.", graph.nodes.len()),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    agent_id: None,
                    task_id: None,
                    metadata: None,
                });
            }
            _ => return Err(format!("Unknown team action: {}", action)),
        }

        Ok(())
    }

    fn get_state_response(&self) -> TeamStateResponse {
        let active_agents = self.agent_mgr.get_agents();
        
        let nodes: Vec<TeamNode> = active_agents
            .into_iter()
            .map(|a| TeamNode {
                id: a.id.clone(),
                label: if a.id == "coordinator" { "Coordinator".to_string() } else if a.id == "builder" { "Builder Agent".to_string() } else { a.id.clone() },
                role: if a.id == "coordinator" { "coordinator".to_string() } else { "builder".to_string() },
                status: a.status,
                avatar_url: None,
                active_task_id: a.active_task_id,
                current_task_description: a.current_task_description,
                locked_files: a.locked_files,
                cli_command: a.cli_command,
                prompt_context: Some(a.prompt_context),
                connected_terminal_id: a.connected_terminal_id,
            })
            .collect();

        TeamStateResponse {
            nodes,
            edges: self.edges.clone(),
            tasks: self.task_mgr.get_tasks(),
            messages: self.msg_mgr.get_messages(),
            is_team_paused: self.is_team_paused,
        }
    }
}
