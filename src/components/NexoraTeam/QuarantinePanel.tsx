import React, { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { KanbanTask, FileDiff } from '../../types/task';
import { ShieldAlert, FileText, Copy, Check, Trash2, ArrowRightLeft, FileCode, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const QuarantinePanel: React.FC = () => {
  const { tasks, quarantineAction } = useTeamStore();
  const quarantinedTasks = tasks.filter((t) => t.state === 'quarantined');
  
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    quarantinedTasks[0]?.id || ''
  );
  
  const activeTask = tasks.find((t) => t.id === selectedTaskId) || quarantinedTasks[0];
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);

  // Sync state if selected task is no longer quarantined
  React.useEffect(() => {
    if (quarantinedTasks.length > 0 && !quarantinedTasks.some(t => t.id === selectedTaskId)) {
      setSelectedTaskId(quarantinedTasks[0].id);
      setSelectedFileIdx(0);
    }
  }, [quarantinedTasks, selectedTaskId]);

  if (!activeTask) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-550 p-6 select-none font-mono">
        <ShieldAlert className="w-6 h-6 mb-2 text-zinc-650 stroke-[1.5]" />
        <span className="text-[10px] text-center">No tasks currently quarantined in safety isolation.</span>
      </div>
    );
  }

  const fileDiffs = activeTask.fileDiffs || [];
  const activeDiff: FileDiff | undefined = fileDiffs[selectedFileIdx];

  const handleAction = async (action: 'clone' | 'apply' | 'discard') => {
    await quarantineAction(activeTask.id, action);
  };

  // Helper to split lines for side-by-side display
  const getLines = (content: string) => content.split('\n');

  return (
    <div className="h-full flex flex-col font-mono text-[10px] select-text">
      {/* Header controls */}
      <div className="p-3 border-b border-[#1B1B22] bg-[#121218]/50 flex flex-col gap-2.5 flex-shrink-0 select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#F59E0B]">
            <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />
            <span className="font-bold uppercase tracking-wider text-[11px] font-sans">Quarantine Inspection Center</span>
          </div>
          
          {quarantinedTasks.length > 1 && (
            <select
              value={selectedTaskId}
              onChange={(e) => {
                setSelectedTaskId(e.target.value);
                setSelectedFileIdx(0);
              }}
              className="bg-[#0D0D10] border border-[#1B1B22] rounded-md px-2.5 py-1 text-[9px] text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50 cursor-pointer"
            >
              {quarantinedTasks.map(t => (
                <option key={t.id} value={t.id}>{t.title} ({t.id})</option>
              ))}
            </select>
          )}
        </div>

        {/* Reason Alert Banner */}
        {activeTask.quarantineReason && (
          <div className="p-2.5 border border-[#F59E0B]/15 bg-[#F59E0B]/5 rounded-lg text-[9px] text-[#F59E0B]/90 flex items-start gap-2 select-text leading-relaxed">
            <Terminal className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="block text-[8px] uppercase tracking-wider text-[#F59E0B] font-bold mb-0.5 select-none">Isolation Trigger Cause</strong>
              <span>{activeTask.quarantineReason}</span>
            </div>
          </div>
        )}
      </div>

      {/* File Selector & Diffs split container */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* File selector tab bar */}
        {fileDiffs.length > 0 && (
          <div className="flex items-center border-b border-[#1B1B22] bg-[#0D0D10]/20 px-3 py-1.5 overflow-x-auto flex-shrink-0 gap-1.5 select-none">
            {fileDiffs.map((diff, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedFileIdx(idx)}
                className={`px-3 py-1 rounded-md text-[9px] font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  idx === selectedFileIdx
                    ? 'bg-[#121218] text-zinc-100 border-[#1B1B22]'
                    : 'text-zinc-500 border-transparent hover:text-zinc-350 hover:bg-[#1B1B22]'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-zinc-400" />
                <span>{diff.filePath.split('/').pop()}</span>
              </button>
            ))}
          </div>
        )}

        {/* Diff workspace */}
        <div className="flex-1 overflow-y-auto min-h-0 p-3">
          <AnimatePresence mode="wait">
            {activeDiff ? (
              <motion.div 
                key={selectedFileIdx}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.12 }}
                className="grid grid-cols-2 gap-3 h-full min-h-[160px]"
              >
                {/* Original Content */}
                <div className="flex flex-col border border-[#1B1B22] rounded-xl bg-[#0D0D10]/30 overflow-hidden shadow-inner">
                  <div className="px-3 py-1.5 border-b border-[#1B1B22] bg-[#121218]/45 text-[8px] text-zinc-500 uppercase flex justify-between items-center flex-shrink-0 select-none">
                    <span>Baseline (Original)</span>
                    <span className="font-mono text-[#EF4444] font-bold">Deleted (-)</span>
                  </div>
                  <pre className="flex-1 overflow-auto p-3 font-mono text-[9px] leading-normal text-rose-300 bg-[#EF4444]/5 selection:bg-[#EF4444]/20">
                    <code>
                      {getLines(activeDiff.originalContent).map((line, idx) => (
                        <div key={idx} className="flex hover:bg-[#EF4444]/5">
                          <span className="w-6 text-[8px] text-zinc-600 text-right pr-2 select-none">{idx + 1}</span>
                          <span className="flex-1 break-all bg-[#EF4444]/5 px-1">{line || ' '}</span>
                        </div>
                      ))}
                    </code>
                  </pre>
                </div>

                {/* Proposed Content */}
                <div className="flex flex-col border border-[#1B1B22] rounded-xl bg-[#0D0D10]/30 overflow-hidden shadow-inner">
                  <div className="px-3 py-1.5 border-b border-[#1B1B22] bg-[#121218]/45 text-[8px] text-zinc-500 uppercase flex justify-between items-center flex-shrink-0 select-none">
                    <span>Proposed Patch (Workspace)</span>
                    <span className="font-mono text-[#22C55E] font-bold">Added (+)</span>
                  </div>
                  <pre className="flex-1 overflow-auto p-3 font-mono text-[9px] leading-normal text-emerald-300 bg-[#22C55E]/5 selection:bg-[#22C55E]/20">
                    <code>
                      {getLines(activeDiff.newContent).map((line, idx) => (
                        <div key={idx} className="flex hover:bg-[#22C55E]/5">
                          <span className="w-6 text-[8px] text-zinc-650 text-right pr-2 select-none">{idx + 1}</span>
                          <span className="flex-1 break-all bg-[#22C55E]/5 px-1">{line || ' '}</span>
                        </div>
                      ))}
                    </code>
                  </pre>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600 italic">
                No files modified in this task.
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Operator controls bar */}
      <div className="p-3.5 border-t border-[#1B1B22] bg-[#121218]/60 flex items-center justify-between gap-3 flex-shrink-0 select-none">
        <button
          onClick={() => handleAction('discard')}
          className="flex-1 py-2 px-3 rounded-lg bg-[#121218] hover:bg-[#1B1B22] text-[#EF4444] hover:text-red-400 border border-[#1B1B22] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" /> 
          <span>Discard</span>
        </button>

        <button
          onClick={() => handleAction('clone')}
          className="flex-1 py-2 px-3 rounded-lg bg-[#121218] hover:bg-[#1B1B22] text-zinc-300 hover:text-zinc-200 border border-[#1B1B22] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5" /> 
          <span>Clone Task</span>
        </button>

        <button
          onClick={() => handleAction('apply')}
          className="flex-1 py-2 px-3 rounded-lg bg-[#22C55E] hover:bg-[#22C55E]/90 text-[#0D0D10] font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-[#22C55E]/15"
        >
          <Check className="w-3.5 h-3.5" /> 
          <span>Apply Changes</span>
        </button>
      </div>
    </div>
  );
};
export default QuarantinePanel;
