import { AgentMessage } from './agent';

export type SystemEventType =
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'task_transfer'
  | 'review_request'
  | 'validation_trigger'
  | 'quarantine_alert'
  | 'lock_acquired'
  | 'lock_released';

export interface SystemEvent {
  id: string;
  type: SystemEventType;
  message: string;
  timestamp: string;
  agentId?: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

export type { AgentMessage };
