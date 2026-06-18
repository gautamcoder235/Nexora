export interface Workspace {
  id: string;
  name: string;
  rootPath: string; // Base directory on machine
  projectIds: string[];
  lastOpened?: number; // timestamp in ms
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
import { BrowserTab, BrowserHistoryItem } from "./browser";
export type { BrowserTab, BrowserHistoryItem };
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
  startedAt?: number; // timestamp when running started
  tokensUsed?: number; // accumulated simulated token usage
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
  isBrowserPanelVisible?: boolean;
  isBrowserPanelPinned?: boolean;
  browserPanelWidth?: number;
  browserTabs?: BrowserTab[];
  activeBrowserTabId?: string | null;
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

export interface ThemeSettings {
  theme: string; // OLED | Midnight | Slate | Graphite | Light
  accentColor: string; // e.g. amber, blue, emerald, red, violet, custom
  customAccentColor?: string; // hex color if accentColor === 'custom'
  mode: 'dark' | 'light' | 'system';
  density: 'compact' | 'comfortable' | 'spacious';
  transparency: number; // 0 to 100
  backgroundBlur: 'low' | 'medium' | 'high';
  animationLevel: 'none' | 'reduced' | 'normal' | 'enhanced';
  cornerRadius: 'sharp' | 'small' | 'medium' | 'large';
}

export interface TypographySettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: string;
  codeFontFamily: string;
  codeFontSize: number;
  terminalFontFamily: string;
  terminalFontSize: number;
  letterSpacing?: string;
}

export interface WorkspaceAppearanceSettings {
  showGitBranch?: boolean;
  showMinimap?: boolean;
  sidebarPosition?: 'left' | 'right';
  paneSpacing?: number;
  showActivityBar?: boolean;
  showStatusBar?: boolean;
}

export interface TerminalAppearanceSettings {
  cursorStyle: 'block' | 'bar' | 'underline';
  cursorBlink: boolean;
  hardwareAcceleration: boolean;
  terminalScrollbackLimit: number;
  copyOnSelect: boolean;
  bellStyle?: 'none' | 'sound' | 'visual';
}

export interface AgentAppearanceSettings {
  avatarStyle?: 'initials' | 'icon' | 'identicon';
  showAgentStatusBadge?: boolean;
  animateAgentTransitions?: boolean;
  compactCards?: boolean;
}

export interface AccessibilitySettings {
  screenReaderMode?: boolean;
  highContrastMode?: boolean;
  reducedMotion?: boolean;
  increaseContrast?: boolean;
  accessibleTermBell?: boolean;
}

export interface WorkspaceLayoutSettings {
  layoutMode?: 'grid' | 'vertical' | 'horizontal' | 'flexible';
  sidebarWidth?: number;
  topPanelHeight?: number;
  bottomPanelHeight?: number;
  showTerminalTitleBar?: boolean;
}

export interface AdvancedAppearanceSettings {
  customCss?: string;
  gpuRendering?: boolean;
  enableShaders?: boolean;
  developerMode?: boolean;
}

export interface AppearanceSettings {
  theme: ThemeSettings;
  typography: TypographySettings;
  workspace: WorkspaceAppearanceSettings;
  terminal: TerminalAppearanceSettings;
  agent: AgentAppearanceSettings;
  accessibility: AccessibilitySettings;
  layout: WorkspaceLayoutSettings;
  advanced: AdvancedAppearanceSettings;
}

export interface SemanticStatusTokens {
  agentStatusIdle: string;
  agentStatusWorking: string;
  agentStatusPaused: string;
  agentStatusError: string;
  agentStatusSuccess: string;
}

export interface AppSettings {
  version: number;
  appearance: AppearanceSettings;

  defaultShell: string;
  shellArgs: string[];

  customCLIs: CustomCLI[];
  cliOverrides: Record<string, Partial<AgentPlugin>>;

  shortcuts: Record<string, string>;

