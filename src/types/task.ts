export type TaskState =
  | 'backlog'
  | 'planning'
  | 'assigned'
  | 'running'
  | 'review'
  | 'validation'
  | 'blocked'
  | 'quarantined'
  | 'done';

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
}

export interface TaskAttempt {
  attemptNumber: number;
  startedAt: string;
  finishedAt?: string;
  status: 'success' | 'failed';
  logOutput?: string;
  validationErrors?: string[];
}

export interface FileDiff {
  filePath: string;
  originalContent: string;
  newContent: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  state: TaskState;
  assignedAgentId?: string;
  dependencies: string[];
  attempts: TaskAttempt[];
  createdAt: string;
  updatedAt: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  fileDiffs?: FileDiff[];
  quarantineReason?: string;
  execution_id?: string;
  executionId?: string;
}
