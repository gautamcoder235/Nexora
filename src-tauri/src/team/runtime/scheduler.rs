use crate::team::models::KanbanTask;

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SchedulingPolicyType {
    Priority,
    Fifo,
    RoundRobin,
    CriticalPath,
    ShortestJobFirst,
}

pub trait SchedulerPolicy: Send + Sync {
    fn sort_tasks(&self, tasks: &mut Vec<KanbanTask>);
}

pub struct PriorityPolicy;
impl SchedulerPolicy for PriorityPolicy {
    fn sort_tasks(&self, tasks: &mut Vec<KanbanTask>) {
        tasks.sort_by(|a, b| b.priority_score.partial_cmp(&a.priority_score).unwrap_or(std::cmp::Ordering::Equal));
    }
}

pub struct FifoPolicy;
impl SchedulerPolicy for FifoPolicy {
    fn sort_tasks(&self, tasks: &mut Vec<KanbanTask>) {
        tasks.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    }
}

pub struct ShortestJobFirstPolicy;
impl SchedulerPolicy for ShortestJobFirstPolicy {
    fn sort_tasks(&self, tasks: &mut Vec<KanbanTask>) {
        tasks.sort_by(|a, b| {
            let dur_a = a.estimated_duration.unwrap_or(u64::MAX);
            let dur_b = b.estimated_duration.unwrap_or(u64::MAX);
            dur_a.cmp(&dur_b)
        });
    }
}

pub struct Scheduler {
    policy: Box<dyn SchedulerPolicy>,
}

impl Scheduler {
    pub fn new(policy_type: SchedulingPolicyType) -> Self {
        let policy: Box<dyn SchedulerPolicy> = match policy_type {
            SchedulingPolicyType::Fifo => Box::new(FifoPolicy),
            SchedulingPolicyType::ShortestJobFirst => Box::new(ShortestJobFirstPolicy),
            _ => Box::new(PriorityPolicy),
        };
        Scheduler { policy }
    }

    pub fn set_policy(&mut self, policy_type: SchedulingPolicyType) {
        self.policy = match policy_type {
            SchedulingPolicyType::Fifo => Box::new(FifoPolicy),
            SchedulingPolicyType::ShortestJobFirst => Box::new(ShortestJobFirstPolicy),
            _ => Box::new(PriorityPolicy),
        };
    }

    // Resolves dependencies and returns tasks that are ready for execution (i.e. all dependencies are 'done')
    pub fn get_runnable_tasks(&self, all_tasks: &[KanbanTask]) -> Vec<KanbanTask> {
        let done_ids: std::collections::HashSet<String> = all_tasks
            .iter()
            .filter(|t| t.state == "done")
            .map(|t| t.id.clone())
            .collect();

        let mut runnable: Vec<KanbanTask> = all_tasks
            .iter()
            .filter(|t| {
                t.state == "backlog" || t.state == "planning"
            })
            .filter(|t| {
                // All dependencies must be marked completed
                t.dependencies.iter().all(|dep| done_ids.contains(dep))
            })
            .cloned()
            .collect();

        self.policy.sort_tasks(&mut runnable);
        runnable
    }
}