  restoreTabsOnStartup: boolean;
  confirmBeforeClosing: boolean;
  // 0 = never suspend background workspace PTYs; any positive value = minutes of inactivity before suspension
  backgroundWorkspaceSuspendMinutes: number;

  // Legacy fields preserved for seamless migration and back-compat
  fontSize?: number;
  fontFamily?: string;
  cursorStyle?: 'block' | 'bar' | 'underline';
  cursorBlink?: boolean;
  copyOnSelect?: boolean;
  hardwareAcceleration?: boolean;
  terminalScrollbackLimit?: number;
}

const isWindows = typeof window !== 'undefined' && (
  window.navigator.userAgent.toLowerCase().includes('win') ||
  window.navigator.platform.toLowerCase().includes('win')
);

export const getDefaultCustomCLIs = (): CustomCLI[] => [
  {
    id: "agy",
    name: "Antigravity CLI (agy)",
    command: "agy",
    args: [],
    checkCmd: "agy --version",
    installCommand: isWindows 
      ? "powershell -Command \"irm https://antigravity.google/cli/install.ps1 | iex\""
      : "curl -fsSL https://antigravity.google/cli/install.sh | bash"
  }
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: 2,
  appearance: {
    theme: {
      theme: 'Midnight',
      accentColor: 'amber',
      mode: 'dark',
      density: 'comfortable',
      transparency: 90,
      backgroundBlur: 'medium',
      animationLevel: 'normal',
      cornerRadius: 'medium'
    },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: 13,
      lineHeight: 1.5,
      fontWeight: '400',
      codeFontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      codeFontSize: 12,
      terminalFontFamily: "courier-new, courier, monospace",
      terminalFontSize: 12,
      letterSpacing: '0'
    },
    workspace: {
      showGitBranch: true,
      showMinimap: false,
      sidebarPosition: 'left',
      paneSpacing: 8,
      showActivityBar: true,
      showStatusBar: true
    },
    terminal: {
      cursorStyle: 'block',
      cursorBlink: true,
      hardwareAcceleration: true,
      terminalScrollbackLimit: 50000,
      copyOnSelect: true,
      bellStyle: 'none'
    },
    agent: {
      avatarStyle: 'initials',
      showAgentStatusBadge: true,
      animateAgentTransitions: true,
      compactCards: false
    },
    accessibility: {
      screenReaderMode: false,
      highContrastMode: false,
      reducedMotion: false,
      increaseContrast: false,
      accessibleTermBell: false
    },
    layout: {
      layoutMode: 'grid',
      sidebarWidth: 490,
      topPanelHeight: 320,
      bottomPanelHeight: 240,
      showTerminalTitleBar: true
    },
    advanced: {
      customCss: '',
      gpuRendering: true,
      enableShaders: false,
      developerMode: false
    }
  },
  
  defaultShell: 'auto', // 'auto' means backend resolves default (e.g. bash on unix, cmd on win)
  shellArgs: [],

  customCLIs: getDefaultCustomCLIs(),
  cliOverrides: {},

  shortcuts: {
    toggleSidebar: 'Ctrl+B',
    toggleTaskCenter: 'Ctrl+J',
    toggleAddAgent: 'Ctrl+N',
    openSettings: 'Ctrl+,',
    toggleBrowser: 'Ctrl+Shift+B',
    toggleReviewCenter: 'Ctrl+Shift+R',
  },
  
  restoreTabsOnStartup: true,
  confirmBeforeClosing: true,
  backgroundWorkspaceSuspendMinutes: 0,

  // Legacy defaults for back-compat safety
  fontSize: 12,
  fontFamily: 'courier-new, courier, monospace',
  cursorStyle: 'block',
  cursorBlink: true,
  copyOnSelect: true,
  hardwareAcceleration: true,
  terminalScrollbackLimit: 50000,
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

export * from "./browser";
export * from "./changeset";
