import React, { useState, useEffect } from 'react';
import { useExecutionReview } from '../../hooks/useExecutionReview';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { ExecutionSummaryHeader } from './ExecutionSummaryHeader';
import { PipelineStatusDashboard } from './PipelineStatusDashboard';
import { PatchDiffViewer } from './PatchDiffViewer';
import { OwnershipReportViewer } from './OwnershipReportViewer';
import { ExecutionLogDrawer } from './ExecutionLogDrawer';
import { ExecutionMetadataPanel } from './ExecutionMetadataPanel';
import { ArtifactExplorer } from './ArtifactExplorer';
import { SwarmGraph } from '../SwarmView/SwarmGraph';
import Editor from '@monaco-editor/react';

interface Props {
  executionId: string | null;
  onClose: () => void;
}

export function ExecutionReviewWorkspace({ executionId, onClose }: Props) {
  const { 
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
    terminateExecution
  } = useExecutionReview(executionId);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<string>('');
  const [isArtifactLoading, setIsArtifactLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedArtifactId) {
      setArtifactContent('');
      return;
    }
    const artifact = artifacts.find(a => a.id === selectedArtifactId);
    if (!artifact) return;

    const loadContent = async () => {
      setIsArtifactLoading(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const content = await invoke<string>('read_project_file', { path: artifact.file_path });
        setArtifactContent(content);
      } catch (err) {
        console.error("Error reading artifact file:", err);
        setArtifactContent(`Error loading artifact content:\n${err}`);
      } finally {
        setIsArtifactLoading(false);
      }
    };

    loadContent();
  }, [selectedArtifactId, artifacts]);

  if (!executionId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-primary/20 text-zinc-450 font-mono text-xs">
        <p>Select an execution from the sidebar to review.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-primary/20 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-primary/20 text-accent-error font-mono text-xs">
        <p>Error loading execution data: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-transparent text-white font-sans overflow-hidden">
      
      {/* Left Sidebar: Artifacts & Metadata */}
      <div className="w-80 flex-shrink-0 border-r border-border-glass flex flex-col bg-bg-secondary/40">
        <div className="p-4 border-b border-border-glass flex justify-between items-center">
          <h2 className="text-sm font-semibold text-zinc-300">Artifacts & Review</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">✕</button>
        </div>
        
        <div className="flex-grow flex-1 overflow-y-auto flex flex-col min-h-0">
          <div className="flex-1 min-h-[300px]">
            <ArtifactExplorer 
              artifacts={artifacts} 
              selectedId={selectedArtifactId}
              onSelect={setSelectedArtifactId} 
            />
          </div>

          <div className="p-4 border-t border-border-glass bg-bg-secondary/30 flex-shrink-0">
            <h3 className="text-xs font-bold mb-3 text-zinc-500 uppercase tracking-wider font-mono">Metadata</h3>
            <ExecutionMetadataPanel metadata={metadata} validationRun={validationRun} />
          </div>
        </div>
      </div>

      {/* Center: Main Review Area */}
      <div className="flex-grow flex-1 flex flex-col overflow-y-auto bg-transparent px-8 py-6 min-w-0">
        {selectedArtifactId && artifacts.find(a => a.id === selectedArtifactId) ? (
          (() => {
            const selectedArtifact = artifacts.find(a => a.id === selectedArtifactId)!;
            return (
              <div className="flex flex-col h-full w-full bg-[#08080a] border border-border-glass rounded-lg overflow-hidden">
                <div className="bg-bg-secondary/40 border-b border-border-glass px-4 flex justify-between items-center select-none h-12 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <button 
                      onClick={() => setSelectedArtifactId(null)}
                      className="mr-2 text-xs bg-bg-primary hover:bg-zinc-800 border border-border-glass px-3 py-1 rounded transition-colors text-zinc-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      ← Back to Overview
                    </button>
                    <span className="font-mono text-xs text-zinc-300 truncate" title={selectedArtifact.file_path}>
                      {selectedArtifact.artifact_type.toUpperCase()} - {selectedArtifact.file_path.split('/').pop()?.split('\\').pop()}
                    </span>
                    <span className="text-[9px] text-zinc-500 font-mono bg-[#101014] px-1.5 py-0.5 rounded border border-border-glass uppercase shrink-0">
                      {selectedArtifact.size_bytes} bytes
                    </span>
                  </div>
                  <div className="text-zinc-500 text-xs font-mono">
                    Created: {new Date(selectedArtifact.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex-grow w-full bg-[#08080a] min-h-[500px] relative">
                  {isArtifactLoading ? (
                    <div className="flex h-full w-full items-center justify-center text-white">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent-primary"></div>
                    </div>
                  ) : (
                    <Editor
                      height="100%"
                      language={
                        selectedArtifact.artifact_type === 'patch' ? 'diff' :
                        selectedArtifact.file_path.endsWith('.json') ? 'json' :
                        selectedArtifact.file_path.endsWith('.md') ? 'markdown' :
                        'text'
                      }
                      value={artifactContent}
                      options={{
                        readOnly: true,
                        minimap: { enabled: true },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        fontFamily: 'Consolas, "Courier New", monospace',
                        lineNumbers: 'on',
                        folding: true,
                        automaticLayout: true,
                        scrollbar: {
                          vertical: 'visible',
                          horizontal: 'visible',
                          useShadows: false,
                          verticalScrollbarSize: 10,
                          horizontalScrollbarSize: 10
                        }
                      }}
                      theme="vscode-dark"
                      beforeMount={(monaco) => {
                        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                          noSemanticValidation: true,
                          noSyntaxValidation: true,
                        });
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })()
        ) : (
          <>
            <ExecutionSummaryHeader 
              metadata={metadata} 
              artifacts={artifacts} 
              onPause={pauseExecution}
              onResume={resumeExecution}
              onTerminate={terminateExecution}
            />

            {/* DEBUG: Simulate Agent Completion */}
            {metadata && !['completed', 'passed', 'terminated', 'failed'].includes(metadata.status) && (
              <div className="mt-4 bg-accent-warning/10 border border-accent-warning/20 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-accent-primary">Debug: Simulate Agent Work</h3>
                  <p className="text-xs text-zinc-400 mt-1">Click to artificially trigger the end of the execution and start the validation pipeline.</p>
                </div>
                <button 
                  onClick={async () => {
                    try {
                      const { invoke } = await import('@tauri-apps/api/core');
                      await invoke('debug_simulate_agent_completion', { executionId: metadata.execution_id });
                    } catch(e) {
                      console.error(e);
                      useOrchestratorStore.getState().showAlertDialog('Simulation Error', String(e));
                    }
                  }}
                  className="glass-button glass-button--accent text-sm"
                >
                  Simulate Completion
                </button>
              </div>
            )}
            
            {/* Merge Candidate Banner */}
            {metadata?.status === 'completed' && mergeCandidate && (
              <div className="mt-6 glass-panel-accent border-accent-primary/30 p-6 flex justify-between items-center">
                <div className="flex-grow flex-1 pr-6">
                  <h3 className="text-lg font-bold text-accent-primary mb-1">Merge Candidate</h3>
                  <p className="text-sm text-zinc-300 mb-3">
                    {mergeCandidate.status === 'pending_review' ? 'Validation passed successfully. Pending manual review.' : 
                     mergeCandidate.status === 'approved' ? 'This patch has been approved for merging.' : 
                     mergeCandidate.status === 'merging' ? 'Applying and verifying patch via 6-Gate Merge Pipeline...' :
                     mergeCandidate.status === 'merge_failed' ? 'Merge failed. Please review the execution logs and artifacts.' :
                     mergeCandidate.status === 'rejected' ? 'This patch has been rejected.' : 
                     'This patch has been successfully merged.'}
                  </p>
                  
                  {/* Precondition Checklist for Approved/Merging/Failed state */}
                  {['approved', 'merging', 'merge_failed', 'merged'].includes(mergeCandidate.status) && (
                    <div className="flex flex-wrap gap-4 text-xs text-zinc-400 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className={mergeCandidate.status === 'approved' ? 'text-zinc-650' : 'text-accent-success font-bold'}>✓</span> Repository Clean
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={mergeCandidate.status === 'approved' ? 'text-zinc-650' : 'text-accent-success font-bold'}>✓</span> HEAD Drift Check
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={mergeCandidate.status === 'approved' ? 'text-zinc-650' : 'text-accent-success font-bold'}>✓</span> Patch Integrity
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={mergeCandidate.status === 'approved' ? 'text-zinc-650' : 'text-accent-success font-bold'}>✓</span> Patch Dry Run
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={mergeCandidate.status === 'approved' ? 'text-zinc-650' : 'text-accent-success font-bold'}>✓</span> Exact-File Commit
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex-shrink-0 flex items-center gap-3">
                  {mergeCandidate.status === 'pending_review' && (
                    <>
                      <button 
                        onClick={() => reviewCandidate('reject')}
                        className="glass-button glass-button--danger text-sm"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => reviewCandidate('approve')}
                        className="glass-button glass-button--accent text-sm"
                      >
                        Approve
                      </button>
                    </>
                  )}

                  {mergeCandidate.status === 'approved' && (
                    <button 
                      onClick={async () => {
                        const res = await applyMerge();
                        if (!res.success) {
                          useOrchestratorStore.getState().showAlertDialog('Merge Failed', `Merge failed: ${res.error}`);
                        }
                      }}
                      className="glass-button glass-button--accent px-4 py-2 font-semibold"
                    >
                      Apply Patch to Main
                    </button>
                  )}

                  {mergeCandidate.status === 'merging' && (
                    <button 
                      disabled
                      className="glass-button text-zinc-500 rounded font-semibold flex items-center gap-2 cursor-not-allowed opacity-60"
                    >
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-zinc-500"></div>
                      Merging...
                    </button>
                  )}

                  {mergeCandidate.status === 'merge_failed' && (
                    <button 
                      onClick={async () => {
                        const res = await applyMerge();
                        if (!res.success) {
                          useOrchestratorStore.getState().showAlertDialog('Merge Failed', `Merge failed: ${res.error}`);
                        }
                      }}
                      className="glass-button glass-button--danger text-sm"
                    >
                      Retry Merge
                    </button>
                  )}

                  {mergeCandidate.status !== 'pending_review' && (
                    <div className="ml-4 text-sm font-mono text-zinc-500 text-right">
                      Status:<br/>
                      <span className={`font-bold ${
                        mergeCandidate.status === 'merged' ? 'text-accent-success' :
                        mergeCandidate.status === 'merge_failed' ? 'text-accent-error' :
                        mergeCandidate.status === 'merging' ? 'text-accent-primary' :
                        'text-white'
                      }`}>
                        {mergeCandidate.status.toUpperCase()}
                      </span>
                      {mergeCandidate.reviewed_by && <div className="text-xs">by {mergeCandidate.reviewed_by}</div>}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="mt-6">
              <SwarmGraph metadata={metadata} validationRun={validationRun} />
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-medium mb-4 text-zinc-200">Validation Pipeline</h3>
              <PipelineStatusDashboard run={validationRun} />
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-medium mb-4 text-zinc-200">Ownership Report</h3>
              <OwnershipReportViewer artifacts={artifacts} />
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-medium mb-4 text-zinc-200">Change Overview</h3>
              <PatchDiffViewer artifacts={artifacts} />
            </div>

            <div className="mt-8 mb-12">
              <h3 className="text-lg font-medium mb-4 text-zinc-200">Execution Logs</h3>
              <ExecutionLogDrawer logs={logs} />
            </div>
          </>
        )}
      </div>

    </div>
  );
}
