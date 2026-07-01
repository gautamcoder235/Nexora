import { create } from "zustand";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

const invoke = async <T>(cmd: string, args?: Record<string, any>): Promise<T> => {
  const start = performance.now();
  try {
    const res = await tauriInvoke<T>(cmd, args);
    const dur = performance.now() - start;
    if (typeof window !== "undefined") {
      if (!(window as any).__performanceTimings) {
        (window as any).__performanceTimings = {};
      }
      (window as any).__performanceTimings.lastIpcCommand = cmd;
      (window as any).__performanceTimings.lastIpcLatency = dur;
      
      if (cmd === "start_task_execution" || cmd === "spawn_agent_session" || cmd === "spawn_pty") {
        (window as any).__performanceTimings.lastDriverLatency = dur;
      }
    }
    return res;
  } catch (err) {
    const dur = performance.now() - start;
    if (typeof window !== "undefined") {
      if (!(window as any).__performanceTimings) {
        (window as any).__performanceTimings = {};
      }
      (window as any).__performanceTimings.lastIpcCommand = cmd;
      (window as any).__performanceTimings.lastIpcLatency = dur;
    }
    throw err;
  }
};
import { 
  Workspace, 
  Project, 
  AgentProfile, 
  TerminalSession, 
  TerminalLayout, 
  LayoutPanel, 
  ActivityLog, 
  WorkspaceSnapshot,
  AgentStatus,
  Task,
  AppSettings,
  DEFAULT_APP_SETTINGS
} from "../types";
import { EventBus } from "../core/events";
import { deepMerge } from "../utils/object";
import { useBrowserStore } from "./browserStore";
import { TerminalBufferManager } from '../services/TerminalBufferManager';
import { PersistenceManager } from '../services/PersistenceManager';
import { agentTemplates } from "../agents/templates";
import { PluginRegistry } from "../plugins";

export interface DialogConfig {
  type: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  promptDefaultValue?: string;
  promptPlaceholder?: string;
  onConfirmPrompt?: (value: string) => void;
}

interface OrchestratorState {
  activeWorkspaceId: string | null;
  activeSessionId: string | null;
  workspaces: Workspace[];
  projects: Project[];
  agents: AgentProfile[];
  terminals: TerminalSession[];
  completedTerminals: string[];
  layout: TerminalLayout;
  activityFeed: ActivityLog[];
  cliInstalledStatuses: Record<string, boolean>;
  tasks: Task[];
  isSidebarVisible: boolean;
  isTaskCenterVisible: boolean;
  isAgentPanelPinned: boolean;
  isTaskPanelPinned: boolean;
  sidebarWidth: number;
  topPanelHeight: number;
  
  // Settings
  settings: AppSettings;
  isSettingsModalOpen: boolean;
  
  // Actions
  setSettingsModalOpen: (isOpen: boolean) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
  
  setSidebarVisible: (visible: boolean) => void;
  setTaskCenterVisible: (visible: boolean) => void;
  setAgentPanelPinned: (pinned: boolean) => void;
  setTaskPanelPinned: (pinned: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setTopPanelHeight: (height: number) => void;
  initStore: () => Promise<void>;
  createWorkspace: (name: string, rootPath: string) => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  addProject: (name: string, path: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newName: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, newName: string) => Promise<void>;
  createAgent: (profile: Omit<AgentProfile, "id" | "status" | "runtimeSeconds" | "lastActive" | "terminalSessionIds">) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  
  // Tasks actions
  createTask: (projectId: string, title: string, description: string, priority?: import('../types').Priority, tags?: string[]) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, status: Task['status']) => Promise<void>;
  assignTask: (taskId: string, agentId: string | null) => Promise<void>;
  syncTasksWithFile: (projectId: string) => Promise<void>;
  initializeProjectMemory: (projectId: string) => Promise<void>;

  // Terminal actions
  spawnTerminal: (projectId: string, agentId?: string, customCommand?: string, customArgs?: string[], startupInstruction?: string) => Promise<string | undefined>;
  killTerminal: (sessionId: string) => Promise<void>;
  changeLayoutType: (layoutType: 'grid' | 'vertical' | 'horizontal') => void;
  updateTerminalStatus: (sessionId: string, status: import('../types').TerminalStatus) => void;
  reconnectTerminal: (sessionId: string) => Promise<void>;
  renameTerminal: (sessionId: string, newTitle: string) => void;
  markTerminalCompleted: (sessionId: string) => void;
  clearTerminalCompleted: (sessionId: string) => void;
  updateTerminalExecutionState: (sessionId: string, executionState: 'running' | 'idle' | 'completed' | 'failed' | 'aborted') => void;
  
  // Logger
  logActivity: (
    sourceType: ActivityLog['sourceType'],
    severity: ActivityLog['severity'],
    message: string,
    projectId: string,
    agentId?: string,
    taskId?: string
  ) => void;
  clearActivityFeed: () => void;
  
  // Snapshot/Session triggers
  saveSnapshot: () => void;
  performActualSave: () => Promise<void>;
  loadSnapshot: () => Promise<void>;

  // V2 additions
  checkAgentCli: (pluginId: string) => Promise<boolean>;
  spawnTeamTemplate: (projectId: string, templateId: string) => Promise<void>;
  updateAgent: (agentId: string, updates: Partial<AgentProfile>) => Promise<void>;
  incrementAgentTokens: (updates: Record<string, number>) => void;
  healProjectNotFound: (sessionId: string) => Promise<void>;
  
  // Dialog Actions
  dialog: DialogConfig | null;
  showAlertDialog: (title: string, message: string) => void;
  showConfirmDialog: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  showPromptDialog: (
    title: string,
    message: string,
    onConfirm: (value: string) => void,
    onCancel?: () => void,
    defaultValue?: string,
    placeholder?: string
  ) => void;
  closeDialog: () => void;
}

// Global agent runtime ticker timer
let runtimeInterval: any = null;

