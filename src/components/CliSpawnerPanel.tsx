import React, { useState } from 'react';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import { PluginRegistry } from '../plugins';
import { Plus, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { AgentCapabilities } from '../types';

export const CliSpawnerPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCliId, setSelectedCliId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  
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
    <div className="bg-[#0c0c0e] border border-[#232329] rounded-lg overflow-hidden flex-shrink-0">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2.5 bg-[#121216] hover:bg-[#16161a] transition-colors border-b border-[#232329]"
      >
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-sky-400" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
            Spawn CLI Agent
          </span>
        </div>
        {isExpanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
      </button>

      {isExpanded && (
        <div className="p-3 bg-[#0a0a0c] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase">Select CLI Template</label>
              <select
                value={selectedCliId}
                onChange={(e) => setSelectedCliId(e.target.value)}
                className="w-full bg-[#16161a] text-xs text-zinc-300 border border-[#2d2d35] px-2 py-1.5 rounded outline-none cursor-pointer focus:border-sky-500/50"
              >
                <option value="">-- Choose CLI --</option>
                {allCLIs.map(cli => (
                  <option key={cli.id} value={cli.id}>{cli.name} ({cli.cliCommand})</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase">Assign Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full bg-[#16161a] text-xs text-zinc-300 border border-[#2d2d35] px-2 py-1.5 rounded outline-none cursor-pointer focus:border-sky-500/50"
              >
                <option value="">-- Target Project --</option>
                {activeProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <button
            onClick={handleSpawn}
            disabled={!selectedCliId || !selectedProjectId}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-sky-500/10 hover:bg-sky-500/20 disabled:bg-[#16161a] disabled:text-zinc-600 text-sky-400 border border-sky-500/20 disabled:border-[#2d2d35] rounded font-bold uppercase text-[10px] tracking-wider transition-all cursor-pointer"
          >
            <Plus size={12} />
            Add to Grid
          </button>
        </div>
      )}
    </div>
  );
};
