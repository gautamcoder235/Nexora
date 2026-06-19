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

  // Actions
  setReviewCenterOpen: (open: boolean) => void;
  toggleReviewPanelPinned: () => void;
  setReviewPanelWidth: (width: number) => void;
  setSelectedAgentIdForInspector: (agentId: string | null) => void;
  setAgentInspectorOpen: (open: boolean) => void;
  setActiveReviewTab: (tab: 'changeset' | 'workspace' | 'worktree_explorer') => void;
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

  setReviewCenterOpen: (open: boolean) => set({ isReviewCenterOpen: open }),
  toggleReviewPanelPinned: () => set((state) => ({ isReviewPanelPinned: !state.isReviewPanelPinned })),
  setReviewPanelWidth: (width: number) => set({ reviewPanelWidth: width }),
  setSelectedAgentIdForInspector: (agentId: string | null) => set({ selectedAgentIdForInspector: agentId }),
  setAgentInspectorOpen: (open: boolean) => set({ isAgentInspectorOpen: open }),
  setActiveReviewTab: (tab) => set({ activeReviewTab: tab }),

  loadChangesets: async () => {
    console.log('loadChangesets: Starting loadChangesets...');
    set({ isLoading: true, error: null });
    try {
      console.log('loadChangesets: Invoking get_all_changesets...');
      const dbChangesets = await invoke<any[]>('get_all_changesets');
      console.log('loadChangesets: get_all_changesets returned:', dbChangesets);
      
      const changesetsMap: Record<string, Changeset> = {};
      
      if (Array.isArray(dbChangesets)) {
        for (const item of dbChangesets) {
          if (!item) continue;
          changesetsMap[item.id] = {
            id: item.id,
            title: item.title,
            status: item.status as ChangesetStatus,
            origin_agent_id: item.origin_agent_id,
            created_at: item.created_at,
            explanation: item.explanation || '',
            files: [],
            comments: []
          };
        }
      } else {
        console.warn('loadChangesets: dbChangesets is not an array:', dbChangesets);
      }
      
      console.log('loadChangesets: Setting changesets map and loading to false:', changesetsMap);
      set({ changesets: changesetsMap, isLoading: false });
    } catch (err) {
      console.error('loadChangesets: Failed to load changesets:', err);
      set({ error: String(err), isLoading: false });
    }
  },

  selectChangeset: async (changesetId: string) => {
    set({ isLoading: true, error: null });
    try {
      const details = await invoke<any>('get_changeset_details', { changesetId });
      
      set((state) => {
        const updatedChangesets = { ...state.changesets };
        updatedChangesets[changesetId] = {
          id: details.id,
          title: details.title,
          status: details.status as ChangesetStatus,
          origin_agent_id: details.originAgentId,
          created_at: details.createdAt,
          explanation: details.explanation || '',
          files: details.files.map((f: any) => ({
            id: f.id,
            changeset_id: f.changeset_id,
            path: f.path,
            old_content: f.old_content,
            new_content: f.new_content,
            patch: f.patch,
            change_source: f.change_source as ChangeSource,
            status: f.status as FileChangeStatus
          })),
          comments: details.comments.map((c: any) => ({
            id: c.id,
            changeset_id: c.changeset_id,
            path: c.path,
            line_number: c.line_number,
            agent_name: c.agent_name,
            comment: c.comment,
            severity: c.severity as CommentSeverity,
            created_at: c.created_at
          }))
        };
        
        return {
          changesets: updatedChangesets,
          activeChangesetId: changesetId,
          isLoading: false
        };
      });
    } catch (err) {
      console.error('Failed to select changeset:', err);
      set({ error: String(err), isLoading: false });
    }
  },

  createDraftChangeset: async (title: string, agentId: string, explanation?: string) => {
    try {
      const id = await invoke<string>('create_changeset_draft', {
        title,
        originAgentId: agentId,
        explanation
      });
      
      await get().loadChangesets();
      return id;
    } catch (err) {
      console.error('Failed to create draft changeset:', err);
      throw err;
    }
  },

  addFileToChangeset: async (
    changesetId: string,
    path: string,
    oldContent: string,
    newContent: string,
    patch: string,
    changeSource: ChangeSource
  ) => {
    try {
      await invoke('add_file_to_changeset', {
        changesetId,
        path,
        oldContent,
        newContent,
        patch,
        changeSource
      });
      // Refresh details if currently selected
      if (get().activeChangesetId === changesetId) {
        await get().selectChangeset(changesetId);
      }
    } catch (err) {
      console.error('Failed to add file to changeset:', err);
      throw err;
    }
  },

  addComment: async (
    changesetId: string,
    path: string | null,
    lineNumber: number | null,
    agentName: string,
    comment: string,
    severity: CommentSeverity
  ) => {
    try {
      await invoke('add_review_comment', {
        changesetId,
        path,
        lineNumber,
        agentName,
        comment,
        severity
      });
      // Refresh details if currently selected
      if (get().activeChangesetId === changesetId) {
        await get().selectChangeset(changesetId);
      }
    } catch (err) {
      console.error('Failed to add review comment:', err);
      throw err;
    }
  },

  updateFileStatus: async (changesetId: string, path: string, status: FileChangeStatus) => {
    try {
      await invoke('update_file_status', { changesetId, path, status });
      
      // Update local state immediately
      set((state) => {
        const updatedChangesets = { ...state.changesets };
        const cset = updatedChangesets[changesetId];
        if (cset) {
          cset.files = cset.files.map((f) =>
            f.path === path ? { ...f, status } : f
          );
        }
        return { changesets: updatedChangesets };
      });
    } catch (err) {
      console.error('Failed to update file status:', err);
      throw err;
    }
  },

  applyChangesetTransaction: async (changesetId: string, repoPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const success = await invoke<boolean>('apply_changeset_transaction', { changesetId, repoPath });
      if (success) {
        // Refresh details
        await get().selectChangeset(changesetId);
      }
      set({ isLoading: false });
      return success;
    } catch (err) {
      console.error('Failed to apply changeset:', err);
      set({ error: String(err), isLoading: false });
      return false;
    }
  },

  rollbackChangeset: async (changesetId: string, repoPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const success = await invoke<boolean>('rollback_changeset', { changesetId, repoPath });
      if (success) {
        // Refresh details
        await get().selectChangeset(changesetId);
      }
      set({ isLoading: false });
      return success;
    } catch (err) {
      console.error('Failed to rollback changeset:', err);
      set({ error: String(err), isLoading: false });
      return false;
    }
  },

  runValidation: async (changesetId: string, repoPath: string) => {
    // We update local state to 'running'
    set((state) => {
      const updatedChangesets = { ...state.changesets };
      const cset = updatedChangesets[changesetId];
      if (cset) {
        cset.validationStatus = 'running';
      }
      return { changesets: updatedChangesets };
    });

    try {
      const result = await invoke<any>('validate_changeset_shadow', { changesetId, repoPath });
      
      set((state) => {
        const updatedChangesets = { ...state.changesets };
        const cset = updatedChangesets[changesetId];
        if (cset) {
          cset.validationStatus = result.status;
        }
        return { changesets: updatedChangesets };
      });

      // Refresh comments since validation adds comments
      if (get().activeChangesetId === changesetId) {
        await get().selectChangeset(changesetId);
      }
    } catch (err) {
      console.error('Failed to run shadow validation:', err);
      set((state) => {
        const updatedChangesets = { ...state.changesets };
        const cset = updatedChangesets[changesetId];
        if (cset) {
          cset.validationStatus = 'failed';
        }
        return { changesets: updatedChangesets };
      });
    }
  }
}));
