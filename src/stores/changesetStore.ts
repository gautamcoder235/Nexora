import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Changeset, ChangesetFile, ReviewComment, ChangesetStatus, FileChangeStatus, CommentSeverity, ChangeSource } from '../types/changeset';

// ── Nexora Memory Core Types ──

export interface HistoryEntry {
  id: string;
  file_path: string;
  old_hash: string | null;
  new_hash: string;
  size: number;
  operation: string;   // created | modified | deleted | renamed
  source: string;      // user | agent | terminal | external | system | restore
  timestamp: string;
  old_path: string | null;
  review_status: string | null;  // pending | approved | rejected
  review_id: string | null;
}

export interface CaptureResult {
  total_scanned: number;
  changes_found: number;
  new_entries: HistoryEntry[];
}

export interface MemoryCheckpoint {
  id: string;
  name: string;
  timestamp: string;
  file_count: number;
}

interface ChangesetState {
  activeChangesetId: string | null;
  changesets: Record<string, Changeset>;
  isLoading: boolean;
  error: string | null;
  isReviewCenterOpen: boolean;
  isReviewPanelPinned: boolean;
  reviewPanelWidth: number;
  selectedAgentIdForInspector: string | null;
  isAgentInspectorOpen: boolean;
  activeReviewTab: 'changeset' | 'workspace' | 'worktree_explorer';

  // Memory Core state
  isMemoryInitialized: boolean;
  isInitializing: boolean;
  pendingChanges: HistoryEntry[];
  timeline: HistoryEntry[];
  isCapturing: boolean;
  isLoadingChanges: boolean;
  checkpoints: MemoryCheckpoint[];

  // Actions — UI
  setReviewCenterOpen: (open: boolean) => void;
  toggleReviewPanelPinned: () => void;
  setReviewPanelWidth: (width: number) => void;
  setSelectedAgentIdForInspector: (agentId: string | null) => void;
  setAgentInspectorOpen: (open: boolean) => void;
  setActiveReviewTab: (tab: 'changeset' | 'workspace' | 'worktree_explorer') => void;

  // Actions — Memory Core
  initMemory: (projectPath: string) => Promise<void>;
  captureChanges: (projectPath: string, source?: string) => Promise<CaptureResult | null>;
  loadPendingChanges: (projectPath: string) => Promise<void>;
  loadTimeline: (projectPath: string, limit?: number) => Promise<void>;
  approveChange: (projectPath: string, historyId: string) => Promise<void>;
  rejectChange: (projectPath: string, historyId: string) => Promise<void>;
  restoreFile: (projectPath: string, filePath: string, hash: string) => Promise<void>;
  createCheckpoint: (projectPath: string, name: string) => Promise<void>;
  loadCheckpoints: (projectPath: string) => Promise<void>;
  readVersion: (projectPath: string, hash: string) => Promise<string>;

  // Stub changeset API calls (kept for compatibility)
  loadChangesets: () => Promise<void>;
  selectChangeset: (changesetId: string) => Promise<void>;
  createDraftChangeset: (title: string, agentId: string, explanation?: string) => Promise<string>;
  addFileToChangeset: (changesetId: string, path: string, oldContent: string, newContent: string, patch: string, changeSource: ChangeSource) => Promise<void>;
  addComment: (changesetId: string, path: string | null, lineNumber: number | null, agentName: string, comment: string, severity: CommentSeverity) => Promise<void>;
  updateFileStatus: (changesetId: string, path: string, status: FileChangeStatus) => Promise<void>;
  runValidation: (changesetId: string, repoPath: string) => Promise<void>;
  applyChangesetTransaction: (changesetId: string, repoPath: string) => Promise<boolean>;
  rollbackChangeset: (changesetId: string, repoPath: string) => Promise<boolean>;
}

