import React, { useState, useEffect } from 'react';
import { BookOpen, AlertTriangle, Lightbulb, CheckCircle2, Bookmark, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrchestratorStore } from '../../stores/orchestratorStore';

interface FailureItem {
  id: string;
  error: string;
  remedy: string;
  timestamp: string;
}

interface SuccessItem {
  id: string;
  pattern: string;
  solution: string;
  timestamp: string;
}

export const KnowledgeBasePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'failures' | 'successes'>('failures');
  const [searchTerm, setSearchTerm] = useState('');
  
  const activeWorkspaceId = useOrchestratorStore((s) => s.activeWorkspaceId);
  const workspaces = useOrchestratorStore((s) => s.workspaces);
  const [kbData, setKbData] = useState<{ failures: FailureItem[]; successes: SuccessItem[] }>({ failures: [], successes: [] });

  useEffect(() => {
    const loadKb = async () => {
      const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
      if (!activeWorkspace) return;
      
      const kbPath = `${activeWorkspace.rootPath}/.nexora/team_kb.json`;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const content = await invoke<string>("read_project_file", { path: kbPath });
        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            setKbData({
              failures: parsed.map((item: any, idx: number) => ({
                id: item.execution_id || `fail-${idx}`,
                error: item.error_message || "Unknown error",
                remedy: "Review execution log for remedies",
                timestamp: new Date(item.timestamp).toLocaleString()
              })),
              successes: []
            });
          } else {
            setKbData({
              failures: parsed.failures || [],
              successes: parsed.successes || []
            });
          }
        }
      } catch (e) {
        setKbData({ failures: [], successes: [] });
      }
    };
    loadKb();
  }, [activeWorkspaceId, workspaces]);

  // Fallback to avoid empty state if JSON resolution fails
  const failures: FailureItem[] = kbData?.failures || [];
  const successes: SuccessItem[] = kbData?.successes || [];

  const filteredFailures = failures.filter(
    (item) =>
      item.error.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.remedy.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSuccesses = successes.filter(
    (item) =>
      item.pattern.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.solution.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col font-mono text-[10px] select-text">
      {/* Header controls */}
      <div className="p-3 border-b border-[#1B1B22] bg-[#121218]/50 flex flex-col gap-2.5 flex-shrink-0 select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-400">
            <BookOpen className="w-3.5 h-3.5 text-[#7C5CFF]" />
            <span className="font-bold uppercase tracking-wider text-[11px] font-sans">Team Knowledge Base</span>
          </div>
          <span className="text-[9px] text-zinc-500 font-mono">.nexora/team_kb.json</span>
        </div>

        {/* Tabs and Search */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex rounded-lg border border-[#1B1B22] bg-[#0D0D10]/30 p-0.5 select-none">
            <button
              onClick={() => setActiveTab('failures')}
              className={`px-3 py-1 rounded-md text-[9px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                activeTab === 'failures'
                  ? 'bg-[#121218] text-[#F59E0B]'
                  : 'text-zinc-555 hover:text-zinc-350'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Failure Logs ({failures.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('successes')}
              className={`px-3 py-1 rounded-md text-[9px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                activeTab === 'successes'
                  ? 'bg-[#121218] text-[#22C55E]'
                  : 'text-zinc-555 hover:text-zinc-350'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Successes ({successes.length})</span>
            </button>
          </div>

          <div className="relative w-40">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search KB..."
              className="w-full bg-[#0D0D10] border border-[#1B1B22] rounded px-7 py-1.5 text-[9px] text-zinc-300 placeholder-zinc-650 focus:outline-none focus:border-[#7C5CFF]/50"
            />
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5 min-h-0">
        <AnimatePresence mode="wait">
          {activeTab === 'failures' ? (
            <motion.div
              key="failures-tab"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.12 }}
              className="space-y-2.5"
            >
              {filteredFailures.length === 0 ? (
                <div className="py-8 text-center text-zinc-600 italic">
                  No matching failure logs found.
                </div>
              ) : (
                filteredFailures.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-xl border border-[#EF4444]/15 bg-[#EF4444]/5 space-y-2">
                    <div className="flex justify-between items-start gap-2 border-b border-[#EF4444]/10 pb-2">
                      <span className="font-bold text-rose-300 break-all leading-normal">{item.error}</span>
                      <span className="text-[8px] text-zinc-500 flex-shrink-0 font-mono mt-0.5">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-[10px] leading-relaxed text-zinc-300">
                      <span className="text-[#F59E0B] font-bold uppercase text-[9px] mr-1.5">Remedy:</span>
                      {item.remedy}
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          ) : (
            <motion.div
              key="successes-tab"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.12 }}
              className="space-y-2.5"
            >
              {filteredSuccesses.length === 0 ? (
                <div className="py-8 text-center text-zinc-600 italic">
                  No matching success patterns found.
                </div>
              ) : (
                filteredSuccesses.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-xl border border-[#22C55E]/15 bg-[#22C55E]/5 space-y-2">
                    <div className="flex justify-between items-start gap-2 border-b border-[#22C55E]/10 pb-2">
                      <span className="font-bold text-[#22C55E] flex items-center gap-1.5 truncate">
                        <Bookmark className="w-3.5 h-3.5 text-[#22C55E]" /> 
                        <span>{item.pattern}</span>
                      </span>
                      <span className="text-[8px] text-zinc-550 flex-shrink-0 font-mono mt-0.5">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-[10px] leading-relaxed text-zinc-300">
                      <span className="text-[#22C55E] font-bold uppercase text-[9px] mr-1.5">Pattern:</span>
                      {item.solution}
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
export default KnowledgeBasePanel;
