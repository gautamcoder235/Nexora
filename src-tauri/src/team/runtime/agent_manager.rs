use std::collections::HashMap;
use std::sync::Mutex;
use crate::team::models::{AgentRuntime, AgentProfile};

pub struct AgentManager {
    runtimes: Mutex<HashMap<String, AgentRuntime>>,
}

impl AgentManager {
    pub fn new() -> Self {
        AgentManager {
            runtimes: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_agent(&self, agent: AgentRuntime) {
        let mut guard = self.runtimes.lock().unwrap();
        guard.insert(agent.id.clone(), agent);
    }

    pub fn spawn_agent(&self, profile: AgentProfile, cli_command: Option<String>) -> Result<AgentRuntime, String> {
        let mut guard = self.runtimes.lock().unwrap();
        
        let runtime = AgentRuntime {
            id: profile.id.clone(),
            status: "idle".to_string(),
            active_task_id: None,
            current_task_description: Some("Standby".to_string()),
            locked_files: Vec::new(),
            cli_command,
            prompt_context: vec![format!("SYSTEM: You are the {} agent named {}.", profile.role.as_str(), profile.name)],
            connected_terminal_id: None,
        };

        guard.insert(profile.id, runtime.clone());
        Ok(runtime)
    }

    pub fn pause_agent(&self, agent_id: &str) -> Result<(), String> {
        let mut guard = self.runtimes.lock().unwrap();
        if let Some(agent) = guard.get_mut(agent_id) {
            agent.status = "paused".to_string();
            Ok(())
        } else {
            Err(format!("Agent '{}' not found in runtime", agent_id))
        }
    }

    pub fn resume_agent(&self, agent_id: &str) -> Result<(), String> {
        let mut guard = self.runtimes.lock().unwrap();
        if let Some(agent) = guard.get_mut(agent_id) {
            agent.status = "running".to_string();
            Ok(())
        } else {
            Err(format!("Agent '{}' not found in runtime", agent_id))
        }
    }

    pub fn kill_agent(&self, agent_id: &str) -> Result<(), String> {
        let mut guard = self.runtimes.lock().unwrap();
        if let Some(agent) = guard.get_mut(agent_id) {
            agent.status = "offline".to_string();
            agent.current_task_description = Some("Terminated".to_string());
            Ok(())
        } else {
            Err(format!("Agent '{}' not found in runtime", agent_id))
        }
    }

    pub fn update_agent_status(&self, agent_id: &str, status: &str, task_desc: Option<String>) {
        let mut guard = self.runtimes.lock().unwrap();
        if let Some(agent) = guard.get_mut(agent_id) {
            agent.status = status.to_string();
            if let Some(desc) = task_desc {
                agent.current_task_description = Some(desc);
            }
        }
    }

    pub fn associate_terminal(&self, agent_id: &str, terminal_id: String) {
        let mut guard = self.runtimes.lock().unwrap();
        if let Some(agent) = guard.get_mut(agent_id) {
            agent.connected_terminal_id = Some(terminal_id);
        }
    }

    pub fn update_agent_locks(&self, agent_id: &str, locked_files: Vec<String>) {
        let mut guard = self.runtimes.lock().unwrap();
        if let Some(agent) = guard.get_mut(agent_id) {
            agent.locked_files = locked_files;
        }
    }

    pub fn get_agents(&self) -> Vec<AgentRuntime> {
        let guard = self.runtimes.lock().unwrap();
        guard.values().cloned().collect()
    }
}
