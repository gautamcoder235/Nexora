import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { TeamNode, TeamEdge } from '../types/team';
import { KanbanTask, TaskState } from '../types/task';
import { AgentMessage, AgentRole } from '../types/agent';
import { SystemEvent } from '../types/events';

interface TeamStoreState {
  nodes: TeamNode[];
  edges: TeamEdge[];
  messages: AgentMessage[];
  tasks: KanbanTask[];
  systemEvents: SystemEvent[];
  activeInspectId: string | null;
  isAddAgentOpen: boolean;
  isTeamPanelVisible: boolean;
  teamPanelHeight: number;
  isTeamPaused: boolean;

  // Actions
  fetchState: () => Promise<void>;
  selectInspectNode: (id: string | null) => void;
  setAddAgentOpen: (open: boolean) => void;
  addCustomAgent: (name: string, role: AgentRole, cliCommand: string, connections: string[]) => void;
  updateAgentProperties: (agentId: string, updates: Partial<TeamNode>) => void;
  sendDirective: (agentId: string | null, content: string) => Promise<void>;
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  releaseLocks: (agentId: string) => Promise<void>;
  clearAllMessages: () => Promise<void>;
  setTeamPanelVisible: (visible: boolean) => void;
  setTeamPanelHeight: (height: number) => void;

  // Stubs/Mocks to prevent compilation errors in other components
  executions: any[];
  drafts: any[];
  selectedExecutionId: string | null;
  isLaunchPanelOpen: boolean;
  filterStatus: string;
  isExecutionsLoading: boolean;
  validationProfile: any;
  startExecutionPolling: () => () => void;
  initializeListeners: () => () => void;
  loadExecutions: () => Promise<void>;
  selectExecution: (id: string | null) => void;
  setLaunchPanelOpen: (v: boolean) => void;
  setFilterStatus: (status: string) => void;
  terminateExecution: (id: string) => Promise<void>;
  approveExecution: (id: string) => Promise<void>;
  rejectExecution: (id: string) => Promise<void>;
  loadDrafts: () => Promise<void>;
  discardDraft: (id: string) => Promise<void>;
  sendSwarmCommand: (command: any) => Promise<void>;
  rollbackTask: (taskId: string) => Promise<void>;
  forceValidation: (taskId: string) => Promise<void>;
  updateTaskState: (taskId: string, newState: TaskState) => Promise<void>;
  quarantineAction: (taskId: string, action: 'clone' | 'apply' | 'discard') => Promise<void>;
  pauseTeam: () => Promise<void>;
  resumeTeam: () => Promise<void>;
}

const DEFAULT_NODES: TeamNode[] = [
  {
    id: 'coordinator',
    label: 'Coordinator',
    role: 'coordinator',
    status: 'idle',
    lockedFiles: [],
    currentTaskDescription: 'Standby',
    cliCommand: 'nexora orchestrate',
    promptContext: ['SYSTEM: You are the coordinator.']
  },
  {
    id: 'builder',
    label: 'Builder Agent',
    role: 'builder',
    status: 'idle',
    lockedFiles: [],
    currentTaskDescription: 'Standby',
    cliCommand: 'aider --model claude-3-5-sonnet',
    promptContext: ['SYSTEM: You are the builder.']
  }
];

const DEFAULT_EDGES: TeamEdge[] = [
  {
    id: 'e-coord-builder',
    source: 'coordinator',
    target: 'builder',
    messageCount: 0,
    reviewRequests: 0,
    taskTransfers: 0,
    isActive: false
  }
];