// Settings sanitization helper to guarantee total type safety and prevent crashes
export function sanitizeSettings(loaded: any): AppSettings {
  if (!loaded || typeof loaded !== 'object') {
    return { ...DEFAULT_APP_SETTINGS };
  }

  // Deep merge target with defaults
  const merged = deepMerge(DEFAULT_APP_SETTINGS, loaded);

  // Guarantee that appearance is a clean, fully-populated object
  if (!merged.appearance || typeof merged.appearance !== 'object') {
    merged.appearance = JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS.appearance));
  } else {
    // Ensure all sub-objects exist
    const categories = ['theme', 'typography', 'workspace', 'terminal', 'agent', 'accessibility', 'layout', 'advanced'];
    for (const cat of categories) {
      const targetCat = DEFAULT_APP_SETTINGS.appearance[cat as keyof typeof DEFAULT_APP_SETTINGS.appearance];
      const sourceCat = merged.appearance[cat as keyof typeof merged.appearance];
      
      if (!sourceCat || typeof sourceCat !== 'object') {
        (merged.appearance as any)[cat] = JSON.parse(JSON.stringify(targetCat));
      } else {
        (merged.appearance as any)[cat] = {
          ...JSON.parse(JSON.stringify(targetCat)),
          ...sourceCat
        };
      }
    }
  }

  // Guarantee shortcuts exist
  if (!merged.shortcuts || typeof merged.shortcuts !== 'object') {
    merged.shortcuts = { ...DEFAULT_APP_SETTINGS.shortcuts };
  } else {
    merged.shortcuts = {
      ...DEFAULT_APP_SETTINGS.shortcuts,
      ...merged.shortcuts
    };
  }

  // Guarantee customCLIs exist and is an array
  if (!Array.isArray(merged.customCLIs)) {
    merged.customCLIs = [...DEFAULT_APP_SETTINGS.customCLIs];
  }

  // Guarantee shellArgs is always an array
  if (!Array.isArray(merged.shellArgs)) {
    merged.shellArgs = [...DEFAULT_APP_SETTINGS.shellArgs];
  }

  // Guarantee cliOverrides exist and is an object
  if (!merged.cliOverrides || typeof merged.cliOverrides !== 'object') {
    merged.cliOverrides = {};
  }

  return merged;
}

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  activeWorkspaceId: null,
  activeSessionId: null,
  workspaces: [],
  projects: [],
  agents: [],
  terminals: [],
  completedTerminals: [],
  layout: {
    type: 'grid',
    panels: []
  },
  activityFeed: [],
  cliInstalledStatuses: {},
  tasks: [],
  isSidebarVisible: false,
  isTaskCenterVisible: false,
  isAgentPanelPinned: false,
  isTaskPanelPinned: false,
  sidebarWidth: 490,
  topPanelHeight: 320,

  settings: DEFAULT_APP_SETTINGS,
  isSettingsModalOpen: false,

  setAgentPanelPinned: (pinned) => { set({ isAgentPanelPinned: pinned }); get().saveSnapshot(); },
  setTaskPanelPinned: (pinned) => { set({ isTaskPanelPinned: pinned }); get().saveSnapshot(); },
  setSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen }),
  updateSettings: (updates) => {
    set((state) => {
      const merged = deepMerge(state.settings, updates);
      const sanitized = sanitizeSettings(merged);
      
      // Update existing agents with the new overrides and custom CLIs
      const updatedAgents = state.agents.map(agent => {
        // 1. Check if the agent matches a predefined plugin
        const plugin = PluginRegistry.getPluginForAgent(agent.cliCommand, agent.arguments || []);
        if (plugin && plugin.id !== 'generic') {
          const overrides = sanitized.cliOverrides?.[plugin.id] || {};
          const cliCommand = overrides.cliCommand !== undefined ? overrides.cliCommand : plugin.cliCommand;
          const defaultArgs = overrides.defaultArgs !== undefined ? overrides.defaultArgs : plugin.defaultArgs;
          const name = overrides.name !== undefined ? overrides.name : agent.name;
          return {
            ...agent,
            name,
            cliCommand,
            arguments: defaultArgs || []
          };
        }

        // 2. Check if the agent matches a custom CLI in the previous settings
        const prevCustomCli = state.settings.customCLIs?.find(c => c.command === agent.cliCommand);
        if (prevCustomCli) {
          const newCustomCli = sanitized.customCLIs?.find(c => c.id === prevCustomCli.id);
          if (newCustomCli) {
            return {
              ...agent,
              name: newCustomCli.name,
              cliCommand: newCustomCli.command,
              arguments: newCustomCli.args || []
            };
          }
        }

        return agent;
      });

      // Apply appearance settings dynamically on update
      if (sanitized.appearance) {
        import('../services/ThemeManager').then(({ ThemeManager }) => {
          ThemeManager.applyAppearance(sanitized.appearance);
        });
      }

      return { 
        settings: sanitized, 
        agents: updatedAgents 
      };
    });
    get().saveSnapshot(); // Persist settings immediately upon update
  },
  resetSettings: () => {
    const sanitizedDefault = sanitizeSettings(DEFAULT_APP_SETTINGS);
    set((state) => {
      const updatedAgents = state.agents.map(agent => {
        const plugin = PluginRegistry.getPluginForAgent(agent.cliCommand, agent.arguments || []);
        if (plugin && plugin.id !== 'generic') {
          const overrides = sanitizedDefault.cliOverrides?.[plugin.id] || {};
          const cliCommand = overrides.cliCommand !== undefined ? overrides.cliCommand : plugin.cliCommand;
          const defaultArgs = overrides.defaultArgs !== undefined ? overrides.defaultArgs : plugin.defaultArgs;
          const name = overrides.name !== undefined ? overrides.name : plugin.name;
          return {
            ...agent,
            name,
            cliCommand,
            arguments: defaultArgs || []
          };
        }
        return agent;
      });
      return { 
        settings: sanitizedDefault, 
        agents: updatedAgents 
      };
    });
    import('../services/ThemeManager').then(({ ThemeManager }) => {
      ThemeManager.applyAppearance(sanitizedDefault.appearance);
    });
    get().saveSnapshot();
  },

  dialog: null,
  showAlertDialog: (title, message) => {
    set({
      dialog: {
        type: 'alert',
        title,
        message,
        onConfirm: () => {
          get().closeDialog();
        }
      }
    });
  },
  showConfirmDialog: (title, message, onConfirm, onCancel) => {
    set({
      dialog: {
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          onConfirm();
          get().closeDialog();
        },
        onCancel: () => {
          if (onCancel) onCancel();
          get().closeDialog();
        }
      }
    });
  },
  showPromptDialog: (title, message, onConfirmPrompt, onCancel, defaultValue = '', placeholder = '') => {
    set({
      dialog: {
        type: 'prompt',
        title,
        message,
        promptDefaultValue: defaultValue,
        promptPlaceholder: placeholder,
        onConfirmPrompt: (value: string) => {
          onConfirmPrompt(value);
          get().closeDialog();
        },
        onCancel: () => {
          if (onCancel) onCancel();
          get().closeDialog();
        },
        onConfirm: () => {}
      }
    });
  },
  closeDialog: () => {
    set({ dialog: null });
  },

  setSidebarVisible: (visible) => {
    set({ isSidebarVisible: visible });
    get().saveSnapshot();
  },
  setTaskCenterVisible: (visible) => {
    set({ isTaskCenterVisible: visible });
    get().saveSnapshot();
  },
  setSidebarWidth: (width) => {
    set({ sidebarWidth: width });
  },
  setTopPanelHeight: (height) => {
    set({ topPanelHeight: height });
  },

  initStore: async () => {
    try {
      let loadedSettings = { ...DEFAULT_APP_SETTINGS };
      let workspaces: Workspace[] = [];
      let projects: Project[] = [];
      let agents: AgentProfile[] = [];
      let tasks: Task[] = [];
      let activityFeed: ActivityLog[] = [];

      try {
        const configStr = await invoke<string>("load_config", { filename: "session.json" });
        if (configStr && configStr !== "{}") {
          const data = JSON.parse(configStr);
          workspaces = data.workspaces || [];
          projects = data.projects || [];
          agents = data.agents || [];
          tasks = data.tasks || [];
          activityFeed = data.activityFeed || [];

          let mergedSettings = deepMerge(DEFAULT_APP_SETTINGS, data.settings || {});
          
          // Perform migrations for older font definitions
          if (
            mergedSettings.fontFamily && (
              mergedSettings.fontFamily.includes('var(--font-mono)') || 
              mergedSettings.fontFamily.includes('ui-monospace') ||
              (data.settings && data.settings.fontSize === 14 && !mergedSettings.fontFamily.includes('courier'))
            )
          ) {
            mergedSettings.fontFamily = DEFAULT_APP_SETTINGS.fontFamily;
            mergedSettings.fontSize = DEFAULT_APP_SETTINGS.fontSize;
          }

          // Migration: merge new default custom CLIs into loaded settings if they are missing
          if (data.settings && data.settings.customCLIs === undefined) {
            const defaultCLIs = DEFAULT_APP_SETTINGS.customCLIs || [];
            const existingCLIs = mergedSettings.customCLIs || [];
            const mergedCLIs = [...existingCLIs];
            for (const dCli of defaultCLIs) {
              if (!mergedCLIs.some(c => c.id === dCli.id)) {
                mergedCLIs.push(dCli);
              }
            }
            mergedSettings.customCLIs = mergedCLIs;
          }

          // Version 1 to Version 2 AppSettings Migration
          const currentVersion = mergedSettings.version || 1;
          if (currentVersion < 2) {
            // Use JSON deep copy to avoid mutating default references
            const appearance = JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS.appearance));
            
            if (mergedSettings.fontSize !== undefined) {
              appearance.typography.fontSize = mergedSettings.fontSize;
              appearance.typography.terminalFontSize = mergedSettings.fontSize;
            }
            if (mergedSettings.fontFamily !== undefined) {
              appearance.typography.fontFamily = mergedSettings.fontFamily;
              appearance.typography.terminalFontFamily = mergedSettings.fontFamily;
            }
            if (mergedSettings.cursorStyle !== undefined) {
              appearance.terminal.cursorStyle = mergedSettings.cursorStyle;
            }
            if (mergedSettings.cursorBlink !== undefined) {
              appearance.terminal.cursorBlink = mergedSettings.cursorBlink;
            }
            if (mergedSettings.hardwareAcceleration !== undefined) {
              appearance.advanced.gpuRendering = mergedSettings.hardwareAcceleration;
            }
            if (mergedSettings.terminalScrollbackLimit !== undefined) {
              appearance.terminal.terminalScrollbackLimit = mergedSettings.terminalScrollbackLimit;
            }
            
            mergedSettings.appearance = appearance;
            mergedSettings.version = 2;
          }

          loadedSettings = mergedSettings;
        }
      } catch (err) {
        console.warn("Failed to load or parse session.json config, falling back to defaults:", err);
      }

      // Sanitize settings to guarantee complete type safety and prevent crashes
      const sanitized = sanitizeSettings(loadedSettings);

      set({
        workspaces,
        projects,
        agents,
        tasks,
        activityFeed,
        activeWorkspaceId: null, // Always show selection panel on launch
        settings: sanitized
      });

      // Apply theme styles on startup
      import('../services/ThemeManager').then(({ ThemeManager }) => {
        ThemeManager.applyAppearance(sanitized.appearance);
      });

      // Initialize runtime ticker for active running agents
      if (runtimeInterval) clearInterval(runtimeInterval);
      runtimeInterval = setInterval(() => {
        set((state) => {
          let changed = false;
          const updatedAgents = state.agents.map((agent) => {
            if (agent.status === "running") {
              changed = true;
              return {
                ...agent,
                runtimeSeconds: agent.runtimeSeconds + 1,
                lastActive: new Date().toISOString()
              };
            }
            return agent;
          });
          return changed ? { agents: updatedAgents } : {};
        });
      }, 1000);
    } catch (e) {
      console.error("Failed to initialize Orchestrator Store:", e);
    }
  },

  createWorkspace: async (name, rootPath) => {
    const newWorkspace: Workspace = {
      id: Math.random().toString(36).substring(7),
      name,
      rootPath,
      projectIds: [],
      lastOpened: Date.now()
    };

    set((state) => ({
      workspaces: [...state.workspaces, newWorkspace],
      activeWorkspaceId: newWorkspace.id,
      isSidebarVisible: false,
      terminals: [],
      layout: { type: 'grid', panels: [] }
    }));

    get().logActivity('workspace', 'info', `Created workspace: ${name} at ${rootPath}`, '', undefined);
    
    // Save database mappings
    get().saveSnapshot();
  },

  selectWorkspace: async (workspaceId) => {
    const ws = get().workspaces.find(w => w.id === workspaceId);
    if (!ws) return;

    // 1. Terminate all PTY shells of the previous workspace to clean memory
    try {
      await invoke("kill_all_ptys");
    } catch(e) {
      console.warn("Error cleaning previous PTYs:", e);
    }

    set((state) => ({
      activeWorkspaceId: workspaceId,
      isSidebarVisible: false,
      terminals: [],
      completedTerminals: [],
      layout: { type: 'grid', panels: [] },
      workspaces: state.workspaces.map(w => w.id === workspaceId ? { ...w, lastOpened: Date.now() } : w)
    }));

    // 2. Load the target snapshot layouts
    await get().loadSnapshot();
    
    // Log change
    EventBus.publish("workspace:changed", { workspaceId });
    
    // Notify Electron browser of workspace change to swap tab sessions
    invoke("notify_workspace_switch", { workspaceId }).catch((err) => {
      console.error("Failed to notify workspace switch:", err);
    });
    
    get().logActivity('workspace', 'info', `Switched to workspace: ${ws.name}`, '', undefined);

    // 3. Sync memory files and tasks checklists in parallel
    const workspaceProjects = get().projects.filter(p => p.workspaceId === workspaceId);
    
    // DO NOT AWAIT THIS! Let it run in the background so it doesn't block the UI thread 
    // waiting on synchronous disk writes (which can take 600ms+ due to Windows Defender).
    Promise.all(workspaceProjects.map(proj => get().initializeProjectMemory(proj.id))).catch(console.error);
    
    get().saveSnapshot();
  },

  deleteWorkspace: async (workspaceId) => {
    if (get().activeWorkspaceId === workspaceId) {
      try {
        await invoke("kill_all_ptys");
      } catch (e) {
        console.warn("Error cleaning PTYs on workspace delete:", e);
      }
      set({
        activeWorkspaceId: null,
        terminals: [],
        completedTerminals: [],
        layout: { type: 'grid', panels: [] }
      });
    }

    set((state) => {
      const remainingProjects = state.projects.filter(p => p.workspaceId !== workspaceId);
      const projectIdsToDelete = new Set(state.projects.filter(p => p.workspaceId === workspaceId).map(p => p.id));
      const remainingAgents = state.agents.filter(a => !a.projectId || !projectIdsToDelete.has(a.projectId));
      const remainingTasks = state.tasks.filter(t => !projectIdsToDelete.has(t.projectId));
      const remainingWorkspaces = state.workspaces.filter(w => w.id !== workspaceId);

      return {
        workspaces: remainingWorkspaces,
        projects: remainingProjects,
        agents: remainingAgents,
        tasks: remainingTasks
      };
    });

    get().logActivity('workspace', 'warning', `Deleted Workspace Session`, '', undefined);
    get().saveSnapshot();
  },

  addProject: async (name, path) => {
    const { activeWorkspaceId } = get();
    if (!activeWorkspaceId) return;

    const newProject: Project = {
      id: Math.random().toString(36).substring(7),
      workspaceId: activeWorkspaceId,
      name,
      path,
      agentIds: [],
      terminalSessionIds: []
    };

    set((state) => {
      const updatedWorkspaces = state.workspaces.map(ws => {
        if (ws.id === activeWorkspaceId) {
          return { ...ws, projectIds: [...ws.projectIds, newProject.id] };
        }
        return ws;
      });

      return {
        workspaces: updatedWorkspaces,
        projects: [...state.projects, newProject]
      };
    });

    get().logActivity('workspace', 'info', `Added project "${name}" mapping to ${path}`, newProject.id);
    // Initialize project memory and save snapshot in background to avoid blocking the UI
    get().initializeProjectMemory(newProject.id).then(() => {
      get().saveSnapshot();
    }).catch((err) => {
      console.error("Failed to initialize project memory in background:", err);
    });
  },

  deleteProject: async (projectId) => {
    const { activeWorkspaceId } = get();
    if (!activeWorkspaceId) return;

    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    // 1. Close all active terminal sessions in this project
    const projectTerminals = get().terminals.filter(t => t.projectId === projectId);
    for (const term of projectTerminals) {
      try {
        await invoke("close_terminal", { id: term.id });
      } catch (e) {
        console.error(`Failed to close terminal ${term.id} on project delete:`, e);
      }
    }

    set((state) => {
      const updatedWorkspaces = state.workspaces.map(ws => {
        if (ws.id === activeWorkspaceId) {
          return { ...ws, projectIds: ws.projectIds.filter(id => id !== projectId) };
        }
        return ws;
      });

      const remainingProjects = state.projects.filter(p => p.id !== projectId);
      const remainingAgents = state.agents.filter(a => a.projectId !== projectId);
      const remainingTasks = state.tasks.filter(t => t.projectId !== projectId);
      const remainingTerminals = state.terminals.filter(t => t.projectId !== projectId);

      return {
        workspaces: updatedWorkspaces,
        projects: remainingProjects,
        agents: remainingAgents,
        tasks: remainingTasks,
        terminals: remainingTerminals
      };
    });

    get().logActivity('workspace', 'warning', `Deleted Project Session "${project.name}"`, '', undefined);
    get().saveSnapshot();
  },

  renameProject: async (projectId, newName) => {
    if (!newName.trim()) return;

    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    set((state) => ({
      projects: state.projects.map(p => p.id === projectId ? { ...p, name: newName } : p)
    }));

    get().logActivity('workspace', 'info', `Renamed Project "${project.name}" to "${newName}"`, projectId);
    get().saveSnapshot();
  },

  renameWorkspace: async (workspaceId, newName) => {
    if (!newName.trim()) return;

    const workspace = get().workspaces.find(w => w.id === workspaceId);
    if (!workspace) return;

    set((state) => ({
      workspaces: state.workspaces.map(w => w.id === workspaceId ? { ...w, name: newName } : w)
    }));

    get().logActivity('workspace', 'info', `Renamed Workspace "${workspace.name}" to "${newName}"`, '', undefined);
    get().saveSnapshot();
  },

  createAgent: async (profile) => {
    const newAgent: AgentProfile = {
      ...profile,
      id: Math.random().toString(36).substring(7),
      status: 'idle',
      runtimeSeconds: 0,
      lastActive: new Date().toISOString(),
      terminalSessionIds: []
    };

    set((state) => {
      // Map to project if project is loaded
      const updatedProjects = state.projects.map(proj => {
        if (proj.id === profile.projectId) {
          return { ...proj, agentIds: [...proj.agentIds, newAgent.id] };
        }
        return proj;
      });

      return {
        agents: [newAgent, ...state.agents],
        projects: updatedProjects
      };
    });

    get().logActivity('system', 'info', `Registered Agent Profile: "${profile.name}"`, profile.projectId || '');
    get().saveSnapshot();
  },

  deleteAgent: async (agentId) => {
    const agent = get().agents.find(a => a.id === agentId);
    if (!agent) return;

    // 1. Kill any active terminals belonging to this agent
    const terminalsToKill = [...agent.terminalSessionIds];
    for (const termId of terminalsToKill) {
      await get().killTerminal(termId);
    }

    set((state) => {
      const updatedProjects = state.projects.map(proj => {
        if (proj.id === agent.projectId) {
          return { ...proj, agentIds: proj.agentIds.filter(id => id !== agentId) };
        }
        return proj;
      });

      return {
        agents: state.agents.filter(a => a.id !== agentId),
        projects: updatedProjects
      };
    });

    get().logActivity('system', 'warning', `Deleted Agent Profile: "${agent.name}"`, agent.projectId || '');
    get().saveSnapshot();
  },

  spawnTerminal: async (projectId, agentId, customCommand, customArgs, startupInstruction) => {
    if (get().terminals.length >= 16) {
      get().showAlertDialog(
        "Maximum Sessions Reached",
        "You can only have up to 16 terminal sessions open at a time. Please close some before opening new ones."
      );
      return;
    }

    const project = get().projects.find(p => p.id === projectId);
    const agent = agentId ? get().agents.find(a => a.id === agentId) : null;
    const sessionPath = project ? project.path : (get().workspaces.find(w => w.id === get().activeWorkspaceId)?.rootPath || "");

    const sessionId = agentId ? agentId : Math.random().toString(36).substring(7);
    const existingTerm = get().terminals.find(t => t.id === sessionId);
    const terminalExists = !!existingTerm;
    const isAlreadyConnected = existingTerm && existingTerm.status === 'connected';

    // Build terminal command target
    let command: string | undefined;
    let args: string[] | undefined;
    let title = "Bash Shell";

    if (customCommand) {
      command = customCommand;
      args = customArgs || [];
      title = customCommand.split("/").pop()?.split("\\").pop() || customCommand;
    } else if (agent) {
      command = agent.cliCommand;
      args = agent.arguments || [];
      title = agent.name;

      // Isolate Agylity session using project + agent ID overrides to prevent concurrent overlap
      const plugin = PluginRegistry.getPluginForAgent(command || "", args);
      if (plugin && plugin.id === 'agy') {
        const projId = projectId || 'default';
        if (!args.includes('--project')) {
          args = [...args, '--project', projId];
        }
      }
    } else {
      const { defaultShell, shellArgs } = get().settings;
      if (defaultShell !== 'auto') {
        command = defaultShell;
        args = shellArgs;
        title = defaultShell.split("/").pop()?.split("\\").pop() || "Shell";
      } else if (navigator.userAgent.includes("Windows")) {
        title = "Powershell";
      }
    }

    const newTerminal: TerminalSession = {
      id: sessionId,
      projectId,
      agentId,
      title,
      status: 'connecting',
      executionState: command ? 'running' : 'idle',
      cols: 80,
      rows: 24,
      command,
      args,
      cwd: sessionPath,
      env: agent ? agent.env : {}
    };

    // Calculate layout coordinates
    const layoutPanels = get().layout.panels;
    const count = layoutPanels.length;
    const newPanel: LayoutPanel = {
      sessionId,
      x: count % 3,
      y: Math.floor(count / 3),
      w: 1,
      h: 1
    };

    set((state) => {
      // 1. Link terminal to project
      const updatedProjects = state.projects.map(p => {
        if (p.id === projectId) {
          const terminalSessionIds = p.terminalSessionIds.includes(sessionId)
            ? p.terminalSessionIds
            : [...p.terminalSessionIds, sessionId];
          return { ...p, terminalSessionIds };
        }
        return p;
      });

      // 2. Link terminal to agent and flip agent to running status
      const updatedAgents = state.agents.map(a => {
        if (agent && a.id === agent.id) {
          const terminalSessionIds = a.terminalSessionIds.includes(sessionId)
            ? a.terminalSessionIds
            : [...a.terminalSessionIds, sessionId];
          return {
            ...a,
            status: 'running' as AgentStatus,
            terminalSessionIds,
            lastActive: new Date().toISOString(),
            startedAt: a.startedAt || Date.now()
          };
        }
        return a;
      });

      const terminals = terminalExists
        ? state.terminals.map(t => t.id === sessionId ? { 
            ...t, 
            status: 'connecting' as const,
            command,
            args,
            cwd: sessionPath,
            env: agent ? agent.env : {}
          } : t)
        : [...state.terminals, newTerminal];

      const panels = terminalExists
        ? state.layout.panels
        : [...state.layout.panels, newPanel];

      return {
        terminals,
        projects: updatedProjects,
        agents: updatedAgents,
        layout: {
          ...state.layout,
          panels
        }
      };
    });

    // 3. Invoke Tauri Rust shell spawner
    try {
      // Estimate initial terminal size based on window dimensions (approx 9px width, 17px height per char)
      const estimatedCols = Math.max(80, Math.floor((window.innerWidth * 0.8) / 9));
      const estimatedRows = Math.max(24, Math.floor((window.innerHeight * 0.8) / 17));

      if (!isAlreadyConnected) {
        let spawnArgs = args ? [...args] : [];
        if (!terminalExists && command === 'agy' && !spawnArgs.includes('--new-project')) {
          spawnArgs.push('--new-project');
        }

        const pid = await invoke<number | null>("spawn_pty", {
          sessionId,
          command,
          args: spawnArgs,
          cwd: sessionPath,
          env: agent ? agent.env : {},
          rows: estimatedRows,
          cols: estimatedCols
        });

        if (pid) {
          await invoke("register_terminal_pid", {
            tool: command || "generic",
            sessionId,
            cwd: sessionPath,
            pid
          });
        }

        // Transition from connecting to connected
        set((state) => ({
          terminals: state.terminals.map(t => t.id === sessionId ? { ...t, status: 'connected' as const } : t)
        }));

        EventBus.publish("terminal:spawned", { sessionId, projectId });
        get().logActivity('terminal', 'info', `Spawned terminal "${title}" at ${sessionPath}`, projectId, agentId);

        // 4. Run startup instructions if agent is defined and has instructions
        if (agent && agent.startupInstructions && agent.startupInstructions.length > 0) {
          setTimeout(async () => {
            for (const inst of agent.startupInstructions || []) {
              try {
                await invoke("write_pty", { sessionId, data: `${inst}\r` });
                // Wait 700ms between instructions to allow process loading
                await new Promise(r => setTimeout(r, 700));
              } catch (err) {
                console.warn(`Startup instruction failed in terminal "${sessionId}":`, err);
              }
            }
          }, 1200);
        }

        if (startupInstruction) {
          setTimeout(async () => {
            try {
              await invoke("write_pty", { sessionId, data: `${startupInstruction}\r` });
            } catch (err) {
              console.warn(`One-off startup instruction failed:`, err);
            }
          }, 1200);
        }
      }
    } catch (e) {
      console.error("PTY Spawner failed:", e);
      set((state) => ({
        terminals: state.terminals.map(t => t.id === sessionId ? { ...t, status: 'disconnected' as const } : t)
      }));
      get().logActivity('terminal', 'error', `PTY Spawner failed: ${e}`, projectId, agentId);
    }

    get().saveSnapshot();
    return sessionId;
  },

  killTerminal: async (sessionId) => {
    const term = get().terminals.find(t => t.id === sessionId);
    if (!term) return;

    try {
      await invoke("kill_pty", { sessionId });
    } catch (e) {
      console.warn("Failed to kill PTY process in Rust:", e);
    }

    set((state) => {
      // Unlink terminal from project
      const updatedProjects = state.projects.map(p => {
        if (p.id === term.projectId) {
          return { ...p, terminalSessionIds: p.terminalSessionIds.filter(id => id !== sessionId) };
        }
        return p;
      });

      // Unlink terminal from agent, switch status to idle if it was the last terminal running
      const updatedAgents = state.agents.map(a => {
        if (term.agentId && a.id === term.agentId) {
          const remainingTerms = a.terminalSessionIds.filter(id => id !== sessionId);
          const hasAliveTerms = state.terminals.some(t => 
            remainingTerms.includes(t.id) && t.status !== 'disconnected'
          );
          const isStillRunning = !(remainingTerms.length === 0 || !hasAliveTerms);

          const getBaseTokens = (agentId: string, currentVal: number | undefined) => {
            if (currentVal !== undefined) return currentVal;
            let hash = 0;
            for (let i = 0; i < agentId.length; i++) {
              hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
            }
            return Math.abs(hash % 84000) + 12000;
          };

          return {
            ...a,
            status: (isStillRunning ? 'running' : 'idle') as AgentStatus,
            terminalSessionIds: remainingTerms,
            lastActive: new Date().toISOString(),
            startedAt: isStillRunning ? a.startedAt : undefined,
            tokensUsed: getBaseTokens(a.id, a.tokensUsed)
          };
        }
        return a;
      });

      return {
        terminals: state.terminals.filter(t => t.id !== sessionId),
        projects: updatedProjects,
        agents: updatedAgents,
        layout: {
          ...state.layout,
          panels: state.layout.panels.filter(p => p.sessionId !== sessionId)
        }
      };
    });

    get().logActivity('terminal', 'info', `Terminated terminal session: "${term.title}"`, term.projectId, term.agentId);
    get().saveSnapshot();
  },

  changeLayoutType: (layoutType) => {
    set((state) => ({
      layout: {
        ...state.layout,
        type: layoutType
      }
    }));
    get().saveSnapshot();
  },

  updateTerminalStatus: (sessionId, status) => {
    set((state) => {
      const term = state.terminals.find(t => t.id === sessionId);
      const isTransitioningToCompleted = term && term.status === 'connected' && status === 'disconnected' && term.agentId;

      const updatedTerminals = state.terminals.map((terminal) => {
        if (terminal.id === sessionId) {
          const nextExecState = isTransitioningToCompleted ? 'completed' : terminal.executionState;
          return { ...terminal, status, executionState: nextExecState };
        }
        return terminal;
      });
      
      let nextCompleted = state.completedTerminals;
      if (isTransitioningToCompleted && !nextCompleted.includes(sessionId)) {
        nextCompleted = [...nextCompleted, sessionId];
      }
      
      const updatedAgents = state.agents.map((agent) => {
        if (term && term.agentId && agent.id === term.agentId) {
          const otherTerms = updatedTerminals.filter(t => t.agentId === agent.id && t.status !== 'disconnected');
          if (otherTerms.length === 0 && status === 'disconnected') {
            const getBaseTokens = (agentId: string, currentVal: number | undefined) => {
              if (currentVal !== undefined) return currentVal;
              let hash = 0;
              for (let i = 0; i < agentId.length; i++) {
                hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
              }
              return Math.abs(hash % 84000) + 12000;
            };

            return {
              ...agent,
              status: 'idle' as AgentStatus,
              startedAt: undefined,
              tokensUsed: getBaseTokens(agent.id, agent.tokensUsed)
            };
          } else if (status === 'connected' || status === 'reconnecting') {
            return {
              ...agent,
              status: 'running' as AgentStatus,
              startedAt: agent.startedAt || Date.now()
            };
          }
        }
        return agent;
      });

      return { terminals: updatedTerminals, agents: updatedAgents, completedTerminals: nextCompleted };
    });
  },

  renameTerminal: (sessionId, newTitle) => {
    if (!newTitle.trim()) return;
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === sessionId ? { ...t, title: newTitle } : t
      )
    }));
    get().saveSnapshot();
  },

  markTerminalCompleted: (sessionId) => {
    set((state) => {
      if (state.completedTerminals.includes(sessionId)) return {};
      return { completedTerminals: [...state.completedTerminals, sessionId] };
    });
  },

  clearTerminalCompleted: (sessionId) => {
    set((state) => {
      if (!state.completedTerminals.includes(sessionId)) return {};
      return { completedTerminals: state.completedTerminals.filter(id => id !== sessionId) };
    });
  },

  updateTerminalExecutionState: (sessionId, executionState) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === sessionId ? { ...t, executionState } : t
      )
    }));
  },

  reconnectTerminal: async (sessionId) => {
    const term = get().terminals.find(t => t.id === sessionId);
    if (!term) return;

    // We intentionally KEEP the history snapshot intact here.
    // Standard shells (bash, python) will restore their old history and
    // simply append the fresh PTY boot sequence (like a new prompt) to the bottom.
    // Ink-based apps will also just boot a new UI at the bottom of the old history.

    let commandArgs = term.args || [];
    const plugin = PluginRegistry.getPluginForAgent(term.command || "", commandArgs);
    if (plugin && plugin.id === 'agy') {
      const projId = term.projectId || 'default';
      if (!commandArgs.includes('--project')) {
        commandArgs = [...commandArgs, '--project', `${projId}-${sessionId}`];
      }
    }

    if (plugin && plugin.resumeArgs) {
      for (const arg of plugin.resumeArgs) {
        if (!commandArgs.includes(arg)) {
          commandArgs = [...commandArgs, arg];
        }
      }
    }

    try {
      const pid = await invoke<number | null>("spawn_pty", {
        sessionId,
        command: term.command || null,
        args: commandArgs.length > 0 ? commandArgs : null,
        cwd: term.cwd || null,
        env: term.env || null
      });

      if (pid) {
        await invoke("register_terminal_pid", {
          tool: term.command || "generic",
          sessionId,
          cwd: term.cwd || "",
          pid
        });
      }

      set((state) => {
        const updatedTerminals = state.terminals.map(t =>
          t.id === sessionId ? { ...t, status: 'connected' as const, executionState: (t.command ? 'running' : 'idle') as 'running' | 'idle', args: commandArgs } : t
        );
        const updatedAgents = state.agents.map(a => {
          if (term.agentId && a.id === term.agentId) {
            return { ...a, status: 'running' as const, startedAt: a.startedAt || Date.now() };
          }
          return a;
        });
        return { terminals: updatedTerminals, agents: updatedAgents };
      });
    } catch (e) {
      console.error(`Failed to reconnect PTY session ${sessionId}:`, e);
      set((state) => {
        const updatedTerminals = state.terminals.map(t =>
          t.id === sessionId ? { ...t, status: 'disconnected' as const, executionState: 'failed' as const } : t
        );
        const updatedAgents = state.agents.map(a => {
          if (term.agentId && a.id === term.agentId) {
            return { ...a, status: 'idle' as const };
          }
          return a;
        });
        return { terminals: updatedTerminals, agents: updatedAgents };
      });
    }
  },

  logActivity: (sourceType, severity, message, projectId, agentId, taskId) => {
    const newLog: ActivityLog = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      sourceType,
      severity,
      projectId,
      agentId,
      taskId,
      message
    };

    set((state) => ({
      activityFeed: [newLog, ...state.activityFeed].slice(0, 100) // Keep capped to last 100 events
    }));

    EventBus.publish("activity:new", { log: newLog });
  },

  clearActivityFeed: () => {
    set({ activityFeed: [] });
    get().saveSnapshot();
  },

  saveSnapshot: () => {
    PersistenceManager.getInstance().requestSave();
  },

  performActualSave: async () => {
    const start = performance.now();
    const state = get();
    
    // 1. Save global database mappings in session.json
    const dbPayload = {
      workspaces: state.workspaces,
      projects: state.projects,
      agents: state.agents,
      tasks: state.tasks,
      activityFeed: state.activityFeed,
      activeWorkspaceId: state.activeWorkspaceId,
      settings: state.settings
    };

    try {
      const dbJson = JSON.stringify(dbPayload);
      console.log(`Snapshot DB Payload Size: ${(dbJson.length / 1024 / 1024).toFixed(3)} MB`);
      await invoke("save_config", {
        filename: "session.json",
        content: dbJson
      });

      // 2. If a workspace is active, save its active layout session snapshot
      if (state.activeWorkspaceId) {
        // Inject history payloads dynamically into the snapshot to avoid storing them in React
        const terminalsWithHistory = state.terminals.map(t => ({
          ...t,
          history: TerminalBufferManager.getInstance().getSnapshot(t.id)
        }));

        const browserState = useBrowserStore.getState();

        const snapPayload: WorkspaceSnapshot = {
          workspaceId: state.activeWorkspaceId,
          sessionId: state.activeSessionId || Math.random().toString(36).substring(7),
          terminals: terminalsWithHistory,
          agents: state.agents,
          tasks: state.tasks,
          layout: state.layout,
          timestamp: new Date().toISOString(),
          isSidebarVisible: state.isSidebarVisible,
          isTaskCenterVisible: state.isTaskCenterVisible,
          sidebarWidth: state.sidebarWidth,
          topPanelHeight: state.topPanelHeight,
          isBrowserPanelVisible: browserState.isBrowserPanelVisible,
          isBrowserPanelPinned: browserState.isBrowserPanelPinned,
          browserPanelWidth: browserState.browserPanelWidth,
          browserTabs: browserState.tabs,
          activeBrowserTabId: browserState.activeTabId
        };

        const snapJson = JSON.stringify(snapPayload);
        console.log(`Snapshot Workspace Payload Size: ${(snapJson.length / 1024 / 1024).toFixed(3)} MB`);
        await invoke("save_config", {
          filename: `${state.activeWorkspaceId}_snapshot.json`,
          content: snapJson
        });
      }
      console.log(`saveSnapshot duration: ${(performance.now() - start).toFixed(2)} ms`);
    } catch (e) {
      console.error("Auto-save WorkspaceSnapshot failed:", e);
    }
  },

  loadSnapshot: async () => {
    const { activeWorkspaceId } = get();
    if (!activeWorkspaceId) return;

    try {
      const snapStr = await invoke<string>("load_config", {
        filename: `${activeWorkspaceId}_snapshot.json`
      });

      if (snapStr && snapStr !== "{}") {
        const snapshot = JSON.parse(snapStr) as WorkspaceSnapshot;

        // Restore terminal tabs/sessions, but clear history so they start fresh
        const restoredTerminals = (snapshot.terminals || []).map(t => {
          // Strip history so it starts completely clean (newly)
          const { history, ...termWithoutHistory } = t;
          return {
            ...termWithoutHistory,
            status: 'reconnecting' as const
          };
        });
        const restoredTerminalIds = new Set(restoredTerminals.map((terminal) => terminal.id));
        
        // Restore agent mapping and statuses
        const restoredAgents = (snapshot.agents || []).map((agent) => {
          const hasTerminal = agent.terminalSessionIds.some((id) => restoredTerminalIds.has(id));
          if (!hasTerminal && agent.status === 'running') {
            return { ...agent, status: 'idle' as const };
          }
          return agent;
        });

        set({
          activeSessionId: snapshot.sessionId,
          terminals: restoredTerminals,
          agents: restoredAgents,
          tasks: snapshot.tasks || [],
          layout: snapshot.layout || { type: 'grid', panels: [] }, // Restore terminal layout panels
          isSidebarVisible: false,
          isTaskCenterVisible: snapshot.isTaskCenterVisible !== undefined ? snapshot.isTaskCenterVisible : true,
          sidebarWidth: snapshot.sidebarWidth !== undefined ? snapshot.sidebarWidth : 490,
          topPanelHeight: snapshot.topPanelHeight !== undefined ? snapshot.topPanelHeight : 320
        });

        // Restore browser state
        useBrowserStore.getState().setBrowserState({
          isBrowserPanelVisible: snapshot.isBrowserPanelVisible || false,
          isBrowserPanelPinned: snapshot.isBrowserPanelPinned !== undefined ? snapshot.isBrowserPanelPinned : false,
          browserPanelWidth: snapshot.browserPanelWidth || 480,
          tabs: snapshot.browserTabs || [],
          activeTabId: snapshot.activeBrowserTabId || null
        });

        // Trigger reconnect for each restored terminal session asynchronously to spawn fresh PTYs
        // Delay by 2000ms to allow the main window to fully paint and mask the ConPTY conhost.exe flash
        setTimeout(() => {
          if (get().activeWorkspaceId !== activeWorkspaceId) return;
          for (const term of restoredTerminals) {
            // Check if the terminal still exists in state (wasn't closed manually during the delay)
            if (get().terminals.some(t => t.id === term.id)) {
              get().reconnectTerminal(term.id);
            }
          }
        }, 2000);
      } else {
        // Reset state for new or empty workspace to prevent leaking session states from other workspaces
        set({
          activeSessionId: null,
          terminals: [],
          agents: [],
          tasks: [],
          layout: { type: 'grid', panels: [] },
          isSidebarVisible: false,
          isTaskCenterVisible: true
        });

        // Reset browser state to clean defaults as well
        useBrowserStore.getState().setBrowserState({
          isBrowserPanelVisible: false,
          isBrowserPanelPinned: false,
          browserPanelWidth: 480,
          tabs: [],
          activeTabId: null
        });
      }
    } catch (e) {
      console.error(`Failed to load WorkspaceSnapshot for ID "${activeWorkspaceId}":`, e);
    }
  },

  checkAgentCli: async (pluginId) => {
    const isInstalled = await PluginRegistry.checkInstalled(pluginId);
    set((state) => ({
      cliInstalledStatuses: {
        ...state.cliInstalledStatuses,
        [pluginId]: isInstalled
      }
    }));
    return isInstalled;
  },

  spawnTeamTemplate: async (projectId, templateId) => {
    const template = agentTemplates.find(t => t.id === templateId);
    if (!template) return;

    get().logActivity('system', 'info', `Spawning Team Template: "${template.name}"`, projectId);

    for (const agentProto of template.agents) {
      const agentId = Math.random().toString(36).substring(7);
      const newAgent: AgentProfile = {
        ...agentProto,
        id: agentId,
        projectId,
        status: 'idle',
        runtimeSeconds: 0,
        lastActive: new Date().toISOString(),
        terminalSessionIds: []
      };

      // 1. Add agent to state
      set((state) => {
        const updatedProjects = state.projects.map(proj => {
          if (proj.id === projectId) {
            return { ...proj, agentIds: [...proj.agentIds, agentId] };
          }
          return proj;
        });

        return {
          agents: [...state.agents, newAgent],
          projects: updatedProjects
        };
      });

      // 2. Spawn terminal for the agent
      await get().spawnTerminal(projectId, agentId);
    }

    get().saveSnapshot();
  },

  incrementAgentTokens: (updates) => {
    set((state) => {
      const updatedAgents = state.agents.map(agent => {
        const additional = updates[agent.id];
        if (additional) {
          const getBaseTokens = (agentId: string, currentVal: number | undefined) => {
            if (currentVal !== undefined) return currentVal;
            let hash = 0;
            for (let i = 0; i < agentId.length; i++) {
              hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
            }
            return Math.abs(hash % 84000) + 12000;
          };
          const base = getBaseTokens(agent.id, agent.tokensUsed);
          return {
            ...agent,
            tokensUsed: base + additional
          };
        }
        return agent;
      });
      return { agents: updatedAgents };
    });
  },

  updateAgent: async (agentId, updates) => {
    set((state) => {
      const updatedAgents = state.agents.map((agent) => {
        if (agent.id === agentId) {
          return { ...agent, ...updates };
        }
        return agent;
      });

      // Sync project agent mappings if projectId changes
      let updatedProjects = state.projects;
      if (updates.projectId !== undefined) {
        const originalAgent = state.agents.find((a) => a.id === agentId);
        const prevProjectId = originalAgent ? originalAgent.projectId : null;
        const newProjectId = updates.projectId;

        updatedProjects = state.projects.map((proj) => {
          let agentIds = proj.agentIds;
          if (proj.id === prevProjectId && prevProjectId !== newProjectId) {
            agentIds = agentIds.filter((id) => id !== agentId);
          }
          if (proj.id === newProjectId && prevProjectId !== newProjectId && !agentIds.includes(agentId)) {
            agentIds = [...agentIds, agentId];
          }
          return { ...proj, agentIds };
        });
      }

      return {
        agents: updatedAgents,
        projects: updatedProjects
      };
    });

    const agent = get().agents.find((a) => a.id === agentId);
    get().logActivity('system', 'info', `Updated Agent Profile: "${agent?.name}"`, agent?.projectId || '');
    get().saveSnapshot();
  },

  createTask: async (projectId, title, description, priority = 'medium', tags = []) => {
    const newTask: Task = {
      id: Math.random().toString(36).substring(7),
      projectId,
      title,
      description,
      status: 'todo',
      assignedAgentId: null,
      priority,
      tags,
      createdAt: new Date().toISOString()
    };
    
    set((state) => ({
      tasks: [...state.tasks, newTask]
    }));

    get().logActivity('workspace', 'info', `Created task: "${title}"`, projectId);
    await get().syncTasksWithFile(projectId);
    get().saveSnapshot();
  },

  updateTask: async (taskId, updates) => {
    let projectId = "";
    set((state) => {
      const updatedTasks = state.tasks.map((task) => {
        if (task.id === taskId) {
          projectId = task.projectId;
          return { ...task, ...updates };
        }
        return task;
      });
      return { tasks: updatedTasks };
    });

    if (projectId) {
      await get().syncTasksWithFile(projectId);
    }
    get().saveSnapshot();
  },

  deleteTask: async (taskId) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (!task) return;

    set((state) => ({
      tasks: state.tasks.filter(t => t.id !== taskId)
    }));

    get().logActivity('workspace', 'warning', `Deleted task: "${task.title}"`, task.projectId);
    await get().syncTasksWithFile(task.projectId);
    get().saveSnapshot();
  },

  moveTask: async (taskId, status) => {
    let projectId = "";
    set((state) => {
      const updatedTasks = state.tasks.map((task) => {
        if (task.id === taskId) {
          projectId = task.projectId;
          return { ...task, status };
        }
        return task;
      });
      return { tasks: updatedTasks };
    });

    if (projectId) {
      await get().syncTasksWithFile(projectId);
    }
    get().saveSnapshot();
  },

  assignTask: async (taskId, agentId) => {
    let projectId = "";
    set((state) => {
      const updatedTasks = state.tasks.map((task) => {
        if (task.id === taskId) {
          projectId = task.projectId;
          return { ...task, assignedAgentId: agentId };
        }
        return task;
      });
      return { tasks: updatedTasks };
    });

    if (projectId) {
      await get().syncTasksWithFile(projectId);
    }
    get().saveSnapshot();
  },

  syncTasksWithFile: async (projectId) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const projectTasks = get().tasks.filter(t => t.projectId === projectId);
    const todo = projectTasks.filter(t => t.status === 'todo');
    const doing = projectTasks.filter(t => t.status === 'doing');
    const review = projectTasks.filter(t => t.status === 'review');
    const done = projectTasks.filter(t => t.status === 'done');

    const getAgentName = (agentId: string | null) => {
      if (!agentId) return "";
      const agent = get().agents.find(a => a.id === agentId);
      return agent ? ` (Assigned: ${agent.name} #${agent.id})` : "";
    };

    let content = `# Project Tasks\n\n`;

    const writeTaskBlock = (t: Task, statusSymbol: string) => {
      let block = `- [${statusSymbol}] ${t.title}${getAgentName(t.assignedAgentId)}\n`;
      block += `  <!-- id: ${t.id}, createdAt: ${t.createdAt} -->\n`;
      if (t.description) {
        const descLines = t.description.split("\n");
        block += `  - Description: ${descLines.join("\n    ")}\n`;
      }
      return block;
    };

    content += `## Todo\n`;
    todo.forEach(t => {
      content += writeTaskBlock(t, " ");
    });
    if (todo.length === 0) content += `- (No tasks)\n`;
    content += `\n`;

    content += `## Doing\n`;
    doing.forEach(t => {
      content += writeTaskBlock(t, "/");
    });
    if (doing.length === 0) content += `- (No tasks)\n`;
    content += `\n`;

    content += `## Review\n`;
    review.forEach(t => {
      content += writeTaskBlock(t, " ");
    });
    if (review.length === 0) content += `- (No tasks)\n`;
    content += `\n`;

    content += `## Done\n`;
    done.forEach(t => {
      content += writeTaskBlock(t, "x");
    });
    if (done.length === 0) content += `- (No tasks)\n`;
    content += `\n`;

    try {
      const filePath = `${project.path.replace(/\\/g, "/")}/tasks.md`;
      await invoke("write_project_file", { path: filePath, content });
    } catch (e) {
      console.error("Failed to write tasks.md project file:", e);
    }
  },

  initializeProjectMemory: async (projectId) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const pathNormalized = project.path.replace(/\\/g, "/");

    const archTemplate = `# Project Architecture\n\n## Components Overview\nWelcome to your project's architectural map. Define system components and structures here.\n\n## Technology Stack\n- Frontend: React + TypeScript\n- Backend: Rust + Tauri\n- Database: Client-side JSON cache\n\n## System Context\n\`\`\`mermaid\ngraph TD\n  Agent[Agent CLI] --> PTY[PTY Process]\n  PTY --> Dashboard[Orchestrator UI]\n\`\`\`\n`;
    const decTemplate = `# Architectural Decisions (ADR)\n\n## ADR-001: Initial Architecture Template\n- **Date**: ${new Date().toISOString().split("T")[0]}\n- **Status**: Approved\n- **Context**: Setting up workspace memory blocks.\n- **Decision**: Initialize architecture, decisions, tasks, and findings markdown logs at project root.\n- **Consequences**: Standardized configuration tracking.\n`;
    const findTemplate = `# Project Findings & Learnings\n\n## Finding-001: Setup Verification\n- **Author**: System\n- **Symptom**: Verifying environment settings.\n- **Resolution**: Project workspace memory files successfully loaded.\n`;

    try {
      const tasksContent = await invoke<string>("init_project_memory", {
        path: pathNormalized,
        archContent: archTemplate,
        decContent: decTemplate,
        findContent: findTemplate
      });

      if (tasksContent) {
        const parsedTasks: Task[] = [];
        const lines = tasksContent.split("\n");
        let currentStatus: Task['status'] = 'todo';

        const TASK_LINE_REGEX = /^-\s+\[([ x\/])\]\s+(.+?)(?:\s+\((?:Assigned|Agent):\s+(.+?)\))?$/;
        const METADATA_COMMENT_REGEX = /<!--\s*id:\s*([a-zA-Z0-9_-]+),\s*createdAt:\s*([^\s]+?)\s*-->/;
        const METADATA_NESTED_REGEX = /^-\s+Description:\s*(.*)$/i;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.toLowerCase().includes("## todo")) {
            currentStatus = 'todo';
            continue;
          } else if (line.toLowerCase().includes("## doing")) {
            currentStatus = 'doing';
            continue;
          } else if (line.toLowerCase().includes("## review")) {
            currentStatus = 'review';
            continue;
          } else if (line.toLowerCase().includes("## done")) {
            currentStatus = 'done';
            continue;
          }

          const match = line.match(TASK_LINE_REGEX);
          if (match) {
            const [_, char, title, agentInfo] = match;
            if (title.trim().toLowerCase() === "(no tasks)") continue;

            const isDone = char === 'x';
            const isDoing = char === '/';
            const status = isDone ? 'done' : (isDoing ? 'doing' : currentStatus);

            let assignedAgentId: string | null = null;
            if (agentInfo) {
              const cleanedAgentInfo = agentInfo.trim();
              const hashIdx = cleanedAgentInfo.lastIndexOf("#");
              if (hashIdx !== -1) {
                assignedAgentId = cleanedAgentInfo.substring(hashIdx + 1).trim();
              } else {
                // Fallback: search by name
                const foundAgent = get().agents.find(a => a.name === cleanedAgentInfo);
                if (foundAgent) {
                  assignedAgentId = foundAgent.id;
                }
              }
            }

            let id = Math.random().toString(36).substring(7);
            let createdAt = new Date().toISOString();
            let description = "";

            // Lookahead details scanning
            let nextIdx = i + 1;
            while (nextIdx < lines.length) {
              const nextLineRaw = lines[nextIdx];
              const nextLineTrimmed = nextLineRaw.trim();

              if (!nextLineTrimmed) {
                if (description) {
                  description += "\n";
                }
                nextIdx++;
                continue;
              }

              // Check if we hit the next task or section header
              if (
                nextLineTrimmed.startsWith('- [ ]') ||
                nextLineTrimmed.startsWith('- [/]') ||
                nextLineTrimmed.startsWith('- [x]') ||
                nextLineTrimmed.startsWith('## ')
              ) {
                break;
              }

              // Match hidden state metadata comment
              const metaMatch = nextLineTrimmed.match(METADATA_COMMENT_REGEX);
              if (metaMatch) {
                id = metaMatch[1];
                createdAt = metaMatch[2];
                nextIdx++;
                continue;
              }

              // Match description label
              const descMatch = nextLineTrimmed.match(METADATA_NESTED_REGEX);
              if (descMatch) {
                description = descMatch[1].trim();
                nextIdx++;
                continue;
              }

              // Capture nested indented text block
              if (nextLineRaw.startsWith(" ") || nextLineRaw.startsWith("\t")) {
                const cleanText = nextLineTrimmed;
                if (description) {
                  if (description.endsWith("\n")) {
                    description += cleanText;
                  } else {
                    description += "\n" + cleanText;
                  }
                } else {
                  description = cleanText;
                }
              } else {
                // Break if unindented non-metadata block
                break;
              }

              nextIdx++;
            }

            // Advance outer loop index past processed lines
            i = nextIdx - 1;

            parsedTasks.push({
              id,
              projectId,
              title: title.trim(),
              description: description.trim(),
              status,
              assignedAgentId,
              priority: 'medium',
              tags: [],
              createdAt
            });
          }
        }

        set((state) => {
          const otherTasks = state.tasks.filter(t => t.projectId !== projectId);
          return { tasks: [...otherTasks, ...parsedTasks] };
        });
      } else {
        await get().syncTasksWithFile(projectId);
      }
    } catch (err) {
      console.error("Failed to initialize project memory files:", err);
    }
  },

  healProjectNotFound: async (sessionId) => {
    const term = get().terminals.find(t => t.id === sessionId);
    if (!term) return;

    let commandArgs = term.args || [];
    if (!commandArgs.includes('--new-project')) {
      commandArgs = [...commandArgs, '--new-project'];
    }

    try {
      console.warn(`[Self-Healing] Killing dead terminal session ${sessionId} before respawning with --new-project...`);
      await invoke("kill_pty", { sessionId });
      
      // Allow ConPTY kernel a brief moment to release process bindings
      await new Promise(r => setTimeout(r, 200));

      const pid = await invoke<number | null>("spawn_pty", {
        sessionId,
        command: term.command || null,
        args: commandArgs,
        cwd: term.cwd || null,
        env: term.env || null
      });

      if (pid) {
        await invoke("register_terminal_pid", {
          tool: term.command || "generic",
          sessionId,
          cwd: term.cwd || "",
          pid
        });
      }

      console.log(`[Self-Healing] Successfully respawned terminal ${sessionId} with --new-project`);
    } catch (e) {
      console.error(`[Self-Healing] Failed to recover PTY session ${sessionId}:`, e);
    }
  }
}));

(window as any).__useOrchestratorStore = useOrchestratorStore;
