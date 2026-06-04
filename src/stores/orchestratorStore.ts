import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
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
  Task
} from "../types";
import { EventBus } from "../core/events";
import { agentTemplates } from "../agents/templates";
import { PluginRegistry } from "../plugins";

export interface DialogConfig {
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface OrchestratorState {
  activeWorkspaceId: string | null;
  activeSessionId: string | null;
  workspaces: Workspace[];
  projects: Project[];
  agents: AgentProfile[];
  terminals: TerminalSession[];
  layout: TerminalLayout;
  activityFeed: ActivityLog[];
  cliInstalledStatuses: Record<string, boolean>;
  tasks: Task[];
  isSidebarVisible: boolean;
  isTaskCenterVisible: boolean;
  sidebarWidth: number;
  topPanelHeight: number;
  
  // Actions
  setSidebarVisible: (visible: boolean) => void;
  setTaskCenterVisible: (visible: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setTopPanelHeight: (height: number) => void;
  initStore: () => Promise<void>;
  createWorkspace: (name: string, rootPath: string) => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  addProject: (name: string, path: string) => Promise<void>;
  createAgent: (profile: Omit<AgentProfile, "id" | "status" | "runtimeSeconds" | "lastActive" | "terminalSessionIds">) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  
  // Tasks actions
  createTask: (projectId: string, title: string, description: string) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, status: Task['status']) => Promise<void>;
  assignTask: (taskId: string, agentId: string | null) => Promise<void>;
  syncTasksWithFile: (projectId: string) => Promise<void>;
  initializeProjectMemory: (projectId: string) => Promise<void>;

  // Terminal actions
  spawnTerminal: (projectId: string, agentId?: string, customCommand?: string, customArgs?: string[]) => Promise<string>;
  killTerminal: (sessionId: string) => Promise<void>;
  changeLayoutType: (layoutType: 'grid' | 'vertical' | 'horizontal') => void;
  updateTerminalHistory: (sessionId: string, history: string) => void;
  reconnectTerminal: (sessionId: string) => Promise<void>;
  
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
  saveSnapshot: () => Promise<void>;
  loadSnapshot: () => Promise<void>;

  // V2 additions
  checkAgentCli: (pluginId: string) => Promise<boolean>;
  spawnTeamTemplate: (projectId: string, templateId: string) => Promise<void>;
  updateAgent: (agentId: string, updates: Partial<AgentProfile>) => Promise<void>;
  
  // Dialog Actions
  dialog: DialogConfig | null;
  showAlertDialog: (title: string, message: string) => void;
  showConfirmDialog: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  closeDialog: () => void;
}

// Global agent runtime ticker timer
let runtimeInterval: any = null;

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  activeWorkspaceId: null,
  activeSessionId: null,
  workspaces: [],
  projects: [],
  agents: [],
  terminals: [],
  layout: {
    type: 'grid',
    panels: []
  },
  activityFeed: [],
  cliInstalledStatuses: {},
  tasks: [],
  isSidebarVisible: true,
  isTaskCenterVisible: true,
  sidebarWidth: 490,
  topPanelHeight: 320,

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
    get().saveSnapshot();
  },
  setTopPanelHeight: (height) => {
    set({ topPanelHeight: height });
    get().saveSnapshot();
  },

  initStore: async () => {
    try {
      // 1. Load active snapshot / session configuration list
      const configStr = await invoke<string>("load_config", { filename: "session.json" });
      if (configStr && configStr !== "{}") {
        const data = JSON.parse(configStr);
        
        // Restore workspaces, projects, agents database lists
        set({
          workspaces: data.workspaces || [],
          projects: data.projects || [],
          agents: data.agents || [],
          tasks: data.tasks || [],
          activityFeed: data.activityFeed || [],
          activeWorkspaceId: data.activeWorkspaceId || null
        });

        // 2. If an active workspace was set, load its terminal layouts snapshot
        if (data.activeWorkspaceId) {
          await get().loadSnapshot();
        }
      }

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
      projectIds: []
    };

    set((state) => ({
      workspaces: [...state.workspaces, newWorkspace],
      activeWorkspaceId: newWorkspace.id,
      projects: [],
      agents: [],
      terminals: [],
      layout: { type: 'grid', panels: [] }
    }));

    get().logActivity('workspace', 'info', `Created workspace: ${name} at ${rootPath}`, '', undefined);
    
    // Save database mappings
    await get().saveSnapshot();
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

    set({ 
      activeWorkspaceId: workspaceId,
      terminals: [],
      layout: { type: 'grid', panels: [] }
    });

    // 2. Load the target snapshot layouts
    await get().loadSnapshot();
    
    // Log change
    EventBus.publish("workspace:changed", { workspaceId });
    get().logActivity('workspace', 'info', `Switched to workspace: ${ws.name}`, '', undefined);

    // 3. Sync memory files and tasks checklists
    const workspaceProjects = get().projects.filter(p => p.workspaceId === workspaceId);
    for (const proj of workspaceProjects) {
      await get().initializeProjectMemory(proj.id);
    }
    
    await get().saveSnapshot();
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
    await get().saveSnapshot();
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
    await get().initializeProjectMemory(newProject.id);
    await get().saveSnapshot();
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
        agents: [...state.agents, newAgent],
        projects: updatedProjects
      };
    });

    get().logActivity('system', 'info', `Registered Agent Profile: "${profile.name}"`, profile.projectId || '');
    await get().saveSnapshot();
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
    await get().saveSnapshot();
  },

  spawnTerminal: async (projectId, agentId, customCommand, customArgs) => {
    const project = get().projects.find(p => p.id === projectId);
    const agent = agentId ? get().agents.find(a => a.id === agentId) : null;
    const sessionPath = project ? project.path : (get().workspaces.find(w => w.id === get().activeWorkspaceId)?.rootPath || "");

    const sessionId = Math.random().toString(36).substring(7);

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
      args = agent.arguments;
      title = `${agent.name} CLI`;
    } else if (navigator.userAgent.includes("Windows")) {
      title = "Powershell";
    }

    const newTerminal: TerminalSession = {
      id: sessionId,
      projectId,
      agentId,
      title,
      status: 'connected',
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
          return { ...p, terminalSessionIds: [...p.terminalSessionIds, sessionId] };
        }
        return p;
      });

      // 2. Link terminal to agent and flip agent to running status
      const updatedAgents = state.agents.map(a => {
        if (agent && a.id === agent.id) {
          return {
            ...a,
            status: 'running' as AgentStatus,
            terminalSessionIds: [...a.terminalSessionIds, sessionId],
            lastActive: new Date().toISOString()
          };
        }
        return a;
      });

      return {
        terminals: [...state.terminals, newTerminal],
        projects: updatedProjects,
        agents: updatedAgents,
        layout: {
          ...state.layout,
          panels: [...state.layout.panels, newPanel]
        }
      };
    });

    // 3. Invoke Tauri Rust shell spawner
    try {
      await invoke("spawn_pty", {
        sessionId,
        command,
        args,
        cwd: sessionPath,
        env: agent ? agent.env : {}
      });

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
    } catch (e) {
      console.error("PTY Spawner failed:", e);
      get().logActivity('terminal', 'error', `PTY Spawner failed: ${e}`, projectId, agentId);
    }

    await get().saveSnapshot();
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
          return {
            ...a,
            status: (remainingTerms.length === 0 ? 'idle' : 'running') as AgentStatus,
            terminalSessionIds: remainingTerms,
            lastActive: new Date().toISOString()
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
    await get().saveSnapshot();
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

  updateTerminalHistory: (sessionId, history) => {
    set((state) => ({
      terminals: state.terminals.map((terminal) =>
        terminal.id === sessionId
          ? { ...terminal, history }
          : terminal
      )
    }));
  },

  reconnectTerminal: async (sessionId) => {
    const term = get().terminals.find(t => t.id === sessionId);
    if (!term) return;

    try {
      await invoke("spawn_pty", {
        sessionId,
        command: term.command || null,
        args: term.args || null,
        cwd: term.cwd || null,
        env: term.env || null
      });

      set((state) => {
        const updatedTerminals = state.terminals.map(t =>
          t.id === sessionId ? { ...t, status: 'connected' as const } : t
        );
        const updatedAgents = state.agents.map(a => {
          if (term.agentId && a.id === term.agentId) {
            return { ...a, status: 'running' as const };
          }
          return a;
        });
        return { terminals: updatedTerminals, agents: updatedAgents };
      });
    } catch (e) {
      console.error(`Failed to reconnect PTY session ${sessionId}:`, e);
      set((state) => {
        const updatedTerminals = state.terminals.map(t =>
          t.id === sessionId ? { ...t, status: 'disconnected' as const } : t
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

  saveSnapshot: async () => {
    const state = get();
    
    // 1. Save global database mappings in session.json
    const dbPayload = {
      workspaces: state.workspaces,
      projects: state.projects,
      agents: state.agents,
      tasks: state.tasks,
      activityFeed: state.activityFeed,
      activeWorkspaceId: state.activeWorkspaceId
    };

    try {
      await invoke("save_config", {
        filename: "session.json",
        content: JSON.stringify(dbPayload)
      });

      // 2. If a workspace is active, save its active layout session snapshot
      if (state.activeWorkspaceId) {
        const snapPayload: WorkspaceSnapshot = {
          workspaceId: state.activeWorkspaceId,
          sessionId: state.activeSessionId || Math.random().toString(36).substring(7),
          terminals: state.terminals,
          agents: state.agents,
          tasks: state.tasks,
          layout: state.layout,
          timestamp: new Date().toISOString(),
          isSidebarVisible: state.isSidebarVisible,
          isTaskCenterVisible: state.isTaskCenterVisible,
          sidebarWidth: state.sidebarWidth,
          topPanelHeight: state.topPanelHeight
        };

        await invoke("save_config", {
          filename: `${state.activeWorkspaceId}_snapshot.json`,
          content: JSON.stringify(snapPayload)
        });
      }
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

        // Restore terminals (but mark them as disconnected initially since PTY processes are not running)
        const restoredTerminals = (snapshot.terminals || []).map(t => ({
          ...t,
          status: 'disconnected' as const
        }));
        const restoredTerminalIds = new Set(restoredTerminals.map((terminal) => terminal.id));
        
        // Clean up agent statuses if their terminal IDs are not in the restored terminals list
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
          layout: snapshot.layout || { type: 'grid', panels: [] },
          isSidebarVisible: snapshot.isSidebarVisible !== undefined ? snapshot.isSidebarVisible : true,
          isTaskCenterVisible: snapshot.isTaskCenterVisible !== undefined ? snapshot.isTaskCenterVisible : true,
          sidebarWidth: snapshot.sidebarWidth !== undefined ? snapshot.sidebarWidth : 490,
          topPanelHeight: snapshot.topPanelHeight !== undefined ? snapshot.topPanelHeight : 320
        });

        // Trigger reconnect for each restored terminal session asynchronously
        for (const term of restoredTerminals) {
          get().reconnectTerminal(term.id);
        }
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

    await get().saveSnapshot();
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
    await get().saveSnapshot();
  },

  createTask: async (projectId, title, description) => {
    const newTask: Task = {
      id: Math.random().toString(36).substring(7),
      projectId,
      title,
      description,
      status: 'todo',
      assignedAgentId: null,
      createdAt: new Date().toISOString()
    };
    
    set((state) => ({
      tasks: [...state.tasks, newTask]
    }));

    get().logActivity('workspace', 'info', `Created task: "${title}"`, projectId);
    await get().syncTasksWithFile(projectId);
    await get().saveSnapshot();
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
    await get().saveSnapshot();
  },

  deleteTask: async (taskId) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (!task) return;

    set((state) => ({
      tasks: state.tasks.filter(t => t.id !== taskId)
    }));

    get().logActivity('workspace', 'warning', `Deleted task: "${task.title}"`, task.projectId);
    await get().syncTasksWithFile(task.projectId);
    await get().saveSnapshot();
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
    await get().saveSnapshot();
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
    await get().saveSnapshot();
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
      const archPath = `${pathNormalized}/architecture.md`;
      try {
        await invoke("read_project_file", { path: archPath });
      } catch (e) {
        await invoke("write_project_file", { path: archPath, content: archTemplate });
      }

      const decPath = `${pathNormalized}/decisions.md`;
      try {
        await invoke("read_project_file", { path: decPath });
      } catch (e) {
        await invoke("write_project_file", { path: decPath, content: decTemplate });
      }

      const findPath = `${pathNormalized}/findings.md`;
      try {
        await invoke("read_project_file", { path: findPath });
      } catch (e) {
        await invoke("write_project_file", { path: findPath, content: findTemplate });
      }

      const tasksPath = `${pathNormalized}/tasks.md`;
      let tasksContent = "";
      try {
        tasksContent = await invoke<string>("read_project_file", { path: tasksPath });
      } catch (e) {
        // file doesn't exist
      }

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
  }
}));