export const useChangesetStore = create<ChangesetState>((set, get) => ({
  activeChangesetId: null,
  changesets: {},
  isLoading: false,
  error: null,
  isReviewCenterOpen: false,
  isReviewPanelPinned: false,
  reviewPanelWidth: 640,
  selectedAgentIdForInspector: null,
  isAgentInspectorOpen: false,
  activeReviewTab: 'changeset',

  // Memory Core state
  isMemoryInitialized: false,
  isInitializing: false,
  pendingChanges: [],
  timeline: [],
  isCapturing: false,
  isLoadingChanges: false,
  checkpoints: [],

  // UI actions
  setReviewCenterOpen: (open: boolean) => set({ isReviewCenterOpen: open }),
  toggleReviewPanelPinned: () => set((s) => ({ isReviewPanelPinned: !s.isReviewPanelPinned })),
  setReviewPanelWidth: (width: number) => set({ reviewPanelWidth: width }),
  setSelectedAgentIdForInspector: (agentId: string | null) => set({ selectedAgentIdForInspector: agentId }),
  setAgentInspectorOpen: (open: boolean) => set({ isAgentInspectorOpen: open }),
  setActiveReviewTab: (tab) => set({ activeReviewTab: tab }),

  // ── Memory Core actions ──

  initMemory: async (projectPath: string) => {
    set({ isInitializing: true });
    try {
      await invoke<number>('memory_init', { projectPath });
      set({ isMemoryInitialized: true, isInitializing: false });
    } catch (e) {
      console.error('memory_init failed:', e);
      set({ isInitializing: false });
    }
  },

  captureChanges: async (projectPath: string, source?: string) => {
    set({ isCapturing: true });
    try {
      const result = await invoke<CaptureResult>('memory_capture', { projectPath, source: source || null });
      // Reload pending changes after capture
      const pending = await invoke<HistoryEntry[]>('memory_get_pending', { projectPath });
      set({ pendingChanges: pending, isCapturing: false });
      return result;
    } catch (e) {
      console.error('memory_capture failed:', e);
      set({ isCapturing: false });
      return null;
    }
  },

  loadPendingChanges: async (projectPath: string) => {
    set({ isLoadingChanges: true });
    try {
      const pending = await invoke<HistoryEntry[]>('memory_get_pending', { projectPath });
      set({ pendingChanges: pending, isLoadingChanges: false });
    } catch (e) {
      console.error('memory_get_pending failed:', e);
      set({ pendingChanges: [], isLoadingChanges: false });
    }
  },

  loadTimeline: async (projectPath: string, limit?: number) => {
    try {
      const tl = await invoke<HistoryEntry[]>('memory_get_timeline', { projectPath, limit: limit || null });
      set({ timeline: tl });
    } catch (e) {
      console.error('memory_get_timeline failed:', e);
    }
  },

  approveChange: async (projectPath: string, historyId: string) => {
    try {
      await invoke('memory_approve_change', { projectPath, historyId });
      // Remove from pending
      set((s) => ({ pendingChanges: s.pendingChanges.filter(c => c.id !== historyId) }));
    } catch (e) {
      console.error('memory_approve_change failed:', e);
    }
  },

  rejectChange: async (projectPath: string, historyId: string) => {
    try {
      await invoke('memory_reject_change', { projectPath, historyId });
      // Remove from pending
      set((s) => ({ pendingChanges: s.pendingChanges.filter(c => c.id !== historyId) }));
    } catch (e) {
      console.error('memory_reject_change failed:', e);
    }
  },

  restoreFile: async (projectPath: string, filePath: string, hash: string) => {
    try {
      await invoke('memory_restore_file', { projectPath, filePath, hash });
    } catch (e) {
      console.error('memory_restore_file failed:', e);
    }
  },

  createCheckpoint: async (projectPath: string, name: string) => {
    try {
      await invoke<string>('memory_create_checkpoint', { projectPath, name });
      set({ pendingChanges: [] });
      // Reload checkpoints
      const cps = await invoke<MemoryCheckpoint[]>('memory_get_checkpoints', { projectPath });
      set({ checkpoints: cps });
    } catch (e) {
      console.error('memory_create_checkpoint failed:', e);
    }
  },

  loadCheckpoints: async (projectPath: string) => {
    try {
      const cps = await invoke<MemoryCheckpoint[]>('memory_get_checkpoints', { projectPath });
      set({ checkpoints: cps });
    } catch (e) {
      console.error('memory_get_checkpoints failed:', e);
    }
  },

  readVersion: async (projectPath: string, hash: string) => {
    try {
      return await invoke<string>('memory_read_version', { projectPath, hash });
    } catch (e) {
      console.error('memory_read_version failed:', e);
      return '';
    }
  },

  // Stubs
  loadChangesets: async () => { set({ isLoading: true }); setTimeout(() => set({ isLoading: false }), 50); },
  selectChangeset: async (changesetId: string) => { set({ activeChangesetId: changesetId }); },
  createDraftChangeset: async () => `cset-${Date.now()}`,
  addFileToChangeset: async () => {},
  addComment: async () => {},
  updateFileStatus: async () => {},
  runValidation: async () => {},
  applyChangesetTransaction: async () => true,
  rollbackChangeset: async () => true,
}));
