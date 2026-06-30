import React, { useState, useEffect, useRef } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { Play, Pause, RotateCcw, ShieldCheck, Lock, Unlock, Radio, Terminal, Search, X, UserPlus, Clipboard, MessageSquare, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const TeamCommandCenter: React.FC = () => {
  const {
    isCommandOpen,
    setCommandOpen,
    isTeamPaused,
    pauseTeam,
    resumeTeam,
    nodes,
    tasks,
    rollbackTask,
    forceValidation,
    releaseLocks,
    sendDirective
  } = useTeamStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'agent' | 'task' | 'system'>('all');
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null);
  
  // Sub-menu form inputs
  const [directiveText, setDirectiveText] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (isCommandOpen) {
      inputRef.current?.focus();
      setSearchQuery('');
      setActiveSubMenu(null);
    }
  }, [isCommandOpen]);

  // Handle ESC key to close command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeSubMenu) {
          setActiveSubMenu(null);
        } else {
          setCommandOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSubMenu, setCommandOpen]);

  if (!isCommandOpen) return null;

  const commands = [
    {
      id: 'resume_team',
      title: 'Resume Team Orchestration',
      description: 'Start processing tasks and collaboration pipelines.',
      icon: <Play className="w-4 h-4 text-[#22C55E]" />,
      category: 'system',
      action: () => {
        resumeTeam();
        setCommandOpen(false);
      },
      show: isTeamPaused,
    },
    {
      id: 'pause_team',
      title: 'Pause Team Orchestration',
      description: 'Halt agent movements and code validation queues.',
      icon: <Pause className="w-4 h-4 text-[#F59E0B]" />,
      category: 'system',
      action: () => {
        pauseTeam();
        setCommandOpen(false);
      },
      show: !isTeamPaused,
    },
    {
      id: 'send_directive',
      title: 'Send Directive to Agent',
      description: 'Broadcast a high-priority code or architecture instruction.',
      icon: <MessageSquare className="w-4 h-4 text-[#7C5CFF]" />,
      category: 'agent',
      action: () => {
        setActiveSubMenu('send_directive');
        if (nodes.length > 0) setSelectedAgentId(nodes[0].id);
      },
      show: true,
    },
    {
      id: 'release_locks',
      title: 'Release Locked Files',
      description: 'Force release active locks held by any worker agent.',
      icon: <Lock className="w-4 h-4 text-[#EF4444]" />,
      category: 'agent',
      action: () => {
        setActiveSubMenu('release_locks');
        const lockedAgent = nodes.find(n => n.lockedFiles && n.lockedFiles.length > 0);
        setSelectedAgentId(lockedAgent ? lockedAgent.id : nodes[0]?.id || '');
      },
      show: true,
    },
    {
      id: 'force_validate',
      title: 'Force Run Task Validation',
      description: 'Trigger linting, compilation, and unit test pipelines.',
      icon: <ShieldCheck className="w-4 h-4 text-[#3B82F6]" />,
      category: 'task',
      action: () => {
        setActiveSubMenu('force_validate');
        const activeTasks = tasks.filter(t => t.state !== 'done');
        setSelectedTaskId(activeTasks.length > 0 ? activeTasks[0].id : '');
      },
      show: true,
    },
    {
      id: 'rollback_task',
      title: 'Rollback Task Checkpoint',
      description: 'Discard code attempts and revert task state to planning.',
      icon: <RotateCcw className="w-4 h-4 text-zinc-400" />,
      category: 'task',
      action: () => {
        setActiveSubMenu('rollback_task');
        const nonBacklogTasks = tasks.filter(t => t.state !== 'backlog');
        const runningTask = tasks.find(t => t.state === 'running' || t.state === 'validation');
        setSelectedTaskId(runningTask ? runningTask.id : (nonBacklogTasks.length > 0 ? nonBacklogTasks[0].id : ''));
      },
      show: true,
    },
  ];

  const filteredCommands = commands
    .filter(cmd => cmd.show)
    .filter(cmd => selectedCategory === 'all' || cmd.category === selectedCategory)
    .filter(cmd => 
      cmd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const handleDirectiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directiveText.trim()) return;
    const target = selectedAgentId === 'all' ? null : selectedAgentId;
    await sendDirective(target, directiveText);
    setDirectiveText('');
    setCommandOpen(false);
  };

  const handleReleaseLocksSubmit = async () => {
    if (!selectedAgentId) return;
    await releaseLocks(selectedAgentId);
    setCommandOpen(false);
  };

  const handleRollbackSubmit = async () => {
    if (!selectedTaskId) return;
    await rollbackTask(selectedTaskId);
    setCommandOpen(false);
  };

  const handleForceValidateSubmit = async () => {
    if (!selectedTaskId) return;
    await forceValidation(selectedTaskId);
    setCommandOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#060609]/60 backdrop-blur-sm">
      {/* Backdrop closer click zone */}
      <div className="absolute inset-0" onClick={() => setCommandOpen(false)} />

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-lg rounded-2xl border border-[#1B1B22] bg-[#121218]/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col font-sans"
      >
        <AnimatePresence mode="wait">
          {!activeSubMenu ? (
            <motion.div
              key="main-menu"
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 10, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex flex-col"
            >
              {/* Search Bar */}
              <div className="flex items-center px-4 border-b border-[#1B1B22] h-12">
                <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type a command or search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-full pl-3 bg-transparent text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none"
                />
                <button
                  onClick={() => setCommandOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md hover:bg-[#1B1B22] transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Category tabs */}
              <div className="flex items-center border-b border-[#1B1B22] px-3 py-2 gap-1.5 bg-[#0D0D10]/50 select-none">
                {(['all', 'agent', 'task', 'system'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-mono tracking-wider uppercase border transition-colors ${
                      selectedCategory === cat
                        ? 'bg-[#7C5CFF]/15 text-[#7C5CFF] border-[#7C5CFF]/30'
                        : 'text-zinc-500 border-transparent hover:text-zinc-350'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Commands List */}
              <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                {filteredCommands.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-650 font-mono">
                    No commands matched your query.
                  </div>
                ) : (
                  filteredCommands.map(cmd => (
                    <button
                      key={cmd.id}
                      onClick={cmd.action}
                      className="w-full p-3 rounded-xl border border-transparent hover:border-[#1B1B22] hover:bg-[#121218] flex items-start gap-3 text-left transition-all duration-150 select-none group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#0D0D10] border border-[#1B1B22] flex items-center justify-center flex-shrink-0 group-hover:border-zinc-700 transition-colors">
                        {cmd.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">{cmd.title}</h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{cmd.description}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-[#1B1B22] bg-[#0D0D10]/40 flex items-center justify-between text-[9px] font-mono text-zinc-550 select-none">
                <span>Use <kbd className="px-1 py-0.5 rounded bg-[#121218] border border-[#1B1B22]">ESC</kbd> to exit palette</span>
                <span>Nexora Team Orchestrator Console</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="sub-menu"
              initial={{ x: 10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -10, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="p-5 flex flex-col gap-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between select-none">
                <h3 className="text-xs font-bold font-sans tracking-wide uppercase text-zinc-350 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#7C5CFF]" />
                  <span>Configure {activeSubMenu.replace('_', ' ')}</span>
                </h3>
                <button
                  onClick={() => setActiveSubMenu(null)}
                  className="text-xs text-[#7C5CFF] hover:text-[#7C5CFF]/90 font-mono font-semibold"
                >
                  &larr; Back
                </button>
              </div>

              {/* Directive Form */}
              {activeSubMenu === 'send_directive' && (
                <form onSubmit={handleDirectiveSubmit} className="space-y-4 font-mono text-xs">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Target Agent</span>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#0D0D10] border border-[#1B1B22] text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50"
                    >
                      <option value="all">Global (Broadcast)</option>
                      {nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.label} ({n.role})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Directive Instruction</span>
                    <textarea
                      placeholder="Enter directive command to guide execution..."
                      value={directiveText}
                      onChange={(e) => setDirectiveText(e.target.value)}
                      rows={3}
                      className="w-full p-3 rounded-lg bg-[#0D0D10] border border-[#1B1B22] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-[#7C5CFF]/50 resize-none font-sans"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!directiveText.trim()}
                    className="w-full h-9 rounded-lg bg-[#7C5CFF] text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#7C5CFF]/90 transition-colors disabled:opacity-40"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Dispatch Directive</span>
                  </button>
                </form>
              )}

              {/* Release Locks Form */}
              {activeSubMenu === 'release_locks' && (
                <div className="space-y-4 font-mono text-xs">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Agent locks to unlock</span>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#0D0D10] border border-[#1B1B22] text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50"
                    >
                      {nodes.length === 0 ? (
                        <option value="" disabled className="bg-[#121218] text-zinc-500">No agents available</option>
                      ) : (
                        nodes.map(n => (
                          <option key={n.id} value={n.id} className="bg-[#121218] text-zinc-300">{n.label} ({n.lockedFiles?.length || 0} locks)</option>
                        ))
                      )}
                    </select>
                  </div>
                  <button
                    onClick={handleReleaseLocksSubmit}
                    className="w-full h-9 rounded-lg bg-[#EF4444] text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#EF4444]/90 transition-colors shadow-lg shadow-[#EF4444]/15"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Force Release Locks</span>
                  </button>
                </div>
              )}

              {/* Force Validate Form */}
              {activeSubMenu === 'force_validate' && (
                <div className="space-y-4 font-mono text-xs">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Active Task</span>
                    <select
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#0D0D10] border border-[#1B1B22] text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50"
                    >
                      {tasks.filter(t => t.state !== 'done').length === 0 ? (
                        <option value="" disabled className="bg-[#121218] text-zinc-500">No tasks in validation</option>
                      ) : (
                        tasks.filter(t => t.state !== 'done').map(t => (
                          <option key={t.id} value={t.id} className="bg-[#121218] text-zinc-300">{t.id} - {t.title}</option>
                        ))
                      )}
                    </select>
                  </div>
                  <button
                    onClick={handleForceValidateSubmit}
                    className="w-full h-9 rounded-lg bg-[#3B82F6] text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#3B82F6]/90 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Trigger Pipeline validation</span>
                  </button>
                </div>
              )}

              {/* Rollback Task Form */}
              {activeSubMenu === 'rollback_task' && (
                <div className="space-y-4 font-mono text-xs">
                  <div className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-950/30 bg-rose-950/5 text-[#EF4444] text-[10px]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Warning: A rollback will delete the active code workspace attempts and restore the task to planning.</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Active Task to Reset</span>
                    <select
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#0D0D10] border border-[#1B1B22] text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50"
                    >
                      {tasks.filter(t => t.state !== 'backlog').length === 0 ? (
                        <option value="" disabled className="bg-[#121218] text-zinc-500">No tasks to rollback</option>
                      ) : (
                        tasks.filter(t => t.state !== 'backlog').map(t => (
                          <option key={t.id} value={t.id} className="bg-[#121218] text-zinc-300">{t.id} - {t.title}</option>
                        ))
                      )}
                    </select>
                  </div>
                  <button
                    onClick={handleRollbackSubmit}
                    className="w-full h-9 rounded-lg bg-[#EF4444] text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#EF4444]/90 transition-colors shadow-lg shadow-[#EF4444]/15"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Perform Rollback</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
export default TeamCommandCenter;
