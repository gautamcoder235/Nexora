import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Changeset, ChangesetFile, ReviewComment, ChangesetStatus, FileChangeStatus, CommentSeverity, ChangeSource } from '../types/changeset';

// ── Nexora Memory Core Git-backed Types ──

export interface FileOperation {
  id: string;
  file_path: string;
  operation_type: string; // created | modified | deleted | renamed
  old_path: string | null;
}

export interface TimelineEntry {
  id: string;
  session_id: string | null;
  git_commit_hash: string;
  type: string; // snapshot | checkpoint | ai | restore
  source: string; // user | agent | terminal | external
  description: string | null;
  timestamp: string;
  status: string; // pending | approved | rejected
  files: FileOperation[];
  session_source: string | null;
  session_desc: string | null;
  project_path: string;
}

export interface HunkSelection {
  file_path: string;
  approved: boolean;
}

export interface MissingProject {
  id: string;
  name: string;
  original_path: string;
  last_backup: string;
  status: string; // "healthy" | "corrupted" | "missing"
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
  timeline: TimelineEntry[];
  isCapturing: boolean;
  isLoadingChanges: boolean;

  // Recovery Vault state
  missingProjects: MissingProject[];
  isRestoring: boolean;

  // Actions — UI
  setReviewCenterOpen: (open: boolean) => void;
  toggleReviewPanelPinned: () => void;
  setReviewPanelWidth: (width: number) => void;
  setSelectedAgentIdForInspector: (agentId: string | null) => void;
  setAgentInspectorOpen: (open: boolean) => void;
  setActiveReviewTab: (tab: 'changeset' | 'workspace' | 'worktree_explorer') => void;

  // Actions — Memory Core
  initMemory: (projectPath: string | string[]) => Promise<void>;
  captureSnapshot: (projectPath: string | string[], source: string, description?: string, sessionId?: string) => Promise<string | null>;
  loadHistory: (projectPath: string | string[]) => Promise<void>;
  createCheckpoint: (projectPath: string, name: string) => Promise<string | null>;
  restoreCommit: (projectPath: string, commitHash: string, files?: string[]) => Promise<void>;
  reviewCommit: (projectPath: string, commitHash: string, status: 'approved' | 'rejected') => Promise<void>;
  applyHunks: (projectPath: string, commitHash: string, approvedHunks: HunkSelection[]) => Promise<void>;
  readCommitVersion: (projectPath: string, commitHash: string, filePath: string) => Promise<string>;
  getDiff: (projectPath: string, fromCommit: string, toCommit: string) => Promise<string>;

  // Actions — Recovery Vault
  checkMissingProjects: () => Promise<void>;
  restoreProject: (projectId: string, targetPath: string) => Promise<void>;

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
  timeline: [],
  isCapturing: false,
  isLoadingChanges: false,

  // Recovery Vault state
  missingProjects: [],
  isRestoring: false,

  // UI actions
  setReviewCenterOpen: (open: boolean) => set({ isReviewCenterOpen: open }),
  toggleReviewPanelPinned: () => set((s) => ({ isReviewPanelPinned: !s.isReviewPanelPinned })),
  setReviewPanelWidth: (width: number) => set({ reviewPanelWidth: width }),
  setSelectedAgentIdForInspector: (agentId: string | null) => set({ selectedAgentIdForInspector: agentId }),
  setAgentInspectorOpen: (open: boolean) => set({ isAgentInspectorOpen: open }),
  setActiveReviewTab: (tab) => set({ activeReviewTab: tab }),

  // ── Memory Core Actions ──

  initMemory: async (projectPath: string | string[]) => {
    set({ isInitializing: true });
    try {
      const paths = Array.isArray(projectPath) ? projectPath : [projectPath];
      for (const path of paths) {
        await invoke<string>('memory_initialize', { projectPath: path });
      }
      set({ isMemoryInitialized: true, isInitializing: false });
    } catch (e) {
      console.error('memory_initialize failed:', e);
      set({ isInitializing: false });
    }
  },

