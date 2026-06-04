export type AgentRole = 'manager' | 'coder' | 'reviewer' | 'task_runner';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  processTask(task: string, context: string): Promise<string>;
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedTo?: AgentRole;
  dependencies?: string[]; // Task IDs
}

export interface AgentSessionState {
  currentGoal: string;
  tasks: AgentTask[];
  logs: string[]; // Think loop trace statements
  isActive: boolean;
}
