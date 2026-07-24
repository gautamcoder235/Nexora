import React, { useState } from 'react';
import { FilePlus, FileMinus, FileEdit, ChevronDown, ChevronRight, Eye } from 'lucide-react';

export interface FileChange {
  path: string;
  type: 'created' | 'deleted' | 'modified';
  additions: number;
  deletions: number;
  diffSnippet?: string;
}

interface DiffSummaryViewProps {
  changes: FileChange[];
}

export const DiffSummaryView: React.FC<DiffSummaryViewProps> = ({ changes }) => {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const createdCount = changes.filter(c => c.type === 'created').length;
  const deletedCount = changes.filter(c => c.type === 'deleted').length;
  const modifiedCount = changes.filter(c => c.type === 'modified').length;

  const totalAdditions = changes.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = changes.reduce((sum, c) => sum + c.deletions, 0);

  if (changes.length === 0) return null;

  return (
    <div className="w-full bg-[var(--bg-secondary)]/80 border border-[var(--border-glass)] rounded-xl overflow-hidden my-2 select-none">
      {/* Header Summary */}
      <div className="flex items-center justify-between p-2.5 border-b border-[var(--border-glass)] bg-[var(--bg-tertiary)]/60 font-sans">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-semibold text-zinc-200">Changes Summary</span>
          <div className="flex items-center space-x-2 text-[10px] font-mono">
            {createdCount > 0 && (
              <span className="flex items-center text-emerald-400">
                <FilePlus size={11} className="mr-1" /> {createdCount} created
              </span>
            )}
            {modifiedCount > 0 && (
              <span className="flex items-center text-sky-400">
                <FileEdit size={11} className="mr-1" /> {modifiedCount} modified
              </span>
            )}
            {deletedCount > 0 && (
              <span className="flex items-center text-rose-400">
                <FileMinus size={11} className="mr-1" /> {deletedCount} deleted
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-1.5 text-[10px] font-mono">
          <span className="text-emerald-400 font-bold">+{totalAdditions}</span>
          <span className="text-rose-400 font-bold">-{totalDeletions}</span>
        </div>
      </div>

      {/* File List */}
      <div className="max-h-60 overflow-y-auto font-mono text-xs">
        {changes.map((change) => {
          const isExpanded = expandedFile === change.path;
          
          return (
            <div key={change.path} className="border-b border-[var(--border-glass)] last:border-0">
              <button
                className="w-full flex items-center justify-between p-2 hover:bg-[var(--border-glass)] transition-colors group cursor-pointer"
                onClick={() => setExpandedFile(isExpanded ? null : change.path)}
              >
                <div className="flex items-center space-x-2 overflow-hidden">
                  <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </span>
                  
                  {change.type === 'created' && <FilePlus size={13} className="text-emerald-400 flex-shrink-0" />}
                  {change.type === 'modified' && <FileEdit size={13} className="text-sky-400 flex-shrink-0" />}
                  {change.type === 'deleted' && <FileMinus size={13} className="text-rose-400 flex-shrink-0" />}
                  
                  <span className="text-xs text-zinc-300 truncate" title={change.path}>
                    {change.path}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2.5 flex-shrink-0">
                  <div className="text-[10px] font-mono text-zinc-500 flex space-x-1">
                    {change.additions > 0 && <span className="text-emerald-400">+{change.additions}</span>}
                    {change.deletions > 0 && <span className="text-rose-400">-{change.deletions}</span>}
                  </div>
                  <button 
                    className="p-1 text-zinc-500 hover:text-[var(--accent-primary)] hover:bg-[var(--border-glass)] rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="View full diff"
                  >
                    <Eye size={13} />
                  </button>
                </div>
              </button>

              {/* Diff Preview */}
              {isExpanded && change.diffSnippet && (
                <div className="p-2.5 bg-black/50 text-[10px] font-mono overflow-x-auto border-t border-[var(--border-glass)]">
                  <pre className="text-zinc-400 whitespace-pre-wrap leading-relaxed">
                    {change.diffSnippet.split('\n').map((line, i) => (
                      <div key={i} className={`
                        ${line.startsWith('+') ? 'text-emerald-400 bg-emerald-500/10' : ''}
                        ${line.startsWith('-') ? 'text-rose-400 bg-rose-500/10' : ''}
                      `}>
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiffSummaryView;
