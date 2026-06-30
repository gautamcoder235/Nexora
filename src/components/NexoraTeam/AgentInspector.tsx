import React, { useState, useEffect } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { Lock, Unlock, Play, Pause, AlertTriangle, FileCode, CheckCircle, X, Terminal, Edit } from 'lucide-react';
import { motion } from 'framer-motion';

export const AgentInspector: React.FC = () => {
  const { 
    nodes, 
    activeInspectId, 
    selectInspectNode, 
    pauseAgent, 
    resumeAgent, 
    releaseLocks, 
    tasks,
    updateAgentProperties 
  } = useTeamStore();

  const inspectedAgent = nodes.find(n => n.id === activeInspectId);
  const terminals = useOrchestratorStore(s => s.terminals);

  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editRole, setEditRole] = useState<any>('builder');
  const [editStatus, setEditStatus] = useState<any>('idle');
  const [editCliCommand, setEditCliCommand] = useState('');
  const [editPrompts, setEditPrompts] = useState('');
  const [editConnectedTerminalId, setEditConnectedTerminalId] = useState('');

  // Update local states when inspectedAgent changes
  useEffect(() => {
    if (inspectedAgent) {
      setEditLabel(inspectedAgent.label);
      setEditRole(inspectedAgent.role);
      setEditStatus(inspectedAgent.status);
      setEditCliCommand(inspectedAgent.cliCommand || '');
      setEditPrompts((inspectedAgent.promptContext || []).join('\n'));
      setEditConnectedTerminalId(inspectedAgent.connectedTerminalId || '');
      setIsEditing(false); // Close edit mode when switching agents
    }
  }, [activeInspectId, inspectedAgent]);

  if (!inspectedAgent) return null;



  // Mock Agent Prompts fallback
  const getPromptHistory = (role: string) => {
    switch (role) {
      case 'coordinator':
        return [
          'SYSTEM: You are the team coordinator. Decompose requirements, orchestrate code changes, and review and validate pull requests.',
          'USER DIRECTIVE: Design a glassmorphic border styling for edges.'
        ];
      case 'builder':
        return [
          'SYSTEM: Write robust code conforming to project style and linting standards. Do not output text explainers unless requested.',
          'COORDINATOR: Build the SVG components in TeamGraph.tsx.'
        ];
      case 'scout':
        return [
          'SYSTEM: Index source code files and document system structure. Extract dependencies.',
          'COORDINATOR: Search for existing Zustand store definitions.'
        ];
      default:
        return [
          'SYSTEM: Review pull requests, verify unit test outcomes, check security signatures.',
          'COORDINATOR: Verify validation outcomes on task integration.'
        ];
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#22C55E';
      case 'paused': return '#F59E0B';
      case 'error': return '#EF4444';
      case 'offline': return '#EF4444';
      case 'idle': return '#71717A';
      default: return '#7C5CFF';
    }
  };

  const statusColor = getStatusColor(inspectedAgent.status);

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute top-3 right-3 bottom-3 z-30 w-80 rounded-xl border border-[#1B1B22] bg-[#121218]/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden font-sans"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1B1B22] bg-[#121218]/60 flex items-center justify-between select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span 
            className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-xs font-bold text-zinc-100 truncate">{inspectedAgent.label}</span>
        </div>
        <div className="flex items-center gap-1.5 font-sans">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="text-zinc-500 hover:text-[#7C5CFF] p-1 rounded hover:bg-[#1B1B22] transition-colors cursor-pointer"
              title="Edit properties"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  updateAgentProperties(inspectedAgent.id, {
                    label: editLabel,
                    role: editRole,
                    status: editStatus,
                    cliCommand: editCliCommand,
                    promptContext: editPrompts.split('\n').filter(p => p.trim() !== ''),
                    connectedTerminalId: editConnectedTerminalId || undefined
                  });
                  setIsEditing(false);
                }}
                className="text-[#22C55E] hover:text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded hover:bg-green-500/10 transition-colors cursor-pointer"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditLabel(inspectedAgent.label);
                  setEditRole(inspectedAgent.role);
                  setEditStatus(inspectedAgent.status);
                  setEditCliCommand(inspectedAgent.cliCommand || '');
                  setEditPrompts((inspectedAgent.promptContext || []).join('\n'));
                  setEditConnectedTerminalId(inspectedAgent.connectedTerminalId || '');
                  setIsEditing(false);
                }}
                className="text-[#EF4444] hover:text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
          <button
            onClick={() => selectInspectNode(null)}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md hover:bg-[#1B1B22] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body Scroll area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 select-text">
        {isEditing ? (
          <div className="space-y-4 font-mono text-xs">
            {/* Edit Mode Fields */}
            <div className="space-y-1">
              <span className="text-zinc-500 block text-[9px] uppercase tracking-wider font-bold">Agent Label / Name</span>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="w-full h-8 px-2 rounded bg-[#0D0D10] border border-[#1B1B22] text-xs text-zinc-250 focus:outline-none focus:border-[#7C5CFF]/50 font-sans"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-zinc-500 block text-[9px] uppercase tracking-wider font-bold">Role</span>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full h-8 px-1 rounded bg-[#0D0D10] border border-[#1B1B22] text-xs text-zinc-250 focus:outline-none focus:border-[#7C5CFF]/50 cursor-pointer font-sans"
                >
                  <option value="coordinator" className="bg-[#121218] text-zinc-300">Coordinator</option>
                  <option value="builder" className="bg-[#121218] text-zinc-300">Builder</option>
                  <option value="scout" className="bg-[#121218] text-zinc-300">Scout</option>
                  <option value="reviewer" className="bg-[#121218] text-zinc-300">Reviewer</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-zinc-500 block text-[9px] uppercase tracking-wider font-bold">Status</span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full h-8 px-1 rounded bg-[#0D0D10] border border-[#1B1B22] text-xs text-zinc-250 focus:outline-none focus:border-[#7C5CFF]/50 cursor-pointer font-sans"
                >
                  <option value="idle" className="bg-[#121218] text-zinc-300">Idle</option>
                  <option value="running" className="bg-[#121218] text-zinc-300">Running</option>
                  <option value="paused" className="bg-[#121218] text-zinc-300">Paused</option>
                  <option value="error" className="bg-[#121218] text-zinc-300">Error</option>
                  <option value="offline" className="bg-[#121218] text-zinc-300">Offline</option>
                  <option value="available" className="bg-[#121218] text-zinc-300">Available</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-zinc-500 block text-[9px] uppercase tracking-wider font-bold">CLI Binary Command</span>
              <input
                type="text"
                value={editCliCommand}
                onChange={(e) => setEditCliCommand(e.target.value)}
                className="w-full h-8 px-2 rounded bg-[#0D0D10] border border-[#1B1B22] text-xs text-zinc-200 font-mono focus:outline-none focus:border-[#7C5CFF]/50"
              />
            </div>

            <div className="space-y-1">
              <span className="text-zinc-500 block text-[9px] uppercase tracking-wider font-bold">Connected Terminal</span>
              <select
                value={editConnectedTerminalId}
                onChange={(e) => setEditConnectedTerminalId(e.target.value)}
                className="w-full h-8 px-1 rounded bg-[#0D0D10] border border-[#1B1B22] text-xs text-zinc-250 focus:outline-none focus:border-[#7C5CFF]/50 cursor-pointer font-sans"
              >
                <option value="" className="bg-[#121218] text-zinc-500">None</option>
                {terminals.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#121218] text-zinc-300">
                    {t.title} ({t.id.substring(0, 8)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <span className="text-zinc-500 block text-[9px] uppercase tracking-wider font-bold">Prompt Context (Line-by-line)</span>
              <textarea
                rows={5}
                value={editPrompts}
                onChange={(e) => setEditPrompts(e.target.value)}
                className="w-full p-2 rounded bg-[#0D0D10] border border-[#1B1B22] text-[10px] text-zinc-300 font-mono resize-none focus:outline-none focus:border-[#7C5CFF]/50"
                placeholder="SYSTEM: You are...&#10;COORDINATOR: Write..."
              />
            </div>
          </div>
        ) : (
          <>
            {/* Core Info Info */}
            <div className="grid grid-cols-2 gap-3 text-xs border-b border-[#1B1B22] pb-3">
              <div>
                <span className="text-zinc-500 block text-[9px] font-mono uppercase tracking-wider">Role</span>
                <span className="font-semibold text-zinc-200 capitalize">{inspectedAgent.role}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[9px] font-mono uppercase tracking-wider">Status</span>
                <span className="font-semibold text-zinc-200 capitalize">{inspectedAgent.status}</span>
              </div>
            </div>

            {/* CLI Command Info (View Mode) */}
            <div className="space-y-1 border-b border-[#1B1B22] pb-3">
              <span className="text-[9px] font-bold font-mono tracking-wider uppercase text-zinc-500 block">CLI Terminal Command</span>
              <span className="text-[10px] font-mono text-zinc-300 bg-[#0D0D10] px-2 py-1.5 rounded border border-[#1B1B22] block truncate">
                {inspectedAgent.cliCommand || `nexora run ${inspectedAgent.role}`}
              </span>
            </div>

            {/* Connected Terminal (View Mode) */}
            <div className="space-y-1 border-b border-[#1B1B22] pb-3">
              <span className="text-[9px] font-bold font-mono tracking-wider uppercase text-zinc-500 block">Connected Terminal</span>
              <span className="text-[10px] font-mono text-zinc-300 bg-[#0D0D10] px-2 py-1.5 rounded border border-[#1B1B22] block truncate">
                {inspectedAgent.connectedTerminalId 
                  ? `${terminals.find(t => t.id === inspectedAgent.connectedTerminalId)?.title || 'Terminal'} (${inspectedAgent.connectedTerminalId.substring(0, 8)})`
                  : 'None'
                }
              </span>
            </div>

            {/* File Locks */}
            <div className="space-y-2 border-b border-[#1B1B22] pb-3">
              <div className="flex justify-between items-center select-none">
                <span className="text-[9px] font-bold font-mono tracking-wider uppercase text-zinc-500 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-[#F59E0B]" /> Held Locks
                </span>
                {(inspectedAgent.lockedFiles || []).length > 0 && (
                  <button
                    onClick={() => releaseLocks(inspectedAgent.id)}
                    className="text-[9px] text-[#EF4444] hover:text-red-400 font-semibold flex items-center gap-0.5"
                  >
                    <Unlock className="w-2.5 h-2.5" /> Release Locks
                  </button>
                )}
              </div>
              {(inspectedAgent.lockedFiles || []).length === 0 ? (
                <span className="text-[10px] text-zinc-500 italic block font-mono">No active locks.</span>
              ) : (
                <div className="space-y-1">
                  {(inspectedAgent.lockedFiles || []).map((file, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0D0D10] border border-[#1B1B22] text-[10px] font-mono text-zinc-300">
                      <FileCode className="w-3 h-3 text-[#F59E0B] flex-shrink-0" />
                      <span className="truncate flex-1">{file}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>



            {/* Instructions / Prompt History */}
            <div className="space-y-1.5 pb-2">
              <span className="text-[9px] font-bold font-mono tracking-wider uppercase text-zinc-500 block">Prompt Context</span>
              <div className="space-y-2 font-mono text-[9px] text-zinc-400 bg-[#0D0D10] p-2.5 rounded-lg border border-[#1B1B22]">
                {(inspectedAgent.promptContext && inspectedAgent.promptContext.length > 0
                  ? inspectedAgent.promptContext 
                  : getPromptHistory(inspectedAgent.role)
                ).map((prompt, idx) => (
                  <div key={idx} className="border-b border-[#1B1B22] pb-2 last:border-b-0 last:pb-0 last:mb-0 whitespace-pre-wrap flex gap-1.5 items-start">
                    <Terminal className="w-3 h-3 text-[#7C5CFF] flex-shrink-0 mt-0.5" />
                    <span>{prompt}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Operator controls */}
      {!isEditing && (
        <div className="p-3.5 border-t border-[#1B1B22] bg-[#121218]/60 flex items-center justify-between gap-2.5 select-none">
          {inspectedAgent.status === 'running' ? (
            <button
              onClick={() => pauseAgent(inspectedAgent.id)}
              className="flex-1 py-2 px-3 rounded-lg bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-[#0D0D10] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-[#F59E0B]/10 cursor-pointer"
            >
              <Pause className="w-3 h-3 fill-current" />
              <span>Pause Agent</span>
            </button>
          ) : (
            <button
              onClick={() => resumeAgent(inspectedAgent.id)}
              className="flex-1 py-2 px-3 rounded-lg bg-[#22C55E] hover:bg-[#22C55E]/90 text-[#0D0D10] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-[#22C55E]/10 cursor-pointer"
              disabled={inspectedAgent.status === 'offline'}
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Resume Agent</span>
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};
export default AgentInspector;
