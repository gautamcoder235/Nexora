use std::sync::Mutex;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMetrics {
    pub allocated_ptys: u32,
    pub max_ptys: u32,
    pub allocated_browser_tabs: u32,
    pub max_browser_tabs: u32,
    pub allocated_agents: u32,
    pub max_agents: u32,
    pub tokens_consumed: u64,
    pub token_budget: u64,
}

pub struct ResourceManager {
    limits: ResourceLimits,
    state: Mutex<ResourceState>,
}

struct ResourceLimits {
    max_ptys: u32,
    max_browser_tabs: u32,
    max_agents: u32,
    token_budget: u64,
}

struct ResourceState {
    allocated_ptys: u32,
    allocated_browser_tabs: u32,
    allocated_agents: u32,
    tokens_consumed: u64,
}

impl ResourceManager {
    pub fn new() -> Self {
        ResourceManager {
            limits: ResourceLimits {
                max_ptys: 10,
                max_browser_tabs: 5,
                max_agents: 12,
                token_budget: 10_000_000,
            },
            state: Mutex::new(ResourceState {
                allocated_ptys: 0,
                allocated_browser_tabs: 0,
                allocated_agents: 0,
                tokens_consumed: 0,
            }),
        }
    }

    pub fn reserve_pty(&self) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();
        if state.allocated_ptys >= self.limits.max_ptys {
            return Err("PTY limit reached".to_string());
        }
        state.allocated_ptys += 1;
        Ok(())
    }

    pub fn release_pty(&self) {
        let mut state = self.state.lock().unwrap();
        if state.allocated_ptys > 0 {
            state.allocated_ptys -= 1;
        }
    }

    pub fn reserve_browser_tab(&self) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();
        if state.allocated_browser_tabs >= self.limits.max_browser_tabs {
            return Err("Browser tab limit reached".to_string());
        }
        state.allocated_browser_tabs += 1;
        Ok(())
    }

    pub fn release_browser_tab(&self) {
        let mut state = self.state.lock().unwrap();
        if state.allocated_browser_tabs > 0 {
            state.allocated_browser_tabs -= 1;
        }
    }

    pub fn reserve_agent(&self) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();
        if state.allocated_agents >= self.limits.max_agents {
            return Err("Agent spawn limit reached".to_string());
        }
        state.allocated_agents += 1;
        Ok(())
    }

    pub fn release_agent(&self) {
        let mut state = self.state.lock().unwrap();
        if state.allocated_agents > 0 {
            state.allocated_agents -= 1;
        }
    }

    pub fn consume_tokens(&self, count: u64) {
        let mut state = self.state.lock().unwrap();
        state.tokens_consumed += count;
    }

    pub fn get_metrics(&self) -> ResourceMetrics {
        let state = self.state.lock().unwrap();
        ResourceMetrics {
            allocated_ptys: state.allocated_ptys,
            max_ptys: self.limits.max_ptys,
            allocated_browser_tabs: state.allocated_browser_tabs,
            max_browser_tabs: self.limits.max_browser_tabs,
            allocated_agents: state.allocated_agents,
            max_agents: self.limits.max_agents,
            tokens_consumed: state.tokens_consumed,
            token_budget: self.limits.token_budget,
        }
    }
}
