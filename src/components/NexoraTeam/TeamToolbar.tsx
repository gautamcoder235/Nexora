import React from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { Play, Pause, Search, Settings, Shield, Activity, Users, Clipboard, Terminal, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

interface TeamToolbarProps {
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: string) => void;
}

export const TeamToolbar: React.FC<TeamToolbarProps> = ({ onSearchChange, onFilterChange }) => {
  const { 
    nodes, 
    tasks, 
    isTeamPaused, 
    pauseTeam, 
    resumeTeam,
    activePresetId,
    loadPreset,
    setAddAgentOpen
  } = useTeamStore();

  const activeAgentsCount = nodes.filter(n => n.status === 'running' || n.status === 'available').length;
  const runningTasksCount = tasks.filter(t => t.state === 'running' || t.state === 'validation').length;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-6 border-b border-[#1B1B22] bg-[#0D0D10]/80 backdrop-blur-md">
      {/* Logo & Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 select-none">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-tr from-[#7C5CFF] to-[#3B82F6] flex items-center justify-center shadow-lg shadow-[#7C5CFF]/20 overflow-hidden">
            <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
            <Shield className="w-4 h-4 text-white relative z-10" />
            <motion.div 
              className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-white font-sans">NEXORA <span className="text-[#7C5CFF] font-medium">TEAM</span></h1>
            <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Multi-Agent OS</p>
          </div>
        </div>

        <div className="h-4 w-px bg-[#1B1B22]" />

        {/* Live Status indicator */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#121218] border border-[#1B1B22] text-[10px] font-medium">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isTeamPaused ? 'bg-[#F59E0B]' : 'bg-[#22C55E]'} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isTeamPaused ? 'bg-[#F59E0B]' : 'bg-[#22C55E]'}`}></span>
          </span>
          <span className="text-zinc-300 capitalize">{isTeamPaused ? 'Orchestration Paused' : 'System Active'}</span>
        </div>
      </div>

      {/* Mid section: Search & Filters */}
      <div className="flex items-center gap-2.5 max-w-xl w-full mx-4">
        <div className="relative w-full max-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search swarm..."
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#121218] border border-[#1B1B22] text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#7C5CFF]/50 transition-colors"
          />
        </div>

        <select
          onChange={(e) => onFilterChange(e.target.value)}
          className="h-9 px-2.5 rounded-lg bg-[#121218] border border-[#1B1B22] text-xs text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50 select-none cursor-pointer"
        >
          <option value="all" className="bg-[#121218] text-zinc-300">All Status</option>
          <option value="running" className="bg-[#121218] text-zinc-300">Running</option>
          <option value="idle" className="bg-[#121218] text-zinc-300">Idle</option>
          <option value="error" className="bg-[#121218] text-zinc-300">Error</option>
        </select>

        {/* Preset Selector */}
        <select
          value={activePresetId}
          onChange={(e) => loadPreset(e.target.value)}
          className="h-9 px-2.5 rounded-lg bg-[#121218] border border-[#1B1B22] text-xs text-[#7C5CFF] font-semibold focus:outline-none focus:border-[#7C5CFF]/50 select-none cursor-pointer"
        >
          <option value="swarm" className="bg-[#121218] text-zinc-300">Preset: Swarm</option>
          <option value="trio" className="bg-[#121218] text-zinc-300">Preset: Trio</option>
          <option value="solo" className="bg-[#121218] text-zinc-300">Preset: Solo</option>
        </select>

        {/* Add Agent Trigger */}
        <button
          onClick={() => setAddAgentOpen(true)}
          className="h-9 px-3 rounded-lg border border-[#7C5CFF]/30 bg-[#7C5CFF]/10 text-xs font-semibold text-[#7C5CFF] hover:bg-[#7C5CFF]/25 hover:border-[#7C5CFF]/50 transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0"
          title="Add Custom Swarm Agent"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add Agent</span>
        </button>
      </div>

      {/* Right side: Stats & Controls */}
      <div className="flex items-center gap-4">
        {/* Metric counts */}
        <div className="flex items-center gap-3 text-xs select-none">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#121218] border border-[#1B1B22]" title="Active Agents">
            <Users className="w-3.5 h-3.5 text-[#3B82F6]" />
            <span className="font-mono text-zinc-300">{activeAgentsCount}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#121218] border border-[#1B1B22]" title="Running Tasks">
            <Clipboard className="w-3.5 h-3.5 text-[#7C5CFF]" />
            <span className="font-mono text-[#7C5CFF] font-semibold">{runningTasksCount}</span>
          </div>
        </div>

        <div className="h-4 w-px bg-[#1B1B22]" />

        {/* Global Controls */}
        <div className="flex items-center gap-2">
          {isTeamPaused ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={resumeTeam}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#22C55E] text-xs font-semibold text-[#0D0D10] hover:bg-[#22C55E]/90 transition-colors shadow-lg shadow-[#22C55E]/15"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Resume Team</span>
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={pauseTeam}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#121218] border border-[#1B1B22] text-xs font-semibold text-zinc-200 hover:bg-[#1B1B22] transition-colors"
            >
              <Pause className="w-3 h-3 fill-current" />
              <span>Pause Team</span>
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => useTeamStore.getState().setCommandOpen(true)}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#121218] border border-[#1B1B22] text-zinc-400 hover:text-zinc-200 hover:bg-[#1B1B22] transition-colors"
            title="Open Command Center (Ctrl+K)"
          >
            <Terminal className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </header>
  );
};
