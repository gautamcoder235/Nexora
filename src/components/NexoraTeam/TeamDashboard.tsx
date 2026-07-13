import React, { useEffect, useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { TeamGraph } from './TeamGraph';
import { TeamChat } from './TeamChat';
import { AgentInspector } from './AgentInspector';
import { UserPlus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const TeamDashboard: React.FC = () => {
  const { 
    fetchState, 
    activeInspectId, 
    nodes,
    isAddAgentOpen,
    setAddAgentOpen,
    addCustomAgent
  } = useTeamStore();

  // Custom Agent Form local states
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState<'coordinator' | 'builder' | 'scout' | 'reviewer'>('builder');
  const [newAgentCli, setNewAgentCli] = useState('');
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);

  const handleAddAgentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    addCustomAgent(newAgentName.trim(), newAgentRole, newAgentCli.trim(), selectedConnections);
    // Reset state
    setNewAgentName('');
    setNewAgentRole('builder');
    setNewAgentCli('');
    setSelectedConnections([]);
    setAddAgentOpen(false);
  };

  // Load state on mount
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  return (
    <div className="h-full w-full flex bg-[#0D0D10] text-zinc-150 select-none overflow-hidden nexora-team-theme font-sans p-4 gap-4">
      {/* Left Column: Graph Workspace */}
      <div className="flex-[6] min-w-0 relative h-full">
        <TeamGraph />
        {/* Floating Agent Inspector Overlay */}
        <AnimatePresence>
          {activeInspectId && <AgentInspector />}
        </AnimatePresence>
      </div>

      {/* Right Column: Team Chat */}
      <div className="flex-[4] min-w-[320px] h-full">
        <TeamChat />
      </div>

      {/* Add Custom Agent Modal */}
      <AnimatePresence>
        {isAddAgentOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#060609]/60 backdrop-blur-sm select-none">
            <div className="absolute inset-0 cursor-pointer" onClick={() => setAddAgentOpen(false)} />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-md rounded-2xl border border-[#1B1B22] bg-[#121218]/95 backdrop-blur-xl shadow-2xl p-5 overflow-hidden flex flex-col font-sans text-xs"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#1B1B22] pb-3 mb-4 select-none">
                <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-[#7C5CFF]" /> Add Custom Agent to Swarm
                </span>
                <button
                  onClick={() => setAddAgentOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md hover:bg-[#1B1B22] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleAddAgentSubmit} className="space-y-4 font-mono select-text">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Agent Label / Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aider-Next (Builder)"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#0D0D10] border border-[#1B1B22] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-[#7C5CFF]/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Role</label>
                    <select
                      value={newAgentRole}
                      onChange={(e) => setNewAgentRole(e.target.value as any)}
                      className="w-full h-9 px-3 rounded-lg bg-[#0D0D10] border border-[#1B1B22] text-zinc-200 focus:outline-none focus:border-[#7C5CFF]/50 select-none cursor-pointer"
                    >
                      <option value="builder" className="bg-[#121218] text-zinc-300">Builder</option>
                      <option value="scout" className="bg-[#121218] text-zinc-300">Scout</option>
                      <option value="reviewer" className="bg-[#121218] text-zinc-300">Reviewer</option>
                      <option value="coordinator" className="bg-[#121218] text-zinc-300">Coordinator</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] text-zinc-500 uppercase tracking-wider">CLI binary command</label>
                    <input
                      type="text"
                      placeholder="e.g. aider --model gpt-4"
                      value={newAgentCli}
                      onChange={(e) => setNewAgentCli(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#0D0D10] border border-[#1B1B22] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-[#7C5CFF]/50"
                    />
                  </div>
                </div>

                {/* Wire Connections */}
                <div className="flex flex-col gap-1.5 select-none">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Connect Wires To</label>
                  <div className="max-h-24 overflow-y-auto p-2 bg-[#0D0D10] rounded-lg border border-[#1B1B22] space-y-1.5">
                    {nodes.map(n => (
                      <label key={n.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded transition-colors text-[10px] text-zinc-300 font-mono">
                        <input
                          type="checkbox"
                          checked={selectedConnections.includes(n.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedConnections([...selectedConnections, n.id]);
                            } else {
                              setSelectedConnections(selectedConnections.filter(id => id !== n.id));
                            }
                          }}
                          className="accent-[#7C5CFF]"
                        />
                        <span>{n.label} ({n.role})</span>
                      </label>
                    ))}
                    {nodes.length === 0 && (
                      <span className="text-zinc-600 italic block text-[9px] text-center">No other agents in swarm.</span>
                    )}
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={!newAgentName.trim()}
                  className="w-full h-9 rounded-lg bg-[#7C5CFF] text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#7C5CFF]/90 transition-colors disabled:opacity-40 cursor-pointer select-none"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Spawn Custom Agent</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TeamDashboard;
