import { create } from "zustand";
import { ExecutionSummary, ExecutionDraft, swarmApi, createExecutionEvents, Unsubscribe } from "../services/ExecutionEvents";

interface SwarmState {
  executions: ExecutionSummary[];
  drafts: ExecutionDraft[];
  selectedExecutionId: string | null;
  isSwarmPanelVisible: boolean;
  swarmPanelHeight: number;
  filterStatus: "all" | "running" | "validating" | "completed" | "failed" | "pending_review" | "terminated";
  isLaunchPanelOpen: boolean;
  isLoading: boolean;

  // Actions
  startPolling: () => Unsubscribe;
  loadExecutions: () => Promise<void>;
  selectExecution: (id: string | null) => void;
  setSwarmPanelVisible: (v: boolean) => void;
  setSwarmPanelHeight: (h: number) => void;
  setFilter: (status: SwarmState["filterStatus"]) => void;
  setLaunchPanelOpen: (v: boolean) => void;

  // Execution actions
  terminateExecution: (id: string) => Promise<void>;
  approveExecution: (id: string) => Promise<void>;
  rejectExecution: (id: string) => Promise<void>;

  // Draft actions
  loadDrafts: () => Promise<void>;
  discardDraft: (id: string) => Promise<void>;
}

export const useSwarmStore = create<SwarmState>((set, get) => ({
  executions: [],
  drafts: [],
  selectedExecutionId: null,
  isSwarmPanelVisible: false,
  swarmPanelHeight: 500,
  filterStatus: "all",
  isLaunchPanelOpen: false,
  isLoading: false,

  startPolling: () => {
    const events = createExecutionEvents();
    return events.subscribe((executions) => {
      set({ executions, isLoading: false });
    });
  },

  loadExecutions: async () => {
    try {
      set({ isLoading: true });
      const executions = await swarmApi.listExecutions();
      set({ executions, isLoading: false });
    } catch (e) {
      console.error("[swarmStore] Failed to load executions:", e);
      set({ isLoading: false });
    }
  },

  selectExecution: (id) => set({ selectedExecutionId: id }),

  setSwarmPanelVisible: (v) => set({ isSwarmPanelVisible: v }),

  setSwarmPanelHeight: (h) => set({ swarmPanelHeight: Math.max(200, Math.min(h, 700)) }),

  setFilter: (filterStatus) => set({ filterStatus }),

  setLaunchPanelOpen: (v) => set({ isLaunchPanelOpen: v }),

  terminateExecution: async (id) => {
    await swarmApi.terminateExecution(id);
    await get().loadExecutions();
  },

  approveExecution: async (id) => {
    await swarmApi.approveMerge(id);
    await get().loadExecutions();
  },

  rejectExecution: async (id) => {
    await swarmApi.rejectMerge(id);
    await get().loadExecutions();
  },

  loadDrafts: async () => {
    const drafts = await swarmApi.listDrafts();
    set({ drafts });
  },

  discardDraft: async (id) => {
    await swarmApi.discardDraft(id);
    await get().loadDrafts();
  },
}));
