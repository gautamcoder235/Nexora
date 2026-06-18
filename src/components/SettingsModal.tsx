import React, { useState } from 'react';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import { X, Save, RotateCcw, Monitor, Terminal, Zap, FileCode2, Package, Plus, Cpu, Keyboard } from 'lucide-react';
import { AppSettings, DEFAULT_APP_SETTINGS, CustomCLI } from '../types';
import { PluginRegistry } from '../plugins';
import { AgentPlugin } from '../plugins/types';
import { CliEditorCard } from './CliEditorCard';
import { AgentRegistryPanel } from './AgentRegistryPanel';

const ShortcutEditor = ({ label, value, onChange }: { label: string, value: string, onChange: (newVal: string) => void }) => {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }

    // Ignore bare modifiers
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    
    onChange(parts.join('+'));
    setRecording(false);
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-[#232329]/30">
      <span className="text-xs text-zinc-300 font-medium">{label}</span>
      <div 
        onClick={() => setRecording(true)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        onBlur={() => setRecording(false)}
        className={`flex gap-1.5 p-1 min-w-[100px] justify-end cursor-pointer outline-none rounded transition-all ${recording ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'hover:bg-white/5'}`}
        title="Click to record new shortcut"
      >
        {recording ? (
          <span className="text-[10px] text-emerald-400 italic px-2 py-1 animate-pulse">Recording... (Press Escape to cancel)</span>
        ) : (
          (value || 'None').split('+').map((k, i) => (
            <kbd key={i} className="px-2 py-1 text-[10px] font-mono text-zinc-400 bg-[#0f0f15] border border-[#232329] rounded shadow-sm">
              {k}
            </kbd>
          ))
        )}
      </div>
    </div>
  );
};

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, setSettingsModalOpen, settings, updateSettings, resetSettings } = useOrchestratorStore();
  
  // Local state for the form so we don't spam the store on every keystroke
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<'Appearance' | 'Terminal' | 'Shell' | 'CLIs' | 'Agent Registry' | 'Performance' | 'Shortcuts'>('Appearance');
  const [installedStatuses, setInstalledStatuses] = useState<Record<string, boolean>>({});
  const [isChecking, setIsChecking] = useState<Record<string, boolean>>({});

  if (!isSettingsModalOpen) return null;

  const handleSave = () => {
    updateSettings(localSettings);
    setSettingsModalOpen(false);
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all settings to defaults?")) {
      resetSettings();
      setLocalSettings(DEFAULT_APP_SETTINGS);
    }
  };

  const updateLocal = (key: keyof AppSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleAddCLI = () => {
    const newCLI: CustomCLI = {
      id: crypto.randomUUID(),
      name: 'New Custom CLI',
      command: '',
      args: [],
      rolePreset: 'custom',
      group: '',
      projectId: '',
      capabilities: { coding: true, testing: false, review: false, planning: false },
      startupInstructions: []
    };
    updateLocal('customCLIs', [...(localSettings.customCLIs || []), newCLI]);
  };

  const handleUpdateCLI = (id: string, field: keyof CustomCLI, value: any) => {
    const updated = (localSettings.customCLIs || []).map(cli => 
      cli.id === id ? { ...cli, [field]: value } : cli
    );
    updateLocal('customCLIs', updated);
  };

  const handleDeleteCLI = (id: string) => {
    updateLocal('customCLIs', (localSettings.customCLIs || []).filter(cli => cli.id !== id));
  };

  const handleOverridePredefined = (id: string, field: keyof AgentPlugin, value: any) => {
    const currentOverrides = localSettings.cliOverrides || {};
    const pluginOverrides = currentOverrides[id] || {};
    updateLocal('cliOverrides', {
      ...currentOverrides,
      [id]: { ...pluginOverrides, [field]: value }
    });
  };

  const checkCLI = async (id: string) => {
    setIsChecking(prev => ({ ...prev, [id]: true }));
    // Force a fresh check, bypass cache if any
    const isInstalled = await PluginRegistry.checkInstalled(id);
    setInstalledStatuses(prev => ({ ...prev, [id]: isInstalled }));
    setIsChecking(prev => ({ ...prev, [id]: false }));
  };

  const checkCustomCLI = async (cli: CustomCLI) => {
    const cmdToCheck = cli.checkCmd || cli.command;
    if (!cmdToCheck) return;
    setIsChecking(prev => ({ ...prev, [cli.id]: true }));
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const isInstalled = await invoke<boolean>("check_cli_tool", { command: cmdToCheck });
      setInstalledStatuses(prev => ({ ...prev, [cli.id]: isInstalled }));
    } catch (e) {
      setInstalledStatuses(prev => ({ ...prev, [cli.id]: false }));
    }
    setIsChecking(prev => ({ ...prev, [cli.id]: false }));
  };

  const handleInstall = (id: string) => {
    const plugin = PluginRegistry.get(id);
    if (!plugin.installHelp?.command) return;
    
    // Spawn terminal using default shell and execute install command as a startup instruction
    useOrchestratorStore.getState().spawnTerminal("", undefined, undefined, undefined, plugin.installHelp.command);
    setSettingsModalOpen(false);
  };

  const handleInstallCustom = (cli: CustomCLI) => {
    if (!cli.installCommand) return;
    useOrchestratorStore.getState().spawnTerminal("", undefined, undefined, undefined, cli.installCommand);
    setSettingsModalOpen(false);
  };

  const tabs = [
    { id: 'Appearance', icon: <Monitor size={16} />, label: 'Appearance' },
    { id: 'Terminal', icon: <Terminal size={16} />, label: 'Terminal' },
    { id: 'Shell', icon: <FileCode2 size={16} />, label: 'Shell' },
    { id: 'Agent Registry', icon: <Cpu size={16} />, label: 'Agent Registry' },
    { id: 'CLIs', icon: <Package size={16} />, label: 'Custom CLIs' },
    { id: 'Performance', icon: <Zap size={16} />, label: 'Performance' },
    { id: 'Shortcuts', icon: <Keyboard size={16} />, label: 'Shortcuts' }
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center">
      <div className="glass-modal glass-noise-base w-[800px] h-[600px] flex overflow-hidden">
        
        {/* Left Sidebar Tabs */}
        <div className="w-56 bg-[#0a0a0c]/60 border-r border-border-glass flex flex-col">
          <div className="p-4 border-b border-border-glass">
            <h2 className="text-zinc-200 font-semibold text-lg font-mono">Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors font-mono ${
                  activeTab === tab.id 
                    ? 'bg-accent-primary/10 text-accent-primary border-r-2 border-accent-primary font-semibold' 
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col relative bg-[#050507]/20">
          <button 
            onClick={() => setSettingsModalOpen(false)}
            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-350 transition-colors"
          >
            <X size={20} />
          </button>
          
          <div className="p-8 flex-1 overflow-y-auto space-y-8 font-mono">
            <h3 className="text-lg font-semibold text-zinc-200 tracking-wide uppercase">{activeTab} Settings</h3>

            {/* Appearance Settings */}
            {activeTab === 'Appearance' && (
              <div className="space-y-6 max-w-lg">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Terminal Font Family</label>
                  <select 
                    value={localSettings.fontFamily}
                    onChange={(e) => updateLocal('fontFamily', e.target.value)}
                    className="glass-input"
                  >
                    <option value="courier-new, courier, monospace" className="bg-[#0f0f15]">Default (Courier New)</option>
                    <option value="'Fira Code', monospace" className="bg-[#0f0f15]">Fira Code</option>
                    <option value="'JetBrains Mono', monospace" className="bg-[#0f0f15]">JetBrains Mono</option>
                    <option value="'Cascadia Code', monospace" className="bg-[#0f0f15]">Cascadia Code</option>
                    <option value="Consolas, monospace" className="bg-[#0f0f15]">Consolas</option>
                    <option value="Menlo, Monaco, Consolas, monospace" className="bg-[#0f0f15]">Menlo / Monaco</option>
                    <option value="ui-monospace, SFMono-Regular, monospace" className="bg-[#0f0f15]">SF Mono (Mac)</option>
                    <option value="'Ubuntu Mono', monospace" className="bg-[#0f0f15]">Ubuntu Mono</option>
                  </select>
                  <p className="text-[10px] text-zinc-500">Ensure the font is installed on your system.</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Terminal Font Size (px)</label>
                  <input 
                    type="number" 
                    min="8" max="48"
                    value={localSettings.fontSize}
                    onChange={(e) => updateLocal('fontSize', parseInt(e.target.value) || 14)}
                    className="glass-input"
                  />
                </div>
              </div>
            )}

            {/* Terminal Settings */}
            {activeTab === 'Terminal' && (
              <div className="space-y-6 max-w-lg">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Cursor Style</label>
                  <select 
                    value={localSettings.cursorStyle}
                    onChange={(e) => updateLocal('cursorStyle', e.target.value)}
                    className="glass-input"
                  >
                    <option value="block" className="bg-[#0f0f15]">Block</option>
                    <option value="underline" className="bg-[#0f0f15]">Underline</option>
                    <option value="bar" className="bg-[#0f0f15]">Bar</option>
                  </select>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[#232329]/30">
                  <div>
                    <label className="text-xs text-zinc-300 font-medium block">Cursor Blink</label>
                    <p className="text-[10px] text-zinc-500">Enable blinking cursor in terminals</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localSettings.cursorBlink}
                    onChange={(e) => updateLocal('cursorBlink', e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[#232329]/30">
                  <div>
                    <label className="text-xs text-zinc-300 font-medium block">Copy on Select</label>
                    <p className="text-[10px] text-zinc-500">Automatically copy text to clipboard when selected</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localSettings.copyOnSelect}
                    onChange={(e) => updateLocal('copyOnSelect', e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Shell Settings */}
            {activeTab === 'Shell' && (
              <div className="space-y-6 max-w-lg">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Default Shell</label>
                  <select 
                    value={localSettings.defaultShell}
                    onChange={(e) => updateLocal('defaultShell', e.target.value)}
                    className="glass-input"
                  >
                    <option value="auto" className="bg-[#0f0f15]">Auto-detect (Recommended)</option>
                    <option value="bash" className="bg-[#0f0f15]">bash</option>
                    <option value="zsh" className="bg-[#0f0f15]">zsh</option>
                    <option value="powershell" className="bg-[#0f0f15]">powershell</option>
                    <option value="cmd" className="bg-[#0f0f15]">cmd.exe</option>
                  </select>
                  <p className="text-[10px] text-zinc-500">The shell to execute when spawning new agents or terminals.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Shell Arguments</label>
                  <input 
                    type="text" 
                    value={localSettings.shellArgs.join(' ')}
                    onChange={(e) => updateLocal('shellArgs', e.target.value.split(' ').filter(Boolean))}
                    className="glass-input"
                    placeholder="e.g. -c or --login"
                  />
                  <p className="text-[10px] text-zinc-500">Space-separated arguments passed to the shell.</p>
                </div>
              </div>
            )}

            {/* Agent Registry Panel (SQLite Backed) */}
            {activeTab === 'Agent Registry' && (
              <div className="space-y-6">
                <AgentRegistryPanel />
              </div>
            )}

            {/* Custom CLIs Settings */}
            {activeTab === 'CLIs' && (
              <div className="space-y-8 max-w-2xl">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm text-zinc-300 font-semibold uppercase tracking-wider">Custom CLIs</h4>
                      <p className="text-[10px] text-zinc-500">Define custom command line tools you want to spawn easily.</p>
                    </div>
                    <button 
                      onClick={handleAddCLI}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded transition-colors border border-accent-primary/20 cursor-pointer"
                    >
                      <Plus size={14} /> Add CLI
                    </button>
                  </div>
                
                  <div className="space-y-4">
                    {!(localSettings.customCLIs?.length) ? (
                      <div className="text-center py-8 bg-[#09090b]/80 border border-border-glass border-dashed rounded text-xs text-zinc-500 font-mono">
                        No custom CLIs registered yet.
                      </div>
                    ) : (
                      localSettings.customCLIs.map(cli => {
                        const normalized = {
                          ...cli,
                          cliCommand: cli.command,
                          defaultArgs: cli.args
                        };
                        return (
                          <CliEditorCard
                            key={cli.id}
                            cli={normalized}
                            isCustom={true}
                            isInstalled={installedStatuses[cli.id]}
                            checking={isChecking[cli.id]}
                            installHelp={!!cli.installCommand}
                            onUpdate={(field, value) => {
                               let targetField = field;
                               if (field === 'cliCommand') targetField = 'command';
                               if (field === 'defaultArgs') targetField = 'args';
                               handleUpdateCLI(cli.id, targetField as any, value);
                            }}
                            onDelete={() => handleDeleteCLI(cli.id)}
                            onCheck={() => checkCustomCLI(cli)}
                            onInstall={cli.installCommand ? () => handleInstallCustom(cli) : undefined}
                          />
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Predefined CLIs */}
                <div className="pt-4 border-t border-border-glass space-y-4">
                  <div>
                    <h4 className="text-sm text-zinc-300 font-semibold uppercase tracking-wider">Predefined Agents</h4>
                    <p className="text-[10px] text-zinc-500">Built-in CLI agents. You can override their default properties here.</p>
                  </div>
                  
                  <div className="space-y-4">
                    {PluginRegistry.getAll().filter(p => p.id !== 'generic').map(plugin => {
                      const overrides = localSettings.cliOverrides?.[plugin.id] || {};
                      
                      const effectivePlugin = {
                        ...plugin,
                        ...overrides,
                        cliCommand: overrides.cliCommand !== undefined ? overrides.cliCommand : plugin.cliCommand,
                        defaultArgs: overrides.defaultArgs !== undefined ? overrides.defaultArgs : plugin.defaultArgs,
                      };

                      return (
                        <CliEditorCard
                           key={plugin.id}
                           cli={effectivePlugin}
                           isCustom={false}
                           isInstalled={installedStatuses[plugin.id]}
                           checking={isChecking[plugin.id]}
                           installHelp={!!plugin.installHelp}
                           onUpdate={(field, value) => handleOverridePredefined(plugin.id, field as any, value)}
                           onCheck={() => checkCLI(plugin.id)}
                           onInstall={() => handleInstall(plugin.id)}
                        />
                      );
                    })}
                  </div>
                </div>
            </div>
            )}
            {/* Performance Settings */}
            {activeTab === 'Performance' && (
              <div className="space-y-6 max-w-lg">
                <div className="flex items-center justify-between py-1 border-b border-[#232329]/30">
                  <div>
                    <label className="text-xs text-zinc-300 font-medium block">Hardware Acceleration (WebGL)</label>
                    <p className="text-[10px] text-zinc-500">Significantly improves terminal rendering FPS. Turn off if you experience visual glitches.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localSettings.hardwareAcceleration}
                    onChange={(e) => updateLocal('hardwareAcceleration', e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Terminal Scrollback Limit (Lines)</label>
                  <input 
                    type="number" 
                    min="1000" max="1000000" step="1000"
                    value={localSettings.terminalScrollbackLimit}
                    onChange={(e) => updateLocal('terminalScrollbackLimit', parseInt(e.target.value) || 50000)}
                    className="glass-input"
                  />
                  <p className="text-[10px] text-zinc-500">Maximum number of lines kept in memory per terminal. Higher values use more RAM.</p>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Background Workspace Idle Suspend (Minutes)</label>
                  <input 
                    type="number" 
                    min="0" max="1440" step="5"
                    value={localSettings.backgroundWorkspaceSuspendMinutes ?? 0}
                    onChange={(e) => updateLocal('backgroundWorkspaceSuspendMinutes', parseInt(e.target.value) || 0)}
                    className="glass-input"
                  />
                  <p className="text-[10px] text-zinc-500">Time in minutes before inactive workspaces auto-suspend terminals to save memory/CPU. Set to 0 to never suspend.</p>
                </div>
              </div>
            )}

            {/* Shortcuts Settings */}
            {activeTab === 'Shortcuts' && (
              <div className="space-y-6 max-w-lg">
                <div>
                  <h4 className="text-sm text-zinc-300 font-semibold uppercase tracking-wider mb-1">Global Shortcuts</h4>
                  <p className="text-[10px] text-zinc-500 mb-6">Keyboard shortcuts for quick navigation and actions.</p>
                </div>

                <div className="space-y-2">
                  <ShortcutEditor 
                    label="Toggle Sidebar (Agent Panel)" 
                    value={localSettings.shortcuts?.toggleSidebar || ''}
                    onChange={(val) => updateLocal('shortcuts', { ...localSettings.shortcuts, toggleSidebar: val })}
                  />
                  <ShortcutEditor 
                    label="Toggle Task Center" 
                    value={localSettings.shortcuts?.toggleTaskCenter || ''}
                    onChange={(val) => updateLocal('shortcuts', { ...localSettings.shortcuts, toggleTaskCenter: val })}
                  />
                  <ShortcutEditor 
                    label="Toggle Add Agent Menu" 
                    value={localSettings.shortcuts?.toggleAddAgent || ''}
                    onChange={(val) => updateLocal('shortcuts', { ...localSettings.shortcuts, toggleAddAgent: val })}
                  />
                   <ShortcutEditor 
                    label="Open Settings" 
                    value={localSettings.shortcuts?.openSettings || ''}
                    onChange={(val) => updateLocal('shortcuts', { ...localSettings.shortcuts, openSettings: val })}
                  />
                  <ShortcutEditor 
                    label="Toggle Web Browser" 
                    value={localSettings.shortcuts?.toggleBrowser || ''}
                    onChange={(val) => updateLocal('shortcuts', { ...localSettings.shortcuts, toggleBrowser: val })}
                  />
                  <ShortcutEditor 
                    label="Toggle Agent Review Center" 
                    value={localSettings.shortcuts?.toggleReviewCenter || ''}
                    onChange={(val) => updateLocal('shortcuts', { ...localSettings.shortcuts, toggleReviewCenter: val })}
                  />
                  
                  <div className="pt-4 mt-4 text-[10px] text-zinc-500 italic">
                    Note: On macOS, use <kbd className="px-1 bg-[#0f0f15] rounded border border-[#232329]">Cmd (⌘)</kbd> instead of Ctrl.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-border-glass bg-[#0c0c0e]/50 flex items-center justify-between select-none">
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-rose-400 transition-colors font-semibold cursor-pointer"
            >
              <RotateCcw size={14} />
              Reset Defaults
            </button>
            <div className="flex gap-2.5">
              <button 
                onClick={() => setSettingsModalOpen(false)}
                className="glass-button glass-button--ghost py-1.5 px-5 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="glass-button glass-button--primary py-1.5 px-5 cursor-pointer"
              >
                <Save size={14} />
                Save Changes
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
