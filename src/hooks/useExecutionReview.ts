import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import {
  ValidationRunInfo,
  ArtifactInfo,
  ExecutionLogInfo,
  ExecutionMetadata,
  MergeCandidateInfo,
} from '../types/executionReview';

export function useExecutionReview(executionId: string | null) {
  const [metadata, setMetadata] = useState<ExecutionMetadata | null>(null);
  const [validationRun, setValidationRun] = useState<ValidationRunInfo | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [logs, setLogs] = useState<ExecutionLogInfo[]>([]);
  const [mergeCandidate, setMergeCandidate] = useState<MergeCandidateInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!executionId) {
      setMetadata(null);
      setValidationRun(null);
      setArtifacts([]);
      setLogs([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    async function loadData() {
      try {
        const [meta, run, arts, executionLogs, candidate] = await Promise.all([
          invoke<ExecutionMetadata | null>('get_execution_metadata', { executionId }),
          invoke<ValidationRunInfo | null>('get_validation_run', { executionId }),
          invoke<ArtifactInfo[]>('get_artifacts', { executionId }),
          invoke<ExecutionLogInfo[]>('get_execution_logs', { executionId }),
          invoke<MergeCandidateInfo | null>('get_merge_candidate', { executionId })
        ]);

        if (isMounted) {
          setMetadata(meta);
          setValidationRun(run);
          setArtifacts(arts);
          setLogs(executionLogs);
          setMergeCandidate(candidate);
        }
      } catch (err) {
        if (isMounted) {
          setError(String(err));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [executionId]);

  const reviewCandidate = async (action: 'approve' | 'reject') => {
    if (!executionId) return;
    try {
      await invoke('review_merge_candidate', { executionId, action });
      // Refresh the candidate state
      const candidate = await invoke<MergeCandidateInfo | null>('get_merge_candidate', { executionId });
      setMergeCandidate(candidate);
    } catch (err) {
      console.error('Failed to review candidate:', err);
      useOrchestratorStore.getState().showAlertDialog('Review Failed', 'Failed to review: ' + err);
    }
  };

  const applyMerge = async () => {
    if (!executionId) return { success: false, error: 'No execution ID' };
    try {
      // First update local state so UI immediately says "merging"
      setMergeCandidate(prev => prev ? { ...prev, status: 'merging' } : null);
      
      const result = await invoke<{ success: boolean; error?: string }>('apply_merge_candidate', { executionId });
      
      // Refresh state regardless of success to get correct status/error
      const candidate = await invoke<MergeCandidateInfo | null>('get_merge_candidate', { executionId });
      setMergeCandidate(candidate);
      
      return result;
    } catch (err) {
      console.error('Failed to merge candidate:', err);
      // Revert to approved or let the DB dictate
      const candidate = await invoke<MergeCandidateInfo | null>('get_merge_candidate', { executionId });
      setMergeCandidate(candidate);
      return { success: false, error: String(err) };
    }
  };

  const pauseExecution = async () => {
    if (!executionId) return;
    try {
      await invoke('pause_execution', { executionId });
      const meta = await invoke<ExecutionMetadata | null>('get_execution_metadata', { executionId });
      setMetadata(meta);
    } catch (err) {
      console.error('Failed to pause execution:', err);
      useOrchestratorStore.getState().showAlertDialog('Action Failed', 'Failed to pause execution: ' + err);
    }
  };

  const resumeExecution = async () => {
    if (!executionId) return;
    try {
      await invoke('resume_execution', { executionId });
      const meta = await invoke<ExecutionMetadata | null>('get_execution_metadata', { executionId });
      setMetadata(meta);
    } catch (err) {
      console.error('Failed to resume execution:', err);
      useOrchestratorStore.getState().showAlertDialog('Action Failed', 'Failed to resume execution: ' + err);
    }
  };

  const terminateExecution = async () => {
    if (!executionId) return;
    try {
      await invoke('terminate_execution', { executionId });
      const meta = await invoke<ExecutionMetadata | null>('get_execution_metadata', { executionId });
      setMetadata(meta);
    } catch (err) {
      console.error('Failed to terminate execution:', err);
      useOrchestratorStore.getState().showAlertDialog('Action Failed', 'Failed to terminate: ' + err);
    }
  };

  return {
    metadata,
    validationRun,
    artifacts,
    logs,
    mergeCandidate,
    isLoading,
    error,
    reviewCandidate,
    applyMerge,
    pauseExecution,
    resumeExecution,
    terminateExecution,
  };
}
