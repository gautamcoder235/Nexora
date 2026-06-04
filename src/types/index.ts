export interface Workspace {
  id: string;
  name: string;
  rootPath: string; // Base directory on machine
  projectIds: string[];
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  path: string; // Absolute path
  description?: string;
  agentIds: string[];
  terminalSessionIds: string[];
}

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error';

export interface AgentCapabilities {
  coding: boolean;
  review: boolean;
  testing: boolean;
  planning: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'todo' | 'doing' | 'review' | 'done';
  assignedAgentId: string | null;
  createdAt: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  groupId?: string; // e.g. "Frontend Team", "Backend Team"
  cliCommand: string; // e.g. "npx", "aider", "goose"
  arguments: string[]; // e.g. ["@claudecode/cli"], ["--gpt-4o"]
  env: Record<string, string>;
  projectId: string | null;
  taskId: string | null;
  status: AgentStatus;
  capabilities: AgentCapabilities;
  terminalSessionIds: string[]; // Associated terminal sessions
  runtimeSeconds: number;
  lastActive: string; // ISO Timestamp
  role?: string;
  startupInstructions?: string[];
  behavioralRules?: string[];
  allowedTools?: string[];
}

export type TerminalStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface TerminalSession {
  id: string;
  projectId: string;
  taskId?: string;
  agentId?: string; // Associated agent (if any)
  title: string;
  status: TerminalStatus;
  cols: number;
  rows: number;
  history?: string; // Serialized xterm terminal history snapshot
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface LayoutPanel {
  sessionId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TerminalLayout {
  type: 'grid' | 'vertical' | 'horizontal';
  panels: LayoutPanel[];
}

export interface WorkspaceSession {
  id: string;
  workspaceId: string;
  startedAt: string;
  activeAgents: string[];
  activeTerminals: string[];
}

export interface WorkspaceSnapshot {
  workspaceId: string;
  sessionId: string;
  terminals: TerminalSession[];
  agents: AgentProfile[];
  tasks: Task[];
  layout: TerminalLayout;
  timestamp: string; // ISO Timestamp
  isSidebarVisible?: boolean;
  isTaskCenterVisible?: boolean;
  sidebarWidth?: number;
  topPanelHeight?: number;
}

export type ActivityLogSource = 'agent' | 'terminal' | 'workspace' | 'system';
export type ActivityLogSeverity = 'info' | 'warning' | 'error';

export interface ActivityLog {
  id: string;
  timestamp: string;
  sourceType: ActivityLogSource;
  severity: ActivityLogSeverity;
  agentId?: string;
  projectId: string;
  taskId?: string;
  message: string;
}
