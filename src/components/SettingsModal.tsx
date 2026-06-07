import React, { useState } from 'react';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import { X, Save, RotateCcw, Monitor, Terminal, Zap, FileCode2, Package, Plus } from 'lucide-react';
import { AppSettings, DEFAULT_APP_SETTINGS, CustomCLI } from '../types';
import { PluginRegistry } from '../plugins';
import { AgentPlugin } from '../plugins/types';
import { CliEditorCard } from './CliEditorCard';

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, setSettingsModalOpen, settings, updateSettings, resetSettings } = useOrchestratorStore();
  
  // Local state for the form so we don't spam the store on every keystroke
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<'Appearance' | 'Terminal' | 'Shell' | 'CLIs' | 'Performance'>('Appearance');
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
      const isInstalled = await invoke<boolean>("check_command_exists", { cmd: cmdToCheck });
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
    { id: 'CLIs', icon: <Package size={16} />, label: 'Custom CLIs' },
    { id: 'Performance', icon: <Zap size={16} />, label: 'Performance' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center">
      <div className="bg-[#0f0f13] border border-[#232329] rounded-xl shadow-2xl w-[800px] h-[600px] flex overflow-hidden">
        
        {/* Left Sidebar Tabs */}
        <div className="w-56 bg-[#0a0a0c] border-r border-[#232329] flex flex-col">
          <div className="p-4 border-b border-[#232329]">
            <h2 className="text-zinc-200 font-semibold text-lg">Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  activeTab === tab.id 
                    ? 'bg-sky-500/10 text-sky-400 border-r-2 border-sky-400' 
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
        <div className="flex-1 flex flex-col relative">
          <button 
            onClick={() => setSettingsModalOpen(false)}
            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={20} />
          </button>
          
          <div className="p-8 flex-1 overflow-y-auto space-y-8">
            <h3 className="text-xl font-medium text-zinc-100">{activeTab} Settings</h3>

            {/* Appearance Settings */}
            {activeTab === 'Appearance' && (
              <div className="space-y-6 max-w-lg">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Terminal Font Family</label>
                  <select 
                    value={localSettings.fontFamily}
                    onChange={(e) => updateLocal('fontFamily', e.target.value)}
                    className="w-full bg-[#16161a] border border-[#2d2d35] rounded p-2 text-sm text-zinc-200 focus:border-sky-500 outline-none"
                  >
                    <option value="courier-new, courier, monospace">Default (Courier New)</option>
                    <option value="'Fira Code', monospace">Fira Code</option>
                    <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                    <option value="'Cascadia Code', monospace">Cascadia Code</option>
                    <option value="Consolas, monospace">Consolas</option>
                    <option value="Menlo, Monaco, Consolas, monospace">Menlo / Monaco</option>
                    <option value="ui-monospace, SFMono-Regular, monospace">SF Mono (Mac)</option>
                    <option value="'Ubuntu Mono', monospace">Ubuntu Mono</option>
                  </select>
                  <p className="text-xs text-zinc-500">Ensure the font is installed on your system.</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Terminal Font Size (px)</label>
                  <input 
                    type="number" 
                    min="8" max="48"
                    value={localSettings.fontSize}
                    onChange={(e) => updateLocal('fontSize', parseInt(e.target.value) || 14)}
                    className="w-full bg-[#16161a] border border-[#2d2d35] rounded p-2 text-sm text-zinc-200 focus:border-sky-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Terminal Settings */}
            {activeTab === 'Terminal' && (
              <div className="space-y-6 max-w-lg">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Cursor Style</label>
                  <select 
                    value={localSettings.cursorStyle}
                    onChange={(e) => updateLocal('cursorStyle', e.target.value)}
                    className="w-full bg-[#16161a] border border-[#2d2d35] rounded p-2 text-sm text-zinc-200 focus:border-sky-500 outline-none"
                  >
                    <option value="block">Block</option>
                    <option value="underline">Underline</option>
                    <option value="bar">Bar</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-zinc-300 font-medium block">Cursor Blink</label>
                    <p className="text-xs text-zinc-500">Enable blinking cursor in terminals</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localSettings.cursorBlink}
                    onChange={(e) => updateLocal('cursorBlink', e.target.checked)}
                    className="w-4 h-4 rounded accent-sky-500"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-zinc-300 font-medium block">Copy on Select</label>
                    <p className="text-xs text-zinc-500">Automatically copy text to clipboard when selected</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localSettings.copyOnSelect}
                    onChange={(e) => updateLocal('copyOnSelect', e.target.checked)}
                    className="w-4 h-4 rounded accent-sky-500"
                  />
                </div>
              </div>
            )}

            {/* Shell Settings */}
            {activeTab === 'Shell' && (
              <div className="space-y-6 max-w-lg">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Default Shell</label>
                  <select 
                    value={localSettings.defaultShell}
                    onChange={(e) => updateLocal('defaultShell', e.target.value)}
                    className="w-full bg-[#16161a] border border-[#2d2d35] rounded p-2 text-sm text-zinc-200 focus:border-sky-500 outline-none"
                  >
                    <option value="auto">Auto-detect (Recommended)</option>
                    <option value="bash">bash</option>
                    <option value="zsh">zsh</option>
                    <option value="powershell">powershell</option>
                    <option value="cmd">cmd.exe</option>
                  </select>
                  <p className="text-xs text-zinc-500">The shell to execute when spawning new agents or terminals.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Shell Arguments</label>
                  <input 
                    type="text" 
                    value={localSettings.shellArgs.join(' ')}
                    onChange={(e) => updateLocal('shellArgs', e.target.value.split(' ').filter(Boolean))}
                    className="w-full bg-[#16161a] border border-[#2d2d35] rounded p-2 text-sm text-zinc-200 focus:border-sky-500 outline-none"
                    placeholder="e.g. -c or --login"
                  />
                  <p className="text-xs text-zinc-500">Space-separated arguments passed to the shell.</p>
                </div>
              </div>
            )}

            {/* Custom CLIs Settings */}
            {activeTab === 'CLIs' && (
              <div className="space-y-8 max-w-2xl">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm text-zinc-300 font-medium">Custom CLIs</h4>
                      <p className="text-xs text-zinc-500">Define custom command line tools you want to spawn easily.</p>
                    </div>
                    <button 
                      onClick={handleAddCLI}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 rounded transition-colors"
                    >
                      <Plus size={14} /> Add CLI
                    </button>
                  </div>
                
                  <div className="space-y-4">
                    {!(localSettings.customCLIs?.length) ? (
                      <div className="text-center py-8 bg-[#16161a] border border-[#2d2d35] border-dashed rounded text-sm text-zinc-500">
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
                <div className="pt-4 border-t border-[#232329] space-y-4">
                  <div>
                    <h4 className="text-sm text-zinc-300 font-medium">Predefined Agents</h4>
                    <p className="text-xs text-zinc-500">Built-in CLI agents. You can override their default properties here.</p>
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
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-zinc-300 font-medium block">Hardware Acceleration (WebGL)</label>
                    <p className="text-xs text-zinc-500">Significantly improves terminal rendering FPS. Turn off if you experience visual glitches.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localSettings.hardwareAcceleration}
                    onChange={(e) => updateLocal('hardwareAcceleration', e.target.checked)}
                    className="w-4 h-4 rounded accent-sky-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Terminal Scrollback Limit (Lines)</label>
                  <input 
                    type="number" 
                    min="1000" max="1000000" step="1000"
                    value={localSettings.terminalScrollbackLimit}
                    onChange={(e) => updateLocal('terminalScrollbackLimit', parseInt(e.target.value) || 50000)}
                    className="w-full bg-[#16161a] border border-[#2d2d35] rounded p-2 text-sm text-zinc-200 focus:border-sky-500 outline-none"
                  />
                  <p className="text-xs text-zinc-500">Maximum number of lines kept in memory per terminal. Higher values use more RAM.</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-[#232329] bg-[#0c0c0e] flex items-center justify-between">
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-rose-400 transition-colors"
            >
              <RotateCcw size={14} />
              Reset Defaults
            </button>
            <div className="flex gap-3">
              <button 
                onClick={() => setSettingsModalOpen(false)}
                className="px-6 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-400 rounded shadow-md transition-colors"
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
