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

  // UCTE live changes scanning/state
  ucteChanges: string[];
  isScanningUcte: boolean;

  // Actions
  setReviewCenterOpen: (open: boolean) => void;
  toggleReviewPanelPinned: () => void;
  setReviewPanelWidth: (width: number) => void;
  setSelectedAgentIdForInspector: (agentId: string | null) => void;
  setAgentInspectorOpen: (open: boolean) => void;
  setActiveReviewTab: (tab: 'changeset' | 'workspace' | 'worktree_explorer') => void;
  
  // UCTE Actions
  scanUcteChanges: (repoPath: string) => Promise<void>;
  scanSingleFileUcte: (repoPath: string, filePath: string) => Promise<void>;

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

  // UCTE State
  ucteChanges: ['src/components/NexoraTeam/TeamGraph.tsx', 'src/stores/teamStore.ts'],
  isScanningUcte: false,

  setReviewCenterOpen: (open: boolean) => set({ isReviewCenterOpen: open }),
  toggleReviewPanelPinned: () => set((state) => ({ isReviewPanelPinned: !state.isReviewPanelPinned })),
  setReviewPanelWidth: (width: number) => set({ reviewPanelWidth: width }),
  setSelectedAgentIdForInspector: (agentId: string | null) => set({ selectedAgentIdForInspector: agentId }),
  setAgentInspectorOpen: (open: boolean) => set({ isAgentInspectorOpen: open }),
  setActiveReviewTab: (tab) => set({ activeReviewTab: tab }),

  // UCTE scan implementation (streamlined live changes scanning)
  scanUcteChanges: async (repoPath: string) => {
    set({ isScanningUcte: true });
    try {
      const files = await invoke<string[]>('scan_ucte_changes', { repoPath });
      set({ ucteChanges: files, isScanningUcte: false });
    } catch (e) {
      console.warn('Backend UCTE scan command not found, using frontend fallback list.', e);
      set({ 
        ucteChanges: [
          'src/components/NexoraTeam/TeamGraph.tsx', 
          'src/stores/teamStore.ts'
        ], 
        isScanningUcte: false 
      });
    }
  },

  scanSingleFileUcte: async (repoPath: string, filePath: string) => {
    set({ isScanningUcte: true });
    try {
      const isChanged = await invoke<boolean>('scan_single_file_ucte', { repoPath, filePath });
      set((state) => {
        const currentChanges = new Set(state.ucteChanges);
        if (isChanged) {
          currentChanges.add(filePath);
        } else {
          currentChanges.delete(filePath);
        }
        return { ucteChanges: Array.from(currentChanges), isScanningUcte: false };
      });
    } catch (e) {
      console.warn('Backend single-file UCTE scan command not found, keeping file in changes list.', e);
      set((state) => {
        const currentChanges = new Set(state.ucteChanges);
        currentChanges.add(filePath);
        return { ucteChanges: Array.from(currentChanges), isScanningUcte: false };
      });
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