  captureSnapshot: async (projectPath: string | string[], source: string, description?: string, sessionId?: string) => {
    set({ isCapturing: true });
    try {
      const paths = Array.isArray(projectPath) ? projectPath : [projectPath];
      let lastHash: string | null = null;
      for (const path of paths) {
        lastHash = await invoke<string>('memory_snapshot', {
          projectPath: path,
          source,
          description: description || null,
          sessionId: sessionId || null
        });
      }
      // Reload history
      let allEntries: TimelineEntry[] = [];
      for (const path of paths) {
        try {
          const history = await invoke<TimelineEntry[]>('memory_get_history', { projectPath: path });
          allEntries = allEntries.concat(history);
        } catch {}
      }
      allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      set({ timeline: allEntries, isCapturing: false });
      return lastHash;
    } catch (e) {
      console.error('memory_snapshot failed:', e);
      set({ isCapturing: false });
      return null;
    }
  },

  loadHistory: async (projectPath: string | string[]) => {
    set({ isLoadingChanges: true });
    try {
      const paths = Array.isArray(projectPath) ? projectPath : [projectPath];
      let allEntries: TimelineEntry[] = [];
      for (const path of paths) {
        try {
          const history = await invoke<TimelineEntry[]>('memory_get_history', { projectPath: path });
          allEntries = allEntries.concat(history);
        } catch (e) {
          console.error(`memory_get_history failed for ${path}:`, e);
        }
      }
      allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      set({ timeline: allEntries, isLoadingChanges: false });
    } catch (e) {
      console.error('loadHistory failed:', e);
      set({ timeline: [], isLoadingChanges: false });
    }
  },

  createCheckpoint: async (projectPath: string, name: string) => {
    try {
      const hash = await invoke<string>('memory_create_checkpoint', { projectPath, name });
      const history = await invoke<TimelineEntry[]>('memory_get_history', { projectPath });
      set({ timeline: history });
      return hash;
    } catch (e) {
      console.error('memory_create_checkpoint failed:', e);
      return null;
    }
  },

  restoreCommit: async (projectPath: string, commitHash: string, files?: string[]) => {
    try {
      await invoke('memory_restore', { projectPath, commitHash, files: files || null });
      const history = await invoke<TimelineEntry[]>('memory_get_history', { projectPath });
      set({ timeline: history });
    } catch (e) {
      console.error('memory_restore failed:', e);
      throw e;
    }
  },

  reviewCommit: async (projectPath: string, commitHash: string, status: 'approved' | 'rejected') => {
    try {
      await invoke('memory_review_change', { projectPath, commitHash, status });
      const history = await invoke<TimelineEntry[]>('memory_get_history', { projectPath });
      set({ timeline: history });
    } catch (e) {
      console.error('memory_review_change failed:', e);
    }
  },

  applyHunks: async (projectPath: string, commitHash: string, approvedHunks: HunkSelection[]) => {
    try {
      await invoke('memory_apply_hunks', { projectPath, commitHash, approvedHunks });
      const history = await invoke<TimelineEntry[]>('memory_get_history', { projectPath });
      set({ timeline: history });
    } catch (e) {
      console.error('memory_apply_hunks failed:', e);
    }
  },

  readCommitVersion: async (projectPath: string, commitHash: string, filePath: string) => {
    try {
      return await invoke<string>('memory_read_version', { projectPath, commitHash, filePath });
    } catch (e) {
      console.error('memory_read_version failed:', e);
      return '';
    }
  },

  getDiff: async (projectPath: string, fromCommit: string, toCommit: string) => {
    try {
      return await invoke<string>('memory_get_diff', { projectPath, fromCommit, toCommit });
    } catch (e) {
      console.error('memory_get_diff failed:', e);
      return '';
    }
  },

  // Actions — Recovery Vault
  checkMissingProjects: async () => {
    try {
      const missing = await invoke<MissingProject[]>('check_missing_projects');
      set({ missingProjects: missing });
    } catch (e) {
      console.error('check_missing_projects failed:', e);
    }
  },

  restoreProject: async (projectId: string, targetPath: string) => {
    set({ isRestoring: true });
    try {
      await invoke('restore_project_command', { projectId, targetPath });
      const missing = await invoke<MissingProject[]>('check_missing_projects');
      set({ missingProjects: missing, isRestoring: false });
    } catch (e) {
      console.error('restore_project_command failed:', e);
      set({ isRestoring: false });
      throw e;
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
