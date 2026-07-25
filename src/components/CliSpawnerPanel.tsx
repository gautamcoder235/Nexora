import React, { useState, useEffect, useRef } from 'react';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import { PluginRegistry } from '../plugins';
import { Plus, Terminal, PanelLeft, PanelLeftClose, ChevronDown, Check } from 'lucide-react';
import { AgentCapabilities } from '../types';

interface CustomSelectProps {
  label: string;
  placeholder: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ label, placeholder, value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-1 relative" ref={containerRef}>
      <label className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold ml-0.5 select-none">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-[11px] font-medium rounded-md py-2 px-2.5 outline-none cursor-pointer flex items-center justify-between transition-all border ${
          isOpen
            ? 'bg-[var(--bg-secondary)] border-[var(--accent-primary)]/50 text-[var(--text-primary)] shadow-[0_0_12px_rgba(var(--accent-primary-rgb),0.15)]'
            : 'bg-[var(--bg-tertiary)]/40 border-[var(--border-glass)] text-[var(--text-primary)] hover:border-[var(--border-glass-hover)] hover:bg-[var(--bg-tertiary)]/60'
        }`}
      >
        <span className={selectedOption ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-muted)]'}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <ChevronDown size={12} className={`text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180 text-[var(--accent-primary)]' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-[#141419]/95 backdrop-blur-2xl border border-[var(--border-glass)] rounded-lg shadow-2xl py-1 max-h-[180px] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
          <div
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            className="px-2.5 py-1.5 text-[10.5px] text-[var(--text-muted)] hover:bg-[var(--border-glass)] cursor-pointer flex items-center justify-between transition-colors select-none"
          >
            <span>{placeholder}</span>
            {!value && <Check size={11} className="text-[var(--accent-primary)]" />}
          </div>
          {options.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <div
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                className={`px-2.5 py-1.5 text-[10.5px] cursor-pointer flex items-center justify-between transition-colors font-medium select-none ${
                  isSelected
                    ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass)]'
                }`}
              >
                <span>{opt.name}</span>
                {isSelected && <Check size={11} className="text-[var(--accent-primary)] shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

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
  const isAgentPanelPinned = useOrchestratorStore(s => s.isAgentPanelPinned);
  const setAgentPanelPinned = useOrchestratorStore(s => s.setAgentPanelPinned);
  const terminals = useOrchestratorStore(s => s.terminals);

  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);

  // Combine custom CLIs and predefined CLIs without duplicating IDs
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

  // De-duplicate CLIs list by id, prioritizing predefined ones
  const allCLIsMap = new Map<string, typeof predefinedCLIs[number]>();
  predefinedCLIs.forEach(cli => allCLIsMap.set(cli.id, cli));
  customCLIs.forEach(cli => {
    if (!allCLIsMap.has(cli.id)) {
      allCLIsMap.set(cli.id, cli);
    }
  });
  const allCLIs = Array.from(allCLIsMap.values());

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

    setIsExpanded(false);
  };

  return (
    <div className="relative z-30 flex-shrink-0 flex flex-col">
      {/* Header Row */}
      <div className="w-full flex items-center justify-between py-1.5 px-2.5 glass-panel bg-[var(--bg-tertiary)]/40 border-b border-[var(--border-glass)] gap-3 h-[34px] relative z-20">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)] font-mono flex items-center gap-1.5 select-none shrink-0">
          <Terminal size={11} className="text-[var(--accent-primary)] animate-pulse" />
          CLI Agent Swarm
        </h2>
        
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider h-[24px] px-2 rounded-md transition-all duration-300 ${
              isExpanded 
                ? 'bg-[var(--bg-secondary)] border border-[var(--border-glass)] text-[var(--text-secondary)] hover:bg-[var(--border-glass-hover)]' 
                : 'bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/25 cursor-pointer'
            }`}
          >
            {isExpanded ? 'Cancel' : <><Plus size={10} /> New Agent</>}
          </button>
          
          <button
            onClick={() => {
              if (terminals.length <= 8) setAgentPanelPinned(!isAgentPanelPinned);
            }}
            className={`h-[24px] w-[24px] rounded-md border transition-all cursor-pointer flex items-center justify-center ${
              terminals.length > 8 
                ? 'opacity-40 cursor-not-allowed border-transparent text-[var(--text-muted)]' 
                : isAgentPanelPinned 
                  ? 'bg-[var(--accent-primary)]/15 border-[var(--accent-primary)]/30 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/25' 
                  : 'bg-[var(--bg-tertiary)]/40 border-[var(--border-glass)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass-hover)]'
            }`}
            title={terminals.length > 8 ? "Docking disabled (> 8 terminals)" : isAgentPanelPinned ? "Undock / Float Panel" : "Dock Panel"}
          >
            {isAgentPanelPinned ? <PanelLeftClose size={12} /> : <PanelLeft size={12} />}
          </button>
        </div>
      </div>

      {/* Expanded Spawn Form (Floating Menu) */}
      <div 
        className={`!absolute top-[38px] left-0 right-0 z-10 w-full flex flex-col gap-2.5 p-3 glass-panel-elevated bg-[#0a0a0f]/95 backdrop-blur-2xl shadow-2xl border border-[var(--border-glass)] rounded-xl transition-all duration-300 ease-in-out origin-top ${
          isExpanded ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-2 invisible pointer-events-none'
        }`}
      >
        <CustomSelect
          label="Agent Type"
          placeholder="-- Choose CLI Engine --"
          value={selectedCliId}
          options={allCLIs.map(cli => ({ id: cli.id, name: cli.name }))}
          onChange={setSelectedCliId}
        />
        
        <CustomSelect
          label="Target Project"
          placeholder="-- Select Workspace Project --"
          value={selectedProjectId}
          options={activeProjects.map(p => ({ id: p.id, name: p.name }))}
          onChange={setSelectedProjectId}
        />

        <button
          onClick={() => {
            handleSpawn();
          }}
          disabled={!selectedCliId || !selectedProjectId}
          className="mt-2 glass-button glass-button--accent w-full h-[34px] !text-[10px] uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus size={12} className="stroke-[2.5px]" /> Add Agent to Swarm
        </button>
      </div>
    </div>
  );
};
