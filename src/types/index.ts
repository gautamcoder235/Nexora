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

import { AgentPlugin } from '../plugins/types';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgentId: string | null; // Agent ID
  priority: Priority;
  tags: string[];
  isStarred?: boolean;
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
  history?: string; // Only used for disk serialization, NOT kept in React state
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

export interface CustomCLI {
  id: string;
  name: string;
  command: string;
  args: string[];
  rolePreset?: string;
  group?: string;
  projectId?: string;
  capabilities?: AgentCapabilities;
  startupInstructions?: string[];
  installCommand?: string;
  checkCmd?: string;
}

export interface AppSettings {
  fontSize: number;
  fontFamily: string;
  cursorStyle: 'block' | 'bar' | 'underline';
  cursorBlink: boolean;
  copyOnSelect: boolean;
  hardwareAcceleration: boolean;
  terminalScrollbackLimit: number;

  defaultShell: string;
  shellArgs: string[];

  customCLIs: CustomCLI[];
  cliOverrides: Record<string, Partial<AgentPlugin>>;

  shortcuts: Record<string, string>;

  restoreTabsOnStartup: boolean;
  confirmBeforeClosing: boolean;
  // 0 = never suspend background workspace PTYs; any positive value = minutes of inactivity before suspension
  backgroundWorkspaceSuspendMinutes: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  fontSize: 12,
  fontFamily: 'courier-new, courier, monospace',
  cursorStyle: 'block',
  cursorBlink: true,
  copyOnSelect: true,
  hardwareAcceleration: true,
  terminalScrollbackLimit: 50000,
  
  defaultShell: 'auto', // 'auto' means backend resolves default (e.g. bash on unix, cmd on win)
  shellArgs: [],

  customCLIs: [],
  cliOverrides: {},

  shortcuts: {
    toggleSidebar: 'Ctrl+B',
    toggleTaskCenter: 'Ctrl+J',
    toggleAddAgent: 'Ctrl+N',
    openSettings: 'Ctrl+,',
  },
  
  restoreTabsOnStartup: true,
  confirmBeforeClosing: true,
  backgroundWorkspaceSuspendMinutes: 0, // 0 = never auto-suspend background workspace terminals
};

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
