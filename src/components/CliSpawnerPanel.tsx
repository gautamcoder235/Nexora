import React, { useState, useEffect } from 'react';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import { PluginRegistry } from '../plugins';
import { Plus, Terminal } from 'lucide-react';
import { AgentCapabilities } from '../types';

export const CliSpawnerPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCliId, setSelectedCliId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  
  useEffect(() => {
    const handleToggle = () => setIsExpanded(prev => !prev);
    window.addEventListener('toggle-add-agent', handleToggle);
    return () => window.removeEventListener('toggle-add-agent', handleToggle);
  }, []);
  
  const projects = useOrchestratorStore(s => s.projects);
  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const settings = useOrchestratorStore(s => s.settings);
  const createAgent = useOrchestratorStore(s => s.createAgent);

  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);

  // Combine custom CLIs and predefined CLIs
  const predefinedCLIs = PluginRegistry.getAll().filter(p => p.id !== 'generic').map(p => {
    const overrides = settings.cliOverrides?.[p.id] || {};
    return {
      id: p.id,
      name: p.name,
      cliCommand: overrides.cliCommand !== undefined ? overrides.cliCommand : p.cliCommand,
      defaultArgs: overrides.defaultArgs !== undefined ? overrides.defaultArgs : p.defaultArgs,
      role: 'predefined',
      capabilities: { coding: true, testing: false, review: false, planning: false },
    };
  });

  const customCLIs = (settings.customCLIs || []).map(c => ({
    id: c.id,
    name: c.name,
    cliCommand: c.command,
    defaultArgs: c.args,
    role: c.rolePreset || 'custom',
    group: c.group,
    capabilities: c.capabilities || { coding: true, testing: false, review: false, planning: false },
    startupInstructions: c.startupInstructions
  }));

  const allCLIs = [...predefinedCLIs, ...customCLIs];

  const handleSpawn = () => {
    if (!selectedCliId || !selectedProjectId) return;
    
    const cli = allCLIs.find(c => c.id === selectedCliId);
    if (!cli) return;

    createAgent({
      name: cli.name,
      cliCommand: cli.cliCommand,
      arguments: cli.defaultArgs,
      env: {},
      projectId: selectedProjectId,
      taskId: null,
      capabilities: cli.capabilities as AgentCapabilities,
      groupId: (cli as any).group || '',
      role: cli.role,
      startupInstructions: (cli as any).startupInstructions || []
    });

    // Reset selection after spawn (optional)
    // setSelectedCliId('');
  };

  return (
    <div className="relative z-30 flex-shrink-0 flex flex-col">
      {/* Header Row */}
      <div className="w-full flex items-center justify-between py-1.5 px-2.5 glass-panel bg-bg-secondary/20 border-b border-border-glass gap-3 h-[34px] relative z-20">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-200 font-mono flex items-center gap-1.5 select-none shrink-0">
          <Terminal size={10} className="text-accent-primary animate-pulse" />
          CLI Agent Swarm
        </h2>
        
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-1 py-1 px-2 text-[9px] font-bold tracking-wider rounded transition-all cursor-pointer h-[22px] whitespace-nowrap shrink-0 ${
            isExpanded 
              ? 'text-zinc-400 bg-bg-tertiary hover:bg-zinc-800 border border-border-glass' 
              : 'text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
          }`}
        >
          {isExpanded ? 'Cancel' : <><Plus size={10} /> New Agent</>}
        </button>
      </div>

      {/* Expanded Spawn Form (Floating Menu) */}
      <div 
        className={`!absolute top-[34px] left-0 right-0 z-10 w-full flex flex-col gap-2.5 p-2.5 glass-panel-elevated bg-[#0a0a0f]/60 backdrop-blur-2xl shadow-2xl border-b border-border-glass transition-all duration-300 ease-in-out origin-top ${
          isExpanded ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-2 invisible pointer-events-none'
        }`}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] uppercase tracking-wide text-zinc-500 font-mono ml-1">Agent Type</label>
          <select
            value={selectedCliId}
            onChange={(e) => setSelectedCliId(e.target.value)}
            className="glass-input w-full text-[10px] text-zinc-300 font-semibold rounded px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="" className="bg-[#0c0c0e]">-- Choose CLI --</option>
            {allCLIs.map(cli => (
              <option key={cli.id} value={cli.id} className="bg-[#0c0c0e]">{cli.name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] uppercase tracking-wide text-zinc-500 font-mono ml-1">Target Project</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="glass-input w-full text-[10px] text-zinc-300 font-semibold rounded px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="" className="bg-[#0c0c0e]">-- Target Project --</option>
            {activeProjects.map(p => (
              <option key={p.id} value={p.id} className="bg-[#0c0c0e]">{p.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            handleSpawn();
            setIsExpanded(false);
          }}
          disabled={!selectedCliId || !selectedProjectId}
          className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 px-2 text-[10px] font-bold tracking-wider text-black bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 rounded transition-all shadow-[0_0_8px_rgba(16,185,129,0.2)] disabled:opacity-40 disabled:shadow-none cursor-pointer"
        >
          Add Agent
        </button>
      </div>
    </div>
  );
};