export const useTeamStore = create<TeamStoreState>()(
  persist(
    (set, get) => ({
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
      messages: [],
      tasks: [],
      systemEvents: [],
      activeInspectId: null,
      isAddAgentOpen: false,
      isTeamPanelVisible: false,
      teamPanelHeight: 300,
      isTeamPaused: false,

      // Stubs
      executions: [],
      drafts: [],
      selectedExecutionId: null,
      isLaunchPanelOpen: false,
      filterStatus: 'all',
      isExecutionsLoading: false,
      validationProfile: null,

      fetchState: async () => {
        if (get().nodes.length === 0) {
          set({ nodes: DEFAULT_NODES, edges: DEFAULT_EDGES });
        }
      },

      selectInspectNode: (id) => set({ activeInspectId: id }),

      setAddAgentOpen: (open) => set({ isAddAgentOpen: open }),

      addCustomAgent: (name, role, cliCommand, connections) => {
        const id = `agent-${Date.now()}`;
        const newNode: TeamNode = {
          id,
          label: name,
          role,
          status: 'idle',
          lockedFiles: [],
          currentTaskDescription: 'Standby',
          cliCommand: cliCommand || undefined,
          promptContext: [`SYSTEM: You are a custom ${role} agent.`]
        };

        const newEdges: TeamEdge[] = connections.map((connId) => ({
          id: `e-${id}-${connId}`,
          source: id,
          target: connId,
          messageCount: 0,
          reviewRequests: 0,
          taskTransfers: 0,
          isActive: false
        }));

        set((state) => ({
          nodes: [...state.nodes, newNode],
          edges: [...state.edges, ...newEdges]
        }));
      },

      updateAgentProperties: (agentId, updates) => {
        set((state) => ({
          nodes: state.nodes.map((n) => (n.id === agentId ? { ...n, ...updates } : n))
        }));
      },

      sendDirective: async (agentId, content) => {
        const userMsg: AgentMessage = {
          id: `m-user-${Date.now()}`,
          sender: 'user',
          content,
          timestamp: new Date(),
          blockId: null
        };

        set((state) => ({
          messages: [...state.messages, userMsg]
        }));

        const targetNode = agentId
          ? get().nodes.find((n) => n.id === agentId)
          : get().nodes.find((n) => n.role === 'coordinator');

        if (targetNode && targetNode.connectedTerminalId) {
          try {
            await invoke('write_pty', {
              sessionId: targetNode.connectedTerminalId,
              data: content + '\r'
            });
            
            set((state) => ({
              nodes: state.nodes.map((n) =>
                n.id === targetNode.id ? { ...n, status: 'running' } : n
              )
            }));
          } catch (e) {
            console.error(`Failed to write to PTY terminal (${targetNode.connectedTerminalId}):`, e);
          }
        }
      },

      pauseAgent: async (agentId) => {
        set((state) => ({
          nodes: state.nodes.map((n) => (n.id === agentId ? { ...n, status: 'paused' } : n))
        }));
      },

      resumeAgent: async (agentId) => {
        set((state) => ({
          nodes: state.nodes.map((n) => (n.id === agentId ? { ...n, status: 'running' } : n))
        }));
      },

      releaseLocks: async (agentId) => {
        set((state) => ({
          nodes: state.nodes.map((n) => (n.id === agentId ? { ...n, lockedFiles: [] } : n))
        }));
      },

      clearAllMessages: async () => { set({ messages: [] }); },

      setTeamPanelVisible: (visible) => set({ isTeamPanelVisible: visible }),

      setTeamPanelHeight: (height) => set({ teamPanelHeight: height }),

      // Stub methods implementations
      startExecutionPolling: () => () => {},
      initializeListeners: () => () => {},
      loadExecutions: async () => {},
      selectExecution: () => {},
      setLaunchPanelOpen: () => {},
      setFilterStatus: () => {},
      terminateExecution: async () => {},
      approveExecution: async () => {},
      rejectExecution: async () => {},
      loadDrafts: async () => {},
      discardDraft: async () => {},
      sendSwarmCommand: async () => {},
      rollbackTask: async () => {},
      forceValidation: async () => {},
      updateTaskState: async () => {},
      quarantineAction: async () => {},
      pauseTeam: async () => {
        set({ isTeamPaused: true });
      },
      resumeTeam: async () => {
        set({ isTeamPaused: false });
      }
    }),
    {
      name: 'team-store-storage',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        messages: state.messages,
        isTeamPanelVisible: state.isTeamPanelVisible,
        teamPanelHeight: state.teamPanelHeight
      })
    }
  )
);
