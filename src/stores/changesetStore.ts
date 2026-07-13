import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Changeset, ChangesetFile, ReviewComment, ChangesetStatus, FileChangeStatus, CommentSeverity, ChangeSource } from '../types/changeset';

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

  // File changes state
  ucteChanges: string[];
  isScanningUcte: boolean;
  hasBaseline: boolean;
  baselineFileCount: number;
  isTakingBaseline: boolean;

  // Actions
  setReviewCenterOpen: (open: boolean) => void;
  toggleReviewPanelPinned: () => void;
  setReviewPanelWidth: (width: number) => void;
  setSelectedAgentIdForInspector: (agentId: string | null) => void;
  setAgentInspectorOpen: (open: boolean) => void;
  setActiveReviewTab: (tab: 'changeset' | 'workspace' | 'worktree_explorer') => void;

  // Baseline / Scan Actions
  takeBaseline: (repoPath: string) => Promise<void>;
  scanFileChanges: (repoPath: string) => Promise<void>;
  checkBaselineExists: (repoPath: string) => void;

  // Stub changeset-related API calls
  loadChangesets: () => Promise<void>;
  selectChangeset: (changesetId: string) => Promise<void>;
  createDraftChangeset: (title: string, agentId: string, explanation?: string) => Promise<string>;
  addFileToChangeset: (
    changesetId: string,
    path: string,
    oldContent: string,
    newContent: string,
    patch: string,
    changeSource: ChangeSource
  ) => Promise<void>;
  addComment: (
    changesetId: string,
    path: string | null,
    lineNumber: number | null,
    agentName: string,
    comment: string,
    severity: CommentSeverity
  ) => Promise<void>;
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

  // File changes state
  ucteChanges: [],
  isScanningUcte: false,
  hasBaseline: false,
  baselineFileCount: 0,
  isTakingBaseline: false,

  setReviewCenterOpen: (open: boolean) => set({ isReviewCenterOpen: open }),
  toggleReviewPanelPinned: () => set((state) => ({ isReviewPanelPinned: !state.isReviewPanelPinned })),
  setReviewPanelWidth: (width: number) => set({ reviewPanelWidth: width }),
  setSelectedAgentIdForInspector: (agentId: string | null) => set({ selectedAgentIdForInspector: agentId }),
  setAgentInspectorOpen: (open: boolean) => set({ isAgentInspectorOpen: open }),
  setActiveReviewTab: (tab) => set({ activeReviewTab: tab }),

  // Check if a baseline exists for this repo
  checkBaselineExists: (repoPath: string) => {
    invoke<string[]>('scan_file_changes', { repoPath })
      .then(() => set({ hasBaseline: true }))
      .catch(() => set({ hasBaseline: false }));
  },

  // Take a baseline snapshot of all project files
  takeBaseline: async (repoPath: string) => {
    set({ isTakingBaseline: true });
    try {
      const count = await invoke<number>('take_baseline', { repoPath });
      set({ hasBaseline: true, baselineFileCount: count, isTakingBaseline: false, ucteChanges: [] });
    } catch (e) {
      console.error('take_baseline failed:', e);
      set({ isTakingBaseline: false });
    }
  },

  // Scan files for changes against the baseline
  scanFileChanges: async (repoPath: string) => {
    set({ isScanningUcte: true });
    try {
      const files = await invoke<string[]>('scan_file_changes', { repoPath });
      set({ ucteChanges: files, isScanningUcte: false });
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || '';
      if (msg.includes('No baseline exists')) {
        set({ hasBaseline: false, ucteChanges: [], isScanningUcte: false });
      } else {
        console.warn('scan_file_changes failed:', e);
        set({ ucteChanges: [], isScanningUcte: false });
      }
    }
  },

  // Stubbed changeset API calls
  loadChangesets: async () => {
    set({ isLoading: true });
    setTimeout(() => set({ isLoading: false }), 50);
  },

  selectChangeset: async (changesetId: string) => {
    set({ activeChangesetId: changesetId });
  },

  createDraftChangeset: async (title: string, agentId: string, explanation?: string) => {
    return `cset-${Date.now()}`;
  },

  addFileToChangeset: async () => {},
  addComment: async () => {},
  updateFileStatus: async () => {},
  runValidation: async () => {},
  applyChangesetTransaction: async () => true,
  rollbackChangeset: async () => true
}));
