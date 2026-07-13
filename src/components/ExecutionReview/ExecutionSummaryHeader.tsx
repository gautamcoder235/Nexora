import React, { useState, useEffect } from 'react';
import { ExecutionMetadata, ArtifactInfo } from '../../types/executionReview';

interface Props {
  metadata: ExecutionMetadata | null;
  artifacts: ArtifactInfo[];
  onPause?: () => void;
  onResume?: () => void;
  onTerminate?: () => void;
}

export function ExecutionSummaryHeader({ metadata, artifacts, onPause, onResume, onTerminate }: Props) {
  const [stats, setStats] = useState({ filesChanged: 0, linesAdded: 0, linesRemoved: 0 });

  useEffect(() => {
    const patchArtifact = artifacts.find(a => a.artifact_type === 'patch');
    if (!patchArtifact) {
      setStats({ filesChanged: 0, linesAdded: 0, linesRemoved: 0 });
      return;
    }

    const loadAndParsePatch = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const content = await invoke<string>('read_project_file', { path: patchArtifact.file_path });
        
        const files = new Set<string>();
        let added = 0;
        let removed = 0;
        
        const lines = content.split('\n');
        for (let line of lines) {
          if (line.startsWith('diff --git ')) {
            const parts = line.split(' ');
            if (parts.length >= 4) {
              files.add(parts[2]);
            }
          } else if (line.startsWith('+++ b/')) {
            files.add(line.slice(6).trim());
          } else if (line.startsWith('+++ ')) {
            const path = line.slice(4).trim();
            if (path !== '/dev/null') files.add(path);
          } else if (line.startsWith('--- a/')) {
            files.add(line.slice(6).trim());
          } else if (line.startsWith('--- ')) {
            const path = line.slice(4).trim();
            if (path !== '/dev/null') files.add(path);
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            added++;
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            removed++;
          }
        }
        
        setStats({
          filesChanged: files.size,
          linesAdded: added,
          linesRemoved: removed
        });
      } catch (err) {
        console.error("Error reading/parsing patch artifact for stats:", err);
      }
    };

    loadAndParsePatch();
  }, [artifacts]);

  if (!metadata) return null;

  // Calculate duration
  const start = new Date(metadata.started_at).getTime();
  const end = metadata.ended_at ? new Date(metadata.ended_at).getTime() : Date.now();
  const durationMs = end - start;
  const mins = Math.floor(durationMs / 60000);
  const secs = Math.floor((durationMs % 60000) / 1000);
  const durationStr = `${mins}m ${secs}s`;

  const { filesChanged, linesAdded, linesRemoved } = stats;

  const statusColor = metadata.status === 'completed' || metadata.status === 'passed' 
    ? 'text-success bg-success/10 border-success/20' 
    : metadata.status === 'failed' 
    ? 'text-error bg-error/10 border-error/20'
    : metadata.status === 'paused'
    ? 'text-accent-secondary bg-accent-secondary/10 border-accent-secondary/20'
    : 'text-accent-primary bg-accent-primary/10 border-accent-primary/20';

  return (
    <div className="bg-bg-secondary border border-border-glass rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Execution #{metadata.execution_id.split('-').pop()}</h1>
          <div className="flex gap-4 text-sm text-text-secondary">
            <div><span className="font-semibold text-text-secondary">Agent:</span> {metadata.agent_id}</div>
            <div><span className="font-semibold text-text-secondary">Branch:</span> {metadata.branch || 'unknown'}</div>
            <div><span className="font-semibold text-text-secondary">Duration:</span> {durationStr}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`px-4 py-2 rounded border font-semibold ${statusColor}`}>
            Status: {metadata.status.toUpperCase()}
          </div>

          {/* Pause / Resume / Terminate actions */}
          {['running', 'validating'].includes(metadata.status) && onPause && (
            <button 
              onClick={onPause}
              className="bg-accent-primary/10 border border-accent-primary/30 hover:border-accent-primary hover:bg-accent-primary/20 text-accent-primary px-3 h-9 rounded text-xs font-semibold transition-all cursor-pointer outline-none"
            >
              Pause
            </button>
          )}

          {metadata.status === 'paused' && onResume && (
            <button 
              onClick={onResume}
              className="bg-success/10 border border-success/30 hover:border-success hover:bg-success/20 text-success px-3 h-9 rounded text-xs font-semibold transition-all cursor-pointer outline-none"
            >
              Resume
            </button>
          )}

          {!['completed', 'passed', 'terminated', 'failed'].includes(metadata.status) && onTerminate && (
            <button 
              onClick={onTerminate}
              className="bg-error/10 border border-error/30 hover:border-error hover:bg-error/20 text-error px-3 h-9 rounded text-xs font-semibold transition-all cursor-pointer outline-none"
            >
              Terminate
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-border-glass flex gap-12">
        <div>
          <div className="text-sm text-text-muted mb-1">Files Changed</div>
          <div className="text-xl font-bold text-text-primary">{filesChanged}</div>
        </div>
        <div>
          <div className="text-sm text-text-muted mb-1">Additions</div>
          <div className="text-xl font-bold text-success">+{linesAdded}</div>
        </div>
        <div>
          <div className="text-sm text-text-muted mb-1">Deletions</div>
          <div className="text-xl font-bold text-error">-{linesRemoved}</div>
        </div>
      </div>
    </div>
  );
}
