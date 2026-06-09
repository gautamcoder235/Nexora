import React, { useState } from 'react';
import { ArtifactInfo } from '../../types/executionReview';

interface Props {
  artifacts: ArtifactInfo[];
}

export function PatchDiffViewer({ artifacts }: Props) {
  const [viewMode, setViewMode] = useState<'inline' | 'split'>('inline');
  const patchArtifact = artifacts.find(a => a.artifact_type === 'patch');

  if (!patchArtifact) {
    return (
      <div className="solid-dark-diff border border-border-glass rounded-lg p-8 text-center text-zinc-500 font-mono text-xs">
        No patch artifact generated for this execution.
      </div>
    );
  }

  return (
    <div className="solid-dark-diff border border-border-glass rounded-lg overflow-hidden flex flex-col">
      <div className="bg-bg-secondary/40 border-b border-border-glass px-4 py-3 flex justify-between items-center select-none">
        <h4 className="text-sm font-semibold text-zinc-350">Generated Patch</h4>
        <div className="flex bg-[#050507] rounded border border-border-glass p-0.5">
          <button 
            className={`px-3 py-1 text-xs rounded transition-all cursor-pointer ${viewMode === 'inline' ? 'bg-bg-primary text-white border border-border-glass' : 'text-zinc-500 hover:text-zinc-350'}`}
            onClick={() => setViewMode('inline')}
          >
            Inline
          </button>
          <button 
            className={`px-3 py-1 text-xs rounded transition-all cursor-pointer ${viewMode === 'split' ? 'bg-bg-primary text-white border border-border-glass' : 'text-zinc-500 hover:text-zinc-350'}`}
            onClick={() => setViewMode('split')}
          >
            Side-by-Side
          </button>
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="text-sm text-zinc-400 font-mono bg-[#050507] p-4 rounded border border-border-glass">
          {/* Note: In a real implementation we would load the patch content via Tauri `fs::read_to_string(patchArtifact.file_path)` 
              and render it using react-diff-view + shiki. For now, we show the artifact metadata placeholder. */}
          <p className="mb-2 italic text-zinc-500">// Patch Viewer requires reading the file path on the backend.</p>
          <p className="text-accent-success font-bold">+ // TODO: Implement Shiki + react-diff-view rendering here.</p>
          <p className="text-zinc-400">  Artifact ID: {patchArtifact.id}</p>
          <p className="text-zinc-400">  Checksum: {patchArtifact.checksum}</p>
          <p className="text-zinc-400">  Size: {patchArtifact.size_bytes} bytes</p>
        </div>
      </div>
    </div>
  );
}
