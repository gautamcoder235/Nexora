import { StateCreator } from 'zustand';
import { Workspace, Project } from '../../types';
import { invoke } from '@tauri-apps/api/core';
import { EventBus } from '../../core/events';

export interface WorkspaceSlice {
  activeWorkspaceId: string | null;
  activeSessionId: string | null;
  workspaces: Workspace[];
  projects: Project[];

  createWorkspace: (name: string, rootPath: string) => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  addProject: (name: string, path: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newName: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, newName: string) => Promise<void>;
}

export const createWorkspaceSlice: StateCreator<any, [], [], WorkspaceSlice> = (set, get) => ({
  activeWorkspaceId: null,
  activeSessionId: null,
  workspaces: [],
  projects: [],

  createWorkspace: async (name, rootPath) => {
    const newWorkspace: Workspace = {
      id: Math.random().toString(36).substring(7),
      name,
      rootPath,
      projectIds: [],
      lastOpened: Date.now()
    };

    set((state: any) => ({
      workspaces: [...state.workspaces, newWorkspace],
      activeWorkspaceId: newWorkspace.id,
      isSidebarVisible: false,
      terminals: [],
      layout: { type: 'grid', panels: [] }
    }));

    if (typeof get().logActivity === 'function') {
      get().logActivity('workspace', 'info', `Created workspace: ${name} at ${rootPath}`, '', undefined);
    }
    if (typeof get().saveSnapshot === 'function') {
      get().saveSnapshot();
    }
  },

  selectWorkspace: async (workspaceId) => {
    const ws = get().workspaces.find((w: Workspace) => w.id === workspaceId);
    if (!ws) return;

    set((state: any) => ({
      activeWorkspaceId: workspaceId,
      isSidebarVisible: false,
      terminals: [],
      completedTerminals: [],
      layout: { type: 'grid', panels: [] },
      workspaces: state.workspaces.map((w: Workspace) => w.id === workspaceId ? { ...w, lastOpened: Date.now() } : w)
    }));

    requestAnimationFrame(() => {
      setTimeout(async () => {
        try {
          await invoke("kill_all_ptys");
        } catch(e) {
          console.warn("Error cleaning previous PTYs:", e);
        }

        if (typeof get().loadSnapshot === 'function') {
          await get().loadSnapshot();
        }

        EventBus.publish("workspace:changed", { workspaceId });

        invoke("notify_workspace_switch", { workspaceId }).catch((err) => {
          console.error("Failed to notify workspace switch:", err);
        });

        if (typeof get().logActivity === 'function') {
          get().logActivity('workspace', 'info', `Switched to workspace: ${ws.name}`, '', undefined);
        }

        const workspaceProjects = get().projects.filter((p: Project) => p.workspaceId === workspaceId);
        if (typeof get().initializeProjectMemory === 'function') {
          Promise.all(workspaceProjects.map((proj: Project) => get().initializeProjectMemory(proj.id))).catch(console.error);
        }
      }, 0);
    });
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

    set((state: any) => {
      const remainingProjects = state.projects.filter((p: Project) => p.workspaceId !== workspaceId);
      const projectIdsToDelete = new Set(state.projects.filter((p: Project) => p.workspaceId === workspaceId).map((p: Project) => p.id));
      const remainingAgents = state.agents.filter((a: any) => !a.projectId || !projectIdsToDelete.has(a.projectId));
      const remainingTasks = state.tasks.filter((t: any) => !projectIdsToDelete.has(t.projectId));
      const remainingWorkspaces = state.workspaces.filter((w: Workspace) => w.id !== workspaceId);

      return {
        workspaces: remainingWorkspaces,
        projects: remainingProjects,
        agents: remainingAgents,
        tasks: remainingTasks
      };
    });

    if (typeof get().logActivity === 'function') {
      get().logActivity('workspace', 'warning', `Deleted Workspace Session`, '', undefined);
    }
    if (typeof get().saveSnapshot === 'function') {
      get().saveSnapshot();
    }
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

    set((state: any) => {
      const updatedWorkspaces = state.workspaces.map((ws: Workspace) => {
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

    if (typeof get().logActivity === 'function') {
      get().logActivity('workspace', 'info', `Added project "${name}" mapping to ${path}`, newProject.id);
    }
    if (typeof get().initializeProjectMemory === 'function') {
      get().initializeProjectMemory(newProject.id).then(() => {
        if (typeof get().saveSnapshot === 'function') get().saveSnapshot();
      }).catch(console.error);
    }
  },

  deleteProject: async (projectId) => {
    const { activeWorkspaceId } = get();
    if (!activeWorkspaceId) return;

    const project = get().projects.find((p: Project) => p.id === projectId);
    if (!project) return;

    const projectTerminals = (get().terminals || []).filter((t: any) => t.projectId === projectId);
    for (const term of projectTerminals) {
      try {
        await invoke("close_terminal", { id: term.id });
      } catch (e) {
        console.error(`Failed to close terminal ${term.id} on project delete:`, e);
      }
    }

    set((state: any) => {
      const updatedWorkspaces = state.workspaces.map((ws: Workspace) => {
        if (ws.id === activeWorkspaceId) {
          return { ...ws, projectIds: ws.projectIds.filter((id: string) => id !== projectId) };
        }
        return ws;
      });

      const remainingProjects = state.projects.filter((p: Project) => p.id !== projectId);
      const remainingAgents = state.agents.filter((a: any) => a.projectId !== projectId);
      const remainingTasks = state.tasks.filter((t: any) => t.projectId !== projectId);
      const remainingTerminals = state.terminals.filter((t: any) => t.projectId !== projectId);

      return {
        workspaces: updatedWorkspaces,
        projects: remainingProjects,
        agents: remainingAgents,
        tasks: remainingTasks,
        terminals: remainingTerminals
      };
    });

    if (typeof get().logActivity === 'function') {
      get().logActivity('workspace', 'warning', `Deleted Project Session "${project.name}"`, '', undefined);
    }
    if (typeof get().saveSnapshot === 'function') {
      get().saveSnapshot();
    }
  },

  renameProject: async (projectId, newName) => {
    if (!newName.trim()) return;

    const project = get().projects.find((p: Project) => p.id === projectId);
    if (!project) return;

    set((state: any) => ({
      projects: state.projects.map((p: Project) => p.id === projectId ? { ...p, name: newName } : p)
    }));

    if (typeof get().logActivity === 'function') {
      get().logActivity('workspace', 'info', `Renamed Project "${project.name}" to "${newName}"`, projectId);
    }
    if (typeof get().saveSnapshot === 'function') {
      get().saveSnapshot();
    }
  },

  renameWorkspace: async (workspaceId, newName) => {
    if (!newName.trim()) return;

    const workspace = get().workspaces.find((w: Workspace) => w.id === workspaceId);
    if (!workspace) return;

    set((state: any) => ({
      workspaces: state.workspaces.map((w: Workspace) => w.id === workspaceId ? { ...w, name: newName } : w)
    }));

    if (typeof get().logActivity === 'function') {
      get().logActivity('workspace', 'info', `Renamed Workspace "${workspace.name}" to "${newName}"`, '', undefined);
    }
    if (typeof get().saveSnapshot === 'function') {
      get().saveSnapshot();
    }
  },
});
