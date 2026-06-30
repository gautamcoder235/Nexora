import { AgentRole } from './agent';

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'error'
  | 'offline'
  | 'available';

export interface TeamNode {
  id: string;
  label: string;
  role: AgentRole;
  status: AgentStatus;
  avatarUrl?: string;
  activeTaskId?: string;
  currentTaskDescription?: string;
  lockedFiles: string[];
  cliCommand?: string;
  promptContext?: string[];
  connectedTerminalId?: string;
}

export interface TeamEdge {
  id: string;
  source: string;
  target: string;
  messageCount: number;
  reviewRequests: number;
  taskTransfers: number;
  isActive: boolean;
}
