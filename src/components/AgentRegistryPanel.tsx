import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cpu, Power, PowerOff } from 'lucide-react';

export interface DbAgent {
  id: string;
  name: string;
  command: string;
  version: string | null;
  enabled: boolean;
  capabilities: string[];
}

export const AgentRegistryPanel: React.FC = () => {
  const [agents, setAgents] = useState<DbAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAgents = async () => {
    try {
      setIsLoading(true);
      const dbAgents = await invoke<DbAgent[]>('get_all_agents');
      setAgents(dbAgents);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const toggleAgent = async (id: string, currentlyEnabled: boolean) => {
    try {
      await invoke('update_agent_status', { id, enabled: !currentlyEnabled });
      await fetchAgents();
    } catch (error) {
      console.error("Failed to toggle agent:", error);
    }
  };

  if (isLoading) {
    return <div className="text-zinc-400 p-4 animate-pulse">Loading Agents...</div>;
  }

  return (
    <div className="flex flex-col gap-4 font-mono">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
          <Cpu className="text-accent-primary" size={16} />
          Local Agent Registry
        </h3>
        <button 
          onClick={fetchAgents}
          className="text-xs text-zinc-500 hover:text-zinc-350 cursor-pointer font-semibold"
        >
          Refresh DB
        </button>
      </div>
      
      <p className="text-xs text-zinc-400">
        These agents are sourced directly from the <code className="text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded font-mono">swarm.db</code> SQLite database.
      </p>
 
      <div className="grid gap-3">
        {agents.map(agent => (
          <div 
            key={agent.id} 
            className={`border rounded-md p-3.5 flex items-start justify-between transition-colors ${
              agent.enabled 
                ? 'border-accent-primary/30 bg-[#09090b]' 
                : 'border-border-glass bg-[#09090b]/55 opacity-60'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-xs ${agent.enabled ? 'text-zinc-200' : 'text-zinc-400'}`}>{agent.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">({agent.id})</span>
              </div>
              <div className="text-[10px] text-zinc-450 mt-1.5">
                Command: <code className="text-zinc-300 bg-black/30 px-1 py-0.5 rounded">{agent.command}</code>
              </div>
              <div className="flex flex-wrap gap-1 mt-2.5">
                {agent.capabilities.map(cap => (
                  <span key={cap} className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[9px] text-zinc-400 uppercase tracking-wide">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
            
            <button
              onClick={() => toggleAgent(agent.id, agent.enabled)}
              className={`p-1.5 rounded transition-colors cursor-pointer border ${
                agent.enabled 
                  ? 'bg-rose-500/10 border-rose-500/25 text-rose-450 hover:bg-rose-500/20' 
                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20'
              }`}
              title={agent.enabled ? "Disable Agent" : "Enable Agent"}
            >
              {agent.enabled ? <PowerOff size={13} /> : <Power size={13} />}
            </button>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="text-xs text-zinc-500 text-center py-6 border border-dashed border-border-glass rounded-md font-mono">
            No agents found in SQLite database.
          </div>
        )}
      </div>
    </div>
  );
};
