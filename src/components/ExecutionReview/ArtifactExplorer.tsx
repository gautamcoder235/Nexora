import React from 'react';
import { ArtifactInfo } from '../../types/executionReview';

interface Props {
  artifacts: ArtifactInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ArtifactExplorer({ artifacts, selectedId, onSelect }: Props) {
  // Hardcoded structure based on Phase 3 output
  const expectedArtifacts = [
    { type: 'patch', label: 'Generated Patch (.patch)' },
    { type: 'diff_stat', label: 'Diff Stat Overview' },
    { type: 'ownership_report', label: 'Ownership Report' },
    { type: 'typecheck_report', label: 'Typecheck Log' },
    { type: 'lint_report', label: 'Lint Log' },
    { type: 'test_report', label: 'Test Results' },
    { type: 'snapshot', label: 'Repository Snapshot' },
  ];

  return (
    <div className="flex flex-col text-sm font-mono p-2">
      {expectedArtifacts.map(({ type, label }) => {
        const found = artifacts.find(a => a.artifact_type === type);
        const isSelected = found && selectedId === found.id;
        
        return (
          <button
            key={type}
            disabled={!found}
            onClick={() => found && onSelect(found.id)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded text-left
              ${found ? 'cursor-pointer hover:bg-gray-800' : 'opacity-40 cursor-not-allowed'}
              ${isSelected ? 'bg-indigo-500/10 text-indigo-400 font-semibold' : 'text-gray-400'}
            `}
          >
            <span className="w-4 shrink-0 text-center">{found ? '📄' : '⭕'}</span>
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
