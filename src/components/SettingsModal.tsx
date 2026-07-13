import React, { useState, useMemo } from 'react';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import { 
  X, Save, RotateCcw, Monitor, Terminal, Zap, FileCode2, Package, Plus, Cpu, Keyboard, 
  Palette, Pipette, Type, Layers, Eye, ShieldAlert, Accessibility, SplitSquareVertical, 
  ArrowLeftRight, Download, Upload, Search, AlertTriangle, Check, RefreshCw, ChevronDown, ChevronRight
} from 'lucide-react';
import { AppSettings, DEFAULT_APP_SETTINGS, CustomCLI } from '../types';
import { deepMerge } from '../utils/object';
import { PluginRegistry } from '../plugins';
import { AgentPlugin } from '../plugins/types';
import { CliEditorCard } from './CliEditorCard';
import { AgentRegistryPanel } from './AgentRegistryPanel';
import { APPEARANCE_PRESETS, AppearancePreset } from '../services/presets';
import { themeRegistry } from '../services/ThemeDefinitions';

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

interface SearchableOption {
  id: string;
  name: string;
  description: string;
  category: string;
  breadcrumbs: string[];
}

const searchableOptions: SearchableOption[] = [
  // General -> Shell
  { id: 'shell-default', name: 'Default Shell', description: 'Default system shell to use for terminal sessions', category: 'shell', breadcrumbs: ['General', 'Shell', 'Default Shell'] },
  { id: 'shell-args', name: 'Shell Arguments', description: 'Arguments passed to the shell executable', category: 'shell', breadcrumbs: ['General', 'Shell', 'Shell Arguments'] },
  // General -> CLIs
  { id: 'clis-custom', name: 'Custom CLIs', description: 'Registered custom CLI commands for agents', category: 'clis', breadcrumbs: ['General', 'Custom CLIs', 'Manage Custom CLIs'] },
  { id: 'clis-predefined', name: 'Predefined Agents Overrides', description: 'Overridden arguments/commands for built-in agent CLI plugins', category: 'clis', breadcrumbs: ['General', 'Custom CLIs', 'Predefined Agent Overrides'] },
  // General -> Registry
  { id: 'registry-db', name: 'Agent Registry SQLite DB', description: 'Sourced agents database registry overview', category: 'registry', breadcrumbs: ['General', 'Agent Registry', 'Registry Swarm Database'] },
  // General -> Performance
  { id: 'perf-gpu', name: 'Hardware Acceleration (WebGL)', description: 'Boost terminal rendering framerate using GPU WebGL', category: 'performance', breadcrumbs: ['General', 'Performance', 'WebGL Acceleration'] },
  { id: 'perf-scrollback', name: 'Terminal Scrollback Limit', description: 'Maximum terminal buffer line limit kept in memory', category: 'performance', breadcrumbs: ['General', 'Performance', 'Scrollback Limit'] },
  { id: 'perf-suspend', name: 'Workspace Idle Suspend', description: 'Inactivity threshold in minutes before workspaces suspend', category: 'performance', breadcrumbs: ['General', 'Performance', 'Workspace Idle Suspend'] },
  // General -> Shortcuts
  { id: 'shortcuts-global', name: 'Keyboard Shortcuts', description: 'Configure application-wide trigger shortcuts', category: 'shortcuts', breadcrumbs: ['General', 'Shortcuts', 'Global Shortcuts'] },
  // General -> Profiles
  { id: 'profiles-imp-exp', name: 'Import/Export Profile String', description: 'Backup, restore, and transfer Settings profiles in JSON format', category: 'profiles', breadcrumbs: ['General', 'Backup & Profiles', 'JSON Profile Share'] },

  // Appearance -> Theme
  { id: 'theme-select', name: 'Visual Theme', description: 'Base application color palette theme', category: 'theme', breadcrumbs: ['Appearance', 'Themes & Presets', 'Theme selection'] },
  { id: 'theme-presets', name: 'One-Click Presets', description: 'Preconfigured combinations of visual settings (Cursor, Warp, etc.)', category: 'theme', breadcrumbs: ['Appearance', 'Themes & Presets', 'Preset configs'] },
  { id: 'theme-mode', name: 'Theme Mode', description: 'System or Dark interface modes', category: 'theme', breadcrumbs: ['Appearance', 'Themes & Presets', 'System/Dark Mode'] },
  { id: 'theme-transparency', name: 'Background Opacity / Transparency', description: 'Glassmorphic panel transparency slider', category: 'theme', breadcrumbs: ['Appearance', 'Themes & Presets', 'Transparency'] },
  { id: 'theme-blur', name: 'Glass Blur Level', description: 'Backdrop blur depth for glassmorphic elements', category: 'theme', breadcrumbs: ['Appearance', 'Themes & Presets', 'Glass Blur'] },
  { id: 'theme-animations', name: 'Animations Level', description: 'Interface transition speed and effects depth', category: 'theme', breadcrumbs: ['Appearance', 'Themes & Presets', 'Interface Transitions'] },
  { id: 'theme-corners', name: 'Corner Rounding', description: 'Border radius corner style across components', category: 'theme', breadcrumbs: ['Appearance', 'Themes & Presets', 'Corner Radius'] },

  // Appearance -> Colors
  { id: 'color-accent', name: 'Color Accent Picker', description: 'Theme highlight accent color selection', category: 'colors', breadcrumbs: ['Appearance', 'Color Accent', 'Accent Palette'] },
  { id: 'color-custom-hex', name: 'Custom Accent Hex Code', description: 'Input a custom color hex code', category: 'colors', breadcrumbs: ['Appearance', 'Color Accent', 'Hex input'] },

  // Appearance -> Typography
  { id: 'typo-ui-font', name: 'UI Font Family', description: 'Main application user interface font', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'UI Font Family'] },
  { id: 'typo-ui-size', name: 'UI Font Size', description: 'Font size in pixels for general UI elements', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'UI Font Size'] },
  { id: 'typo-lineheight', name: 'UI Line Height', description: 'Text line spacing multiplier', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'UI Line Height'] },
  { id: 'typo-weight', name: 'UI Font Weight', description: 'Default text font weight thickness', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'UI Font Weight'] },
  { id: 'typo-code-font', name: 'Code Font Family', description: 'Monospace font for editor displays', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'Code Font Family'] },
  { id: 'typo-code-size', name: 'Code Font Size', description: 'Font size in pixels for code editor text', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'Code Font Size'] },
  { id: 'typo-term-font', name: 'Terminal Font Family', description: 'Monospace font family used in terminal shells', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'Terminal Font Family'] },
  { id: 'typo-term-size', name: 'Terminal Font Size', description: 'Font size in pixels for terminal texts', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'Terminal Font Size'] },
  { id: 'typo-spacing', name: 'Code Letter Spacing', description: 'Letter spacing offset for monospace text', category: 'typography', breadcrumbs: ['Appearance', 'Typography', 'Letter Spacing'] },

  // Appearance -> Workspace
  { id: 'work-git', name: 'Show Git Branch', description: 'Toggle git branch indicators in status bar', category: 'workspace', breadcrumbs: ['Appearance', 'Workspace View', 'Show Git Branch'] },
  { id: 'work-minimap', name: 'Show Minimap', description: 'Toggle file minimap inside editors', category: 'workspace', breadcrumbs: ['Appearance', 'Workspace View', 'Minimap'] },
  { id: 'work-sidebar-pos', name: 'Sidebar Docking Position', description: 'Align main agent panel on the left or right side', category: 'workspace', breadcrumbs: ['Appearance', 'Workspace View', 'Sidebar Position'] },
  { id: 'work-spacing', name: 'Pane Spacing Gap', description: 'Margin spacing gap in pixels between workroom panels', category: 'workspace', breadcrumbs: ['Appearance', 'Workspace View', 'Pane Spacing'] },
  { id: 'work-actbar', name: 'Show Activity Bar', description: 'Toggle left side activity bar visibility', category: 'workspace', breadcrumbs: ['Appearance', 'Workspace View', 'Show Activity Bar'] },
  { id: 'work-statusbar', name: 'Show Status Bar', description: 'Toggle bottom status bar visibility', category: 'workspace', breadcrumbs: ['Appearance', 'Workspace View', 'Show Status Bar'] },

  // Appearance -> Terminal
  { id: 'term-cursor', name: 'Cursor Style', description: 'Terminal cursor shape (Block, Underline, Bar)', category: 'terminal', breadcrumbs: ['Appearance', 'Terminal Style', 'Cursor Style'] },
  { id: 'term-blink', name: 'Cursor Blink', description: 'Toggle cursor blinking animation inside terminal panels', category: 'terminal', breadcrumbs: ['Appearance', 'Terminal Style', 'Cursor Blink'] },
  { id: 'term-copy', name: 'Copy on Select', description: 'Enable automatic copy to clipboard on highlighting text', category: 'terminal', breadcrumbs: ['Appearance', 'Terminal Style', 'Copy on Select'] },
  { id: 'term-bell', name: 'Terminal Bell Style', description: 'Audible or visual bell notification on system alert', category: 'terminal', breadcrumbs: ['Appearance', 'Terminal Style', 'Terminal Bell'] },

  // Appearance -> Agents
  { id: 'agent-avatar', name: 'Agent Avatar Style', description: 'Render agent profiles as Initials, Icons, or Identicons', category: 'agents', breadcrumbs: ['Appearance', 'Agent Cards', 'Avatar Style'] },
  { id: 'agent-badge', name: 'Show Status Badge', description: 'Overlay active color indicator for agent running state', category: 'agents', breadcrumbs: ['Appearance', 'Agent Cards', 'Status Badge'] },
  { id: 'agent-anim', name: 'Animate Transitions', description: 'Enable smooth scale transitions in agent grids', category: 'agents', breadcrumbs: ['Appearance', 'Agent Cards', 'Animate transitions'] },
  { id: 'agent-compact', name: 'Compact Cards', description: 'Reduce agent card vertical padding and elements', category: 'agents', breadcrumbs: ['Appearance', 'Agent Cards', 'Compact Cards'] },

  // Appearance -> Accessibility
  { id: 'acc-reader', name: 'Screen Reader Support', description: 'Enhance aria labels and accessibility tags for screen readers', category: 'accessibility', breadcrumbs: ['Appearance', 'Accessibility', 'Screen Reader Mode'] },
  { id: 'acc-contrast', name: 'High Contrast Theme', description: 'Force extreme contrast interface variables', category: 'accessibility', breadcrumbs: ['Appearance', 'Accessibility', 'High Contrast Mode'] },
  { id: 'acc-motion', name: 'Reduced Motion', description: 'Disable heavy animations and sliding transitions', category: 'accessibility', breadcrumbs: ['Appearance', 'Accessibility', 'Reduced Motion'] },
  { id: 'acc-increase-contrast', name: 'Increase Contrast', description: 'Optimize readability ratios by darkening borders and text contrast', category: 'accessibility', breadcrumbs: ['Appearance', 'Accessibility', 'Increase Contrast'] },
  { id: 'acc-bell', name: 'Accessible Terminal Bell', description: 'Trigger visual flashes on system bell alerts', category: 'accessibility', breadcrumbs: ['Appearance', 'Accessibility', 'Accessible Bell'] },

  // Appearance -> Layout
  { id: 'layout-mode', name: 'Pane Layout Mode', description: 'Default split pane structure (Grid, Vertical, Horizontal)', category: 'layout', breadcrumbs: ['Appearance', 'Layout & Constraints', 'Layout Mode'] },
  { id: 'layout-sidebar-width', name: 'Sidebar Width Constraint', description: 'Force bounds on agent sidebar width (220px to 500px)', category: 'layout', breadcrumbs: ['Appearance', 'Layout & Constraints', 'Sidebar Width'] },
  { id: 'layout-panel-height', name: 'Top Panel Height Constraint', description: 'Force bounds on top workroom panel height (180px to 800px)', category: 'layout', breadcrumbs: ['Appearance', 'Layout & Constraints', 'Top Panel Height'] },
  { id: 'layout-bottom-height', name: 'Bottom Panel Height', description: 'Default bottom panel height in pixels', category: 'layout', breadcrumbs: ['Appearance', 'Layout & Constraints', 'Bottom Panel Height'] },
  { id: 'layout-titlebar', name: 'Show Pane Titlebar', description: 'Render headers and command inputs for split panes', category: 'layout', breadcrumbs: ['Appearance', 'Layout & Constraints', 'Show Pane Titlebar'] },
];

const getPerformanceWarnings = (s: AppSettings): string[] => {
  const w: string[] = [];
  const theme = s.appearance?.theme;
  const terminal = s.appearance?.terminal;
  const accessibility = s.appearance?.accessibility;
  const advanced = s.appearance?.advanced;
  
  if (!theme || !terminal) return w;
  
  // 1. Transparency + Blur (high blur with low opacity is CPU/GPU intensive)
  const isSemiTransparent = theme.transparency < 95;
  const isHighlyTransparent = theme.transparency < 75;
  if (isSemiTransparent && theme.backgroundBlur === 'high') {
    w.push("High backdrop blur with transparency requires heavy real-time composition shading, which can bottleneck visual rendering on weaker GPUs.");
  }
  
  // 2. Transparency + Enhanced Animations
  if (isHighlyTransparent && theme.animationLevel === 'enhanced') {
    w.push("Enhanced UI animations running over highly transparent glass panels cause continuous GPU draw calls and may result in frame stuttering.");
  }
  
  // 3. Screen Reader + Animations
  if (accessibility?.screenReaderMode && theme.animationLevel !== 'none') {
    w.push("Screen reader mode works best when visual transitions are completely disabled to ensure immediate focus updates.");
  }
  
  // 4. WebGL off + High Scrollback limit
  if (!terminal.hardwareAcceleration && terminal.terminalScrollbackLimit > 60000) {
    w.push("WebGL acceleration is disabled while the terminal scrollback limit is high. Massive terminal command history buffers can lead to heavy CPU lag during rendering.");
  }
  
  // 5. Custom CSS
  if (advanced?.customCss && advanced.customCss.trim().length > 0) {
    w.push("Active custom CSS code is injected. Improper selectors or layouts can override layout constraints and impact rendering speed.");
  }
  
  return w;
};

export const SettingsModal: React.FC = () => {
  const { 
    isSettingsModalOpen, 
    setSettingsModalOpen, 
    settings, 
    updateSettings, 
    resetSettings,
    showAlertDialog,
    showConfirmDialog
  } = useOrchestratorStore();
  
  // Local state for settings form
  const [rawLocalSettings, setRawLocalSettings] = useState<AppSettings>(() => deepMerge(DEFAULT_APP_SETTINGS, settings || {}));
  const localSettings = useMemo(() => deepMerge(DEFAULT_APP_SETTINGS, rawLocalSettings || {}), [rawLocalSettings]);
  const [activeCategory, setActiveCategory] = useState<string>('shell');
  const [activeAppearanceSubTab, setActiveAppearanceSubTab] = useState<string>('theme');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAppearanceExpanded, setIsAppearanceExpanded] = useState(true);
  const [highlightedOptionId, setHighlightedOptionId] = useState<string | null>(null);

  // CLI check states
  const [installedStatuses, setInstalledStatuses] = useState<Record<string, boolean>>({});
  const [isChecking, setIsChecking] = useState<Record<string, boolean>>({});

  // Trigger brief visual glow on matching option
  const triggerHighlight = (id: string) => {
    setHighlightedOptionId(id);
    setTimeout(() => {
      setHighlightedOptionId(null);
    }, 2500);
  };

  // Sync state if modal reopens
  React.useEffect(() => {
    if (isSettingsModalOpen) {
      setRawLocalSettings(deepMerge(DEFAULT_APP_SETTINGS, settings || {}));
    }
  }, [isSettingsModalOpen, settings]);

  const handleSave = () => {
    updateSettings(localSettings);
    setSettingsModalOpen(false);
  };

  const handleResetSection = () => {
    showConfirmDialog(
      "Reset Category Settings",
      "Are you sure you want to reset the current category settings?",
      () => {
        setRawLocalSettings(prev => {
          const updated = deepMerge(DEFAULT_APP_SETTINGS, prev || {});
          const targetCat = activeCategory === 'appearance' ? activeAppearanceSubTab : activeCategory;
          if (targetCat === 'shell') {
            updated.defaultShell = DEFAULT_APP_SETTINGS.defaultShell;
            updated.shellArgs = DEFAULT_APP_SETTINGS.shellArgs;
          } else if (targetCat === 'clis') {
            updated.customCLIs = DEFAULT_APP_SETTINGS.customCLIs;
            updated.cliOverrides = DEFAULT_APP_SETTINGS.cliOverrides;
          } else if (targetCat === 'performance') {
            updated.backgroundWorkspaceSuspendMinutes = DEFAULT_APP_SETTINGS.backgroundWorkspaceSuspendMinutes;
            if (updated.appearance?.terminal) {
              updated.appearance.terminal.hardwareAcceleration = DEFAULT_APP_SETTINGS.appearance?.terminal?.hardwareAcceleration;
              updated.appearance.terminal.terminalScrollbackLimit = DEFAULT_APP_SETTINGS.appearance?.terminal?.terminalScrollbackLimit;
            }
          } else if (targetCat === 'shortcuts') {
            updated.shortcuts = DEFAULT_APP_SETTINGS.shortcuts;
          } else if (targetCat === 'theme') {
            if (updated.appearance) updated.appearance.theme = DEFAULT_APP_SETTINGS.appearance?.theme;
          } else if (targetCat === 'colors') {
            if (updated.appearance?.theme) {
              updated.appearance.theme.accentColor = DEFAULT_APP_SETTINGS.appearance?.theme?.accentColor;
              updated.appearance.theme.customAccentColor = DEFAULT_APP_SETTINGS.appearance?.theme?.customAccentColor;
            }
          } else if (targetCat === 'typography') {
            if (updated.appearance) updated.appearance.typography = DEFAULT_APP_SETTINGS.appearance?.typography;
          } else if (targetCat === 'workspace') {
            if (updated.appearance) updated.appearance.workspace = DEFAULT_APP_SETTINGS.appearance?.workspace;
          } else if (targetCat === 'terminal') {
            if (updated.appearance) updated.appearance.terminal = DEFAULT_APP_SETTINGS.appearance?.terminal;
          } else if (targetCat === 'agents') {
            if (updated.appearance) updated.appearance.agent = DEFAULT_APP_SETTINGS.appearance?.agent;
          } else if (targetCat === 'accessibility') {
            if (updated.appearance) updated.appearance.accessibility = DEFAULT_APP_SETTINGS.appearance?.accessibility;
          } else if (targetCat === 'layout') {
            if (updated.appearance) updated.appearance.layout = DEFAULT_APP_SETTINGS.appearance?.layout;
          }
          return updated;
        });
      }
    );
  };

  const handleResetAppearance = () => {
    showConfirmDialog(
      "Reset Appearance Settings",
      "Are you sure you want to reset all Appearance categories to defaults?",
      () => {
        setRawLocalSettings(prev => {
          const updated = deepMerge(DEFAULT_APP_SETTINGS, prev || {});
          updated.appearance = DEFAULT_APP_SETTINGS.appearance;
          return updated;
        });
      }
    );
  };

  const handleResetAll = () => {
    showConfirmDialog(
      "Reset All Settings",
      "Are you sure you want to reset all settings to defaults?",
      () => {
        resetSettings();
        setRawLocalSettings(DEFAULT_APP_SETTINGS);
      }
    );
  };

  // Profile JSON handlers
  const handleImport = (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      let importedSettings: AppSettings | null = null;
      if (parsed.app === 'nexora' && parsed.settings) {
        importedSettings = parsed.settings;
      } else if (parsed.appearance || parsed.defaultShell) {
        importedSettings = parsed;
      }
      
      if (!importedSettings) {
        showAlertDialog("Import Failed", "Invalid profile JSON format.");
        return;
      }
      
      if (importedSettings.version !== 2) {
        const migrated = deepMerge(DEFAULT_APP_SETTINGS, importedSettings);
        migrated.version = 2;
        setRawLocalSettings(migrated);
        showAlertDialog("Profile Imported", `Profile version ${importedSettings.version || 1} has been upgraded to version 2 and imported successfully! Click Save Changes to apply.`);
      } else {
        setRawLocalSettings(deepMerge(DEFAULT_APP_SETTINGS, importedSettings));
        showAlertDialog("Profile Imported", "Profile imported successfully! Click Save Changes to apply.");
      }
    } catch (e) {
      showAlertDialog("Import Failed", "Failed to parse JSON profile. Please verify format.");
    }
  };

  // Helper for updating nested localSettings paths
  const updateLocalNested = (path: string, value: any) => {
    setRawLocalSettings(prev => {
      const updated = { ...prev };
      const parts = path.split('.');
      let current: any = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return updated;
    });
  };

  const applyPreset = (preset: AppearancePreset) => {
    setRawLocalSettings(prev => {
      const appearance = prev?.appearance || {};
      const theme = appearance.theme || {};
      const typography = appearance.typography || {};
      const layout = appearance.layout || {};
      return {
        ...prev,
        appearance: {
          ...appearance,
          ...preset.appearance,
          theme: {
            ...theme,
            ...preset.appearance?.theme
          },
          typography: {
            ...typography,
            ...preset.appearance?.typography
          },
          layout: {
            ...layout,
            ...preset.appearance?.layout
          }
        }
      };
    });
  };

  // Custom CLI handlers
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
    updateLocalNested('customCLIs', [...(localSettings.customCLIs || []), newCLI]);
  };

  const handleUpdateCLI = (id: string, field: keyof CustomCLI, value: any) => {
    const updated = (localSettings.customCLIs || []).map(cli => 
      cli.id === id ? { ...cli, [field]: value } : cli
    );
    updateLocalNested('customCLIs', updated);
  };

  const handleDeleteCLI = (id: string) => {
    updateLocalNested('customCLIs', (localSettings.customCLIs || []).filter(cli => cli.id !== id));
  };

  const handleOverridePredefined = (id: string, field: keyof AgentPlugin, value: any) => {
    const currentOverrides = localSettings.cliOverrides || {};
    const pluginOverrides = currentOverrides[id] || {};
    updateLocalNested('cliOverrides', {
      ...currentOverrides,
      [id]: { ...pluginOverrides, [field]: value }
    });
  };

  const checkCLI = async (id: string) => {
    setIsChecking(prev => ({ ...prev, [id]: true }));
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
    useOrchestratorStore.getState().spawnTerminal("", undefined, undefined, undefined, plugin.installHelp.command);
    setSettingsModalOpen(false);
  };

  const handleInstallCustom = (cli: CustomCLI) => {
    if (!cli.installCommand) return;
    useOrchestratorStore.getState().spawnTerminal("", undefined, undefined, undefined, cli.installCommand);
    setSettingsModalOpen(false);
  };

  // Hierarchical categories definition
  const navigationGroups = [
    {
      label: 'General Settings',
      categories: [
        { id: 'shell', label: 'Shell Configuration', icon: <FileCode2 size={13} /> },
        { id: 'clis', label: 'Custom & Agent CLIs', icon: <Package size={13} /> },
        { id: 'registry', label: 'Agent Registry DB', icon: <Cpu size={13} /> },
        { id: 'performance', label: 'Performance & RAM', icon: <Zap size={13} /> },
        { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: <Keyboard size={13} /> },
        { id: 'profiles', label: 'Backup & Profiles', icon: <ArrowLeftRight size={13} /> },
        { id: 'appearance', label: 'Appearance', icon: <Palette size={13} /> },
      ]
    }
  ];

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];
    return searchableOptions.filter(opt => 
      opt.name.toLowerCase().includes(q) || 
      opt.description.toLowerCase().includes(q) || 
      opt.breadcrumbs.some(b => b.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const handleSelectMatch = (match: SearchableOption) => {
    const appearanceCategories = ['theme', 'colors', 'typography', 'layout', 'workspace', 'terminal', 'agents', 'accessibility'];
    if (appearanceCategories.includes(match.category)) {
      setActiveCategory('appearance');
      setActiveAppearanceSubTab(match.category);
      setIsAppearanceExpanded(true);
    } else {
      setActiveCategory(match.category);
    }
    triggerHighlight(match.id);
  };

  const activeWarnings = useMemo(() => getPerformanceWarnings(localSettings), [localSettings]);

  // Accent picker swatch info
  const accentColors = [
    { id: 'amber', hex: '#f59e0b', name: 'Amber' },
    { id: 'blue', hex: '#3b82f6', name: 'Blue' },
    { id: 'emerald', hex: '#10b981', name: 'Emerald' },
    { id: 'red', hex: '#ef4444', name: 'Red' },
    { id: 'violet', hex: '#8b5cf6', name: 'Violet' },
    { id: 'cyan', hex: '#06b6d4', name: 'Cyan' },
    { id: 'pink', hex: '#ec4899', name: 'Pink' },
    { id: 'custom', hex: 'conic-gradient(from 0deg, red, yellow, green, cyan, blue, magenta, red)', name: 'Custom Hex' }
  ];

  // Theme visual swatches
  const themesPreviewData = [
    { id: 'OLED', name: 'OLED Black', bg: '#000000', cardBg: '#050505', text: '#ffffff', accent: '#f59e0b' },
    { id: 'Midnight', name: 'Midnight Blue', bg: '#060609', cardBg: '#0b0c10', text: '#f4f4f5', accent: '#f59e0b' },
    { id: 'Slate', name: 'Slate Slate', bg: '#0f172a', cardBg: '#1e293b', text: '#f1f5f9', accent: '#38bdf8' },
    { id: 'Graphite', name: 'Graphite Stone', bg: '#18181b', cardBg: '#27272a', text: '#f4f4f5', accent: '#f4f4f5' }
  ];

  // Helper for custom live preview settings
  const getAccentColorHex = (accentId: string, customHex?: string) => {
    if (accentId === 'custom' && customHex) {
      return customHex;
    }
    const colorMap: Record<string, string> = {
      amber: '#f59e0b',
      blue: '#3b82f6',
      emerald: '#10b981',
      red: '#ef4444',
      violet: '#8b5cf6',
      cyan: '#06b6d4',
      pink: '#ec4899',
    };
    return colorMap[accentId] || '#f59e0b';
  };

  const hexToRgba = (hex: string, alpha: number) => {
    if (!hex || !hex.startsWith('#')) return `rgba(15, 15, 21, ${alpha})`;
    let h = hex.substring(1);
    if (h.length === 3) {
      h = h.split('').map(char => char + char).join('');
    }
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const getCornerRadiusValue = (radiusKey: string) => {
    const map: Record<string, string> = {
      sharp: '0px',
      small: '4px',
      medium: '8px',
      large: '16px',
    };
    return map[radiusKey] || '8px';
  };

  const getThemeData = (themeId: string) => {
    const found = themesPreviewData.find(t => t.id === themeId);
    return found || themesPreviewData[1]; // default to Midnight
  };

  if (!isSettingsModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center">
      <div className={`glass-modal glass-noise-base h-[680px] flex overflow-hidden border border-border-glass transition-all duration-300 ${activeCategory === 'appearance' ? 'w-[1100px]' : 'w-[950px]'}`}>
        
        {/* Left Sidebar Navigation */}
        <div className="w-[280px] bg-[#070709]/75 border-r border-border-glass flex flex-col">
          <div className="p-4 border-b border-border-glass">
            <h2 className="text-zinc-200 font-semibold text-base font-mono mb-2.5">Settings</h2>
            
            {/* Sidebar Global Search */}
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#0f0f15]/90 border border-border-glass rounded outline-none text-zinc-200 placeholder-zinc-550 focus:border-accent-primary/45 transition-all font-sans"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-zinc-500 hover:text-zinc-350"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2 pr-1">
            {searchQuery.trim() !== '' ? (
              /* Search Results view in Sidebar */
              <div className="px-2 space-y-1 font-sans">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-2 mb-2">Search Results</div>
                {filteredOptions.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-zinc-500">No matching options found.</div>
                ) : (
                  filteredOptions.map(option => (
                    <div
                      key={option.id}
                      onClick={() => handleSelectMatch(option)}
                      className="group w-full text-left px-3 py-2 rounded text-zinc-350 hover:bg-white/5 hover:text-zinc-250 cursor-pointer transition-colors border border-transparent hover:border-white/5"
                    >
                      <div className="text-[11px] font-semibold leading-snug">{option.name}</div>
                      <div className="text-[9px] text-zinc-500 font-mono mt-0.5 truncate">
                        {option.breadcrumbs.join(' > ')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Standard Hierarchical Tree */
              <div className="space-y-4 font-sans select-none">
                {navigationGroups.map(group => (
                  <div key={group.label} className="space-y-1">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-4 py-1.5">{group.label}</div>
                    <div className="space-y-[2px] px-2">
                      {group.categories.map(cat => {
                        const isAppearance = cat.id === 'appearance';
                        
                        if (isAppearance) {
                          const isAppearanceActive = activeCategory === 'appearance';
                          return (
                            <div key={cat.id} className="space-y-[2px]">
                              <button
                                onClick={() => {
                                  setActiveCategory('appearance');
                                  setIsAppearanceExpanded(!isAppearanceExpanded);
                                  setSearchQuery('');
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-all rounded cursor-pointer ${
                                  isAppearanceActive 
                                    ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/15 font-semibold shadow-sm shadow-accent-primary/5' 
                                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className={isAppearanceActive ? 'text-accent-primary' : 'text-zinc-500'}>
                                    {cat.icon}
                                  </span>
                                  <span>{cat.label}</span>
                                </div>
                                <span className={isAppearanceActive ? 'text-accent-primary/80' : 'text-zinc-500'}>
                                  {isAppearanceExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                </span>
                              </button>

                              {/* Nested Appearance Subtabs */}
                              {isAppearanceExpanded && (
                                <div className="pl-4 space-y-[2px] border-l border-white/5 ml-4 mt-[2px] transition-all">
                                  {[
                                    { id: 'theme', label: 'Themes & Presets', icon: <Palette size={11} /> },
                                    { id: 'colors', label: 'Color Accent', icon: <Pipette size={11} /> },
                                    { id: 'typography', label: 'Typography & Fonts', icon: <Type size={11} /> },
                                    { id: 'layout', label: 'Layout & Gaps', icon: <SplitSquareVertical size={11} /> },
                                    { id: 'workspace', label: 'Workspace Options', icon: <Layers size={11} /> },
                                    { id: 'terminal', label: 'Terminal Styles', icon: <Terminal size={11} /> },
                                    { id: 'agents', label: 'Agent Dashboard', icon: <Eye size={11} /> },
                                    { id: 'accessibility', label: 'Accessibility', icon: <Accessibility size={11} /> },
                                  ].map(sub => {
                                    const isSubActive = isAppearanceActive && activeAppearanceSubTab === sub.id;
                                    return (
                                      <button
                                        key={sub.id}
                                        onClick={() => {
                                          setActiveCategory('appearance');
                                          setActiveAppearanceSubTab(sub.id);
                                          setSearchQuery('');
                                        }}
                                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-all rounded cursor-pointer ${
                                          isSubActive
                                            ? 'bg-white/5 text-white font-medium shadow-sm'
                                            : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                                        }`}
                                      >
                                        <span className={isSubActive ? 'text-accent-primary' : 'text-zinc-600'}>
                                          {sub.icon}
                                        </span>
                                        <span>{sub.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        const isActive = activeCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => {
                              setActiveCategory(cat.id);
                              setSearchQuery('');
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-all rounded cursor-pointer ${
                              isActive 
                                ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/15 font-semibold shadow-sm' 
                                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'
                            }`}
                          >
                            <span className={isActive ? 'text-accent-primary' : 'text-zinc-500 group-hover:text-zinc-455'}>
                              {cat.icon}
                            </span>
                            <span>{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Content Pane */}
        <div className="flex-1 flex flex-col relative bg-[#040406]/30">
          <button 
            onClick={() => setSettingsModalOpen(false)}
            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors z-10 animate-in fade-in duration-200"
          >
            <X size={20} />
          </button>
          
          <div className={activeCategory === 'appearance' 
            ? "flex-1 overflow-hidden flex flex-col font-mono text-[13px] relative animate-in fade-in duration-200" 
            : "p-8 flex-1 overflow-y-auto space-y-6 font-mono text-[13px]"}>
            
            {/* Live Performance Warnings Alert */}
            {activeCategory !== 'appearance' && activeWarnings.length > 0 && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded text-xs space-y-1.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-warning font-semibold uppercase tracking-wider text-[10px]">
                  <AlertTriangle size={13} />
                  Performance Warning Banner
                </div>
                <ul className="list-disc list-inside text-zinc-300 space-y-1 pl-1 font-sans leading-relaxed">
                  {activeWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 1. SHELL CONFIGURATION CATEGORY */}
            {activeCategory === 'shell' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Shell Configuration</h3>
                  <p className="text-[10px] text-zinc-500 font-sans mt-0.5">Control which shell binaries and default parameters are launched.</p>
                </div>

                <div 
                  id="shell-default"
                  className={`space-y-2 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'shell-default' 
                      ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                      : 'border border-transparent'
                  }`}
                >
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Default Shell</label>
                  <select 
                    value={localSettings.defaultShell}
                    onChange={(e) => updateLocalNested('defaultShell', e.target.value)}
                    className="glass-input w-full"
                  >
                    <option value="auto" className="bg-[#0f0f15]">Auto-detect (System Default)</option>
                    <option value="bash" className="bg-[#0f0f15]">bash</option>
                    <option value="zsh" className="bg-[#0f0f15]">zsh</option>
                    <option value="powershell" className="bg-[#0f0f15]">powershell</option>
                    <option value="cmd" className="bg-[#0f0f15]">cmd.exe</option>
                  </select>
                  <p className="text-[10px] text-zinc-500 font-sans">The default workspace environment loaded for spawned terminals and tools.</p>
                </div>

                <div 
                  id="shell-args"
                  className={`space-y-2 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'shell-args' 
                      ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                      : 'border border-transparent'
                  }`}
                >
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Shell Arguments</label>
                  <input 
                    type="text" 
                    value={(localSettings.shellArgs || []).join(' ')}
                    onChange={(e) => updateLocalNested('shellArgs', e.target.value.split(' ').filter(Boolean))}
                    className="glass-input w-full"
                    placeholder="e.g. -c or --login"
                  />
                  <p className="text-[10px] text-zinc-500 font-sans">Space-separated arguments passed to the shell binary upon execution.</p>
                </div>
              </div>
            )}

            {/* 2. CUSTOM & AGENT CLIS CATEGORY */}
            {activeCategory === 'clis' && (
              <div className="space-y-6 max-w-2xl">
                <div className="flex items-center justify-between border-b border-border-glass pb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Custom CLIs</h3>
                    <p className="text-[10px] text-zinc-500 font-sans mt-0.5">Register user-defined terminal commands to execute within workspace flows.</p>
                  </div>
                  <button 
                    onClick={handleAddCLI}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded transition-colors border border-accent-primary/20 cursor-pointer"
                  >
                    <Plus size={14} /> Add CLI
                  </button>
                </div>

                <div 
                  id="clis-custom"
                  className={`space-y-4 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'clis-custom' 
                      ? 'bg-accent-primary/5 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                      : 'border border-transparent'
                  }`}
                >
                  {!(localSettings.customCLIs?.length) ? (
                    <div className="text-center py-6 bg-[#09090b]/80 border border-border-glass border-dashed rounded text-xs text-zinc-500">
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

                <div 
                  id="clis-predefined"
                  className={`pt-4 border-t border-border-glass space-y-4 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'clis-predefined' 
                      ? 'bg-accent-primary/5 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                      : 'border border-transparent'
                  }`}
                >
                  <div>
                    <h4 className="text-xs text-zinc-300 font-semibold uppercase tracking-wider">Predefined Agent Commands</h4>
                    <p className="text-[10px] text-zinc-500 font-sans mt-0.5">Override arguments/binaries used by built-in background agents.</p>
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

            {/* 3. AGENT REGISTRY DATABASE CATEGORY */}
            {activeCategory === 'registry' && (
              <div className="space-y-6">
                <div id="registry-db">
                  <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Agent Registry DB</h3>
                  <p className="text-[10px] text-zinc-500 font-sans mt-0.5">Underlying workspace catalog synced with SQLite agent definitions.</p>
                </div>
                <div className={`p-2 rounded transition-all duration-300 ${highlightedOptionId === 'registry-db' ? 'bg-accent-primary/5 ring-1 ring-accent-primary/30 border border-accent-primary/20' : ''}`}>
                  <AgentRegistryPanel />
                </div>
              </div>
            )}

            {/* 4. PERFORMANCE SETTINGS CATEGORY */}
            {activeCategory === 'performance' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Performance Tuning</h3>
                  <p className="text-[10px] text-zinc-500 font-sans mt-0.5">Tweak frame rendering and scroll history limits to optimize CPU/RAM load.</p>
                </div>

                <div 
                  id="perf-gpu"
                  className={`flex items-center justify-between py-2.5 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'perf-gpu' 
                      ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                      : 'border border-transparent'
                  }`}
                >
                  <div className="font-sans">
                    <label className="text-xs text-zinc-300 font-medium block">Hardware Acceleration (WebGL)</label>
                    <p className="text-[10px] text-zinc-500">Significantly improves terminal frames-per-second by rendering through the GPU.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={localSettings.appearance.terminal.hardwareAcceleration}
                    onChange={(e) => updateLocalNested('appearance.terminal.hardwareAcceleration', e.target.checked)}
                    className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                  />
                </div>

                <div 
                  id="perf-scrollback"
                  className={`space-y-2 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'perf-scrollback' 
                      ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                      : 'border border-transparent'
                  }`}
                >
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Terminal Scrollback Limit</label>
                  <input 
                    type="number" 
                    min="1000" max="1000000" step="5000"
                    value={localSettings.appearance.terminal.terminalScrollbackLimit}
                    onChange={(e) => updateLocalNested('appearance.terminal.terminalScrollbackLimit', parseInt(e.target.value) || 10000)}
                    className="glass-input w-full"
                  />
                  <p className="text-[10px] text-zinc-500 font-sans">Number of scroll history lines preserved in memory per terminal tab.</p>
                </div>

                <div 
                  id="perf-suspend"
                  className={`space-y-2 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'perf-suspend' 
                      ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                      : 'border border-transparent'
                  }`}
                >
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Background Workspace Idle Suspend (Minutes)</label>
                  <input 
                    type="number" 
                    min="0" max="1440" step="5"
                    value={localSettings.backgroundWorkspaceSuspendMinutes ?? 0}
                    onChange={(e) => updateLocalNested('backgroundWorkspaceSuspendMinutes', parseInt(e.target.value) || 0)}
                    className="glass-input w-full"
                  />
                  <p className="text-[10px] text-zinc-500 font-sans">Suspend background PTY processes after inactivity. Use 0 to keep terminals running indefinitely.</p>
                </div>
              </div>
            )}

            {/* 5. GLOBAL SHORTCUTS CATEGORY */}
            {activeCategory === 'shortcuts' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Keyboard Shortcuts</h3>
                  <p className="text-[10px] text-zinc-500 font-sans mt-0.5">Record custom combination triggers to speed up workspace workflow.</p>
                </div>

                <div 
                  id="shortcuts-global"
                  className={`space-y-1.5 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'shortcuts-global' 
                      ? 'bg-accent-primary/5 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                      : 'border border-transparent'
                  }`}
                >
                  <ShortcutEditor 
                    label="Toggle Sidebar (Agent Panel)" 
                    value={localSettings.shortcuts?.toggleSidebar || ''}
                    onChange={(val) => updateLocalNested('shortcuts.toggleSidebar', val)}
                  />
                  <ShortcutEditor 
                    label="Toggle Task Center" 
                    value={localSettings.shortcuts?.toggleTaskCenter || ''}
                    onChange={(val) => updateLocalNested('shortcuts.toggleTaskCenter', val)}
                  />
                  <ShortcutEditor 
                    label="Toggle Add Agent Menu" 
                    value={localSettings.shortcuts?.toggleAddAgent || ''}
                    onChange={(val) => updateLocalNested('shortcuts.toggleAddAgent', val)}
                  />
                  <ShortcutEditor 
                    label="Open Settings" 
                    value={localSettings.shortcuts?.openSettings || ''}
                    onChange={(val) => updateLocalNested('shortcuts.openSettings', val)}
                  />
                  <ShortcutEditor 
                    label="Toggle Web Browser" 
                    value={localSettings.shortcuts?.toggleBrowser || ''}
                    onChange={(val) => updateLocalNested('shortcuts.toggleBrowser', val)}
                  />
                  <ShortcutEditor 
                    label="Toggle Agent Review Center" 
                    value={localSettings.shortcuts?.toggleReviewCenter || ''}
                    onChange={(val) => updateLocalNested('shortcuts.toggleReviewCenter', val)}
                  />
                  
                  <div className="pt-4 text-[10px] text-zinc-550 font-sans italic">
                    Note: On macOS layouts, recorded Ctrl mappings will translate internally to Cmd (⌘).
                  </div>
                </div>
              </div>
            )}

            {/* 6. PROFILE IMPORT / EXPORT CATEGORY */}
            {activeCategory === 'profiles' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Backup & Profiles</h3>
                  <p className="text-[10px] text-zinc-500 font-sans mt-0.5">Backup settings configurations or share them across system profiles via string tokens.</p>
                </div>

                <div 
                  id="profiles-imp-exp"
                  className={`space-y-6 p-2 rounded transition-all duration-300 ${
                    highlightedOptionId === 'profiles-imp-exp' 
                      ? 'bg-accent-primary/5 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                      : 'border border-transparent'
                  }`}
                >
                  <div className="space-y-2">
                    <h4 className="text-xs text-zinc-300 font-semibold uppercase tracking-wider">Export Profile</h4>
                    <p className="text-[10px] text-zinc-500 font-sans leading-relaxed">
                      Copy the current settings profile data block. Share this with other clients to clone your workspace visuals.
                    </p>
                    <div className="relative">
                      <textarea
                        readOnly
                        value={JSON.stringify({
                          app: 'nexora',
                          version: localSettings.version || 2,
                          exportedAt: new Date().toISOString(),
                          settings: localSettings
                        }, null, 2)}
                        className="w-full h-36 glass-input font-mono text-[10px] p-2.5 bg-[#050508]/85 border border-[#232329]/50 rounded resize-none"
                      />
                      <button
                        onClick={() => {
                          const jsonStr = JSON.stringify({
                            app: 'nexora',
                            version: localSettings.version || 2,
                            exportedAt: new Date().toISOString(),
                            settings: localSettings
                          }, null, 2);
                          navigator.clipboard.writeText(jsonStr);
                          showAlertDialog("Copied to Clipboard", "Profile configuration copied to clipboard!");
                        }}
                        className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-200 bg-white/5 hover:bg-white/10 rounded transition-colors border border-white/10 cursor-pointer"
                      >
                        <Download size={12} /> Copy JSON
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border-glass pt-4">
                    <h4 className="text-xs text-zinc-300 font-semibold uppercase tracking-wider">Import Profile</h4>
                    <p className="text-[10px] text-zinc-500 font-sans leading-relaxed">
                      Paste a versioned profile string to override your active configuration.
                    </p>
                    <textarea
                      id="import-profile-textarea"
                      placeholder="Paste JSON profile string..."
                      className="w-full h-36 glass-input font-mono text-[10px] p-2.5 bg-[#050508]/85 border border-[#232329]/50 rounded resize-none"
                    />
                    <button
                      onClick={() => {
                        const textarea = document.getElementById('import-profile-textarea') as HTMLTextAreaElement;
                        if (textarea) {
                          handleImport(textarea.value);
                          textarea.value = '';
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded transition-colors border border-accent-primary/20 cursor-pointer"
                    >
                      <Upload size={14} /> Import & Apply
                    </button>
                  </div>
                </div>
              </div>
            )}            {/* 7. APPEARANCE CATEGORY WITH SUB-TABS */}
            {activeCategory === 'appearance' && (
              <div className="flex flex-1 min-h-0 overflow-hidden divide-x divide-border-glass">
                {/* 55% Control Section */}
                <div className="w-[55%] overflow-y-auto p-8 space-y-6 flex flex-col">
                  {/* Warnings inside controls */}
                  {activeWarnings.length > 0 && (
                    <div className="p-3 bg-warning/10 border border-warning/20 rounded text-xs space-y-1.5 animate-in fade-in duration-200 mb-2">
                      <div className="flex items-center gap-2 text-warning font-semibold uppercase tracking-wider text-[10px]">
                        <AlertTriangle size={13} />
                        Performance Warning Banner
                      </div>
                      <ul className="list-disc list-inside text-zinc-300 space-y-1 pl-1 font-sans leading-relaxed">
                        {activeWarnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                <div className="border-b border-border-glass pb-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
                        {activeAppearanceSubTab === 'theme' && 'Themes & Presets'}
                        {activeAppearanceSubTab === 'colors' && 'Color Accent'}
                        {activeAppearanceSubTab === 'typography' && 'Typography & Fonts'}
                        {activeAppearanceSubTab === 'layout' && 'Layout & Gaps'}
                        {activeAppearanceSubTab === 'workspace' && 'Workspace Options'}
                        {activeAppearanceSubTab === 'terminal' && 'Terminal Styles'}
                        {activeAppearanceSubTab === 'agents' && 'Agent Dashboard'}
                        {activeAppearanceSubTab === 'accessibility' && 'Accessibility'}
                      </h3>
                      <p className="text-[10px] text-zinc-500 font-sans mt-0.5">
                        {activeAppearanceSubTab === 'theme' && "Select a core theme stylesheet or apply preconfigured workspace layouts."}
                        {activeAppearanceSubTab === 'colors' && "Personalize theme colors, accent highlights, and custom hex overrides."}
                        {activeAppearanceSubTab === 'typography' && "Configure font-families, font sizes, line heights, and spacings for UI, editors, and terminal shells."}
                        {activeAppearanceSubTab === 'layout' && "Force boundaries and layout restrictions on sidebars, top panels, and bottom titlebars."}
                        {activeAppearanceSubTab === 'workspace' && "Show/hide status bars, activity bars, editor minimaps, and git branches."}
                        {activeAppearanceSubTab === 'terminal' && "Configure terminal cursor styles, cursor blinking, copy-on-select, and bells."}
                        {activeAppearanceSubTab === 'agents' && "Toggle compact cards, status badges, avatar styles, and grid animations."}
                        {activeAppearanceSubTab === 'accessibility' && "Configure screen reader optimization, contrast adjustments, and motion restrictions."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub Tab Contents */}
                {activeAppearanceSubTab === 'theme' && (
                  <div className="space-y-6 max-w-xl animate-in fade-in duration-150">

                    {/* Presets Subsection */}
                    <div 
                      id="theme-presets"
                      className={`space-y-3 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'theme-presets' 
                          ? 'bg-accent-primary/5 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block font-bold">One-Click Presets</label>
                      <div className="grid grid-cols-1 gap-2.5 font-sans">
                        {APPEARANCE_PRESETS.map((preset) => {
                          const isSelected = localSettings.appearance.theme.theme === preset.appearance.theme?.theme &&
                                             localSettings.appearance.theme.accentColor === preset.appearance.theme?.accentColor &&
                                             localSettings.appearance.theme.density === preset.appearance.theme?.density &&
                                             localSettings.appearance.theme.cornerRadius === preset.appearance.theme?.cornerRadius;
                          return (
                            <div
                              key={preset.id}
                              onClick={() => applyPreset(preset)}
                              className={`p-3 rounded border cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-accent-primary bg-accent-primary/5 shadow-[var(--shadow-glow)]'
                                  : 'border-[#232329]/60 bg-[#0c0c0e]/30 hover:bg-[#121214]/60 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-zinc-200">{preset.name}</span>
                                {isSelected && <span className="text-[9px] font-bold text-accent-primary uppercase tracking-wider bg-accent-primary/10 px-1.5 py-0.5 rounded">Selected</span>}
                              </div>
                              <p className="text-[10px] text-zinc-450 mt-1 leading-normal font-sans">{preset.description}</p>
                              
                              <div className="flex gap-2 mt-2 font-mono text-[9px]">
                                <span className="text-zinc-400 bg-white/5 border border-white/5 px-1 py-0.5 rounded">
                                  Theme: {preset.appearance.theme?.theme}
                                </span>
                                <span className="text-zinc-400 bg-white/5 border border-white/5 px-1 py-0.5 rounded">
                                  Rounding: {preset.appearance.theme?.cornerRadius}
                                </span>
                                <span className="text-zinc-400 bg-white/5 border border-white/5 px-1 py-0.5 rounded">
                                  Density: {preset.appearance.theme?.density}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Theme select Subsection */}
                    <div 
                      id="theme-select"
                      className={`space-y-3 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'theme-select' 
                          ? 'bg-accent-primary/5 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block font-bold">Visual Style Theme</label>
                      <div className="grid grid-cols-2 gap-3 font-sans">
                        {themesPreviewData.map((themeOpt) => {
                          const isActive = localSettings.appearance.theme.theme === themeOpt.id;
                          return (
                            <div 
                              key={themeOpt.id}
                              onClick={() => updateLocalNested('appearance.theme.theme', themeOpt.id)}
                              className={`p-3 rounded border cursor-pointer transition-all flex flex-col justify-between ${
                                isActive 
                                  ? 'border-accent-primary bg-accent-primary/5 shadow-[var(--shadow-glow)]' 
                                  : 'border-[#232329]/60 bg-[#0c0c0e]/30 hover:bg-[#121214]/60 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-zinc-200">{themeOpt.name}</span>
                                {isActive && <Check size={13} className="text-accent-primary" />}
                              </div>
                              
                              {/* Mini Palette preview bar */}
                              <div className="flex gap-1.5 mt-2 p-1.5 bg-[#09090c]/90 rounded border border-[#232329]/30">
                                <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: themeOpt.bg }} title="Background" />
                                <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: themeOpt.cardBg }} title="Cards" />
                                <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: themeOpt.accent }} title="Accent" />
                                <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: themeOpt.text }} title="Text" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Additional controls */}
                    <div 
                      id="theme-mode"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'theme-mode' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Interface Mode</label>
                      <select 
                        value={localSettings.appearance.theme.mode}
                        onChange={(e) => updateLocalNested('appearance.theme.mode', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="dark" className="bg-[#0f0f15]">Dark Mode</option>
                        <option value="system" className="bg-[#0f0f15]">System Default</option>
                      </select>
                    </div>

                    <div 
                      id="theme-transparency"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'theme-transparency' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Glass Transparency ({localSettings.appearance.theme.transparency}%)</label>
                      <input 
                        type="range" min="20" max="100" step="5"
                        value={localSettings.appearance.theme.transparency}
                        onChange={(e) => updateLocalNested('appearance.theme.transparency', parseInt(e.target.value))}
                        className="w-full h-1 bg-[#1a1a24] rounded-lg appearance-none cursor-pointer accent-accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-zinc-550 font-sans">
                        <span>20% (Highly Transparent)</span>
                        <span>100% (Solid Surface)</span>
                      </div>
                    </div>

                    <div 
                      id="theme-blur"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'theme-blur' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Backdrop Glass Blur Level</label>
                      <select 
                        value={localSettings.appearance.theme.backgroundBlur}
                        onChange={(e) => updateLocalNested('appearance.theme.backgroundBlur', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="low" className="bg-[#0f0f15]">Low (8px)</option>
                        <option value="medium" className="bg-[#0f0f15]">Medium (16px)</option>
                        <option value="high" className="bg-[#0f0f15]">High (28px)</option>
                      </select>
                    </div>

                    <div 
                      id="theme-animations"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'theme-animations' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Transition Animations</label>
                      <select 
                        value={localSettings.appearance.theme.animationLevel}
                        onChange={(e) => updateLocalNested('appearance.theme.animationLevel', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="none" className="bg-[#0f0f15]">None (Static / Immediate)</option>
                        <option value="reduced" className="bg-[#0f0f15]">Reduced Motion</option>
                        <option value="normal" className="bg-[#0f0f15]">Normal (300ms)</option>
                        <option value="enhanced" className="bg-[#0f0f15]">Enhanced (Fluid UI)</option>
                      </select>
                    </div>

                    <div 
                      id="theme-corners"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'theme-corners' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Border Rounding (Corners)</label>
                      <select 
                        value={localSettings.appearance.theme.cornerRadius}
                        onChange={(e) => updateLocalNested('appearance.theme.cornerRadius', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="sharp" className="bg-[#0f0f15]">Sharp Corners (0px)</option>
                        <option value="small" className="bg-[#0f0f15]">Small Rounding (4px)</option>
                        <option value="medium" className="bg-[#0f0f15]">Medium Rounding (8px)</option>
                        <option value="large" className="bg-[#0f0f15]">Large Rounding (16px)</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeAppearanceSubTab === 'colors' && (
                  <div className="space-y-6 max-w-xl animate-in fade-in duration-150">

                    <div 
                      id="color-accent"
                      className={`space-y-4 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'color-accent' 
                          ? 'bg-accent-primary/5 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Accent Swatches</label>
                      <div className="grid grid-cols-4 gap-3">
                        {accentColors.map((color) => {
                          const isSelected = localSettings.appearance.theme.accentColor === color.id;
                          return (
                            <div
                              key={color.id}
                              onClick={() => updateLocalNested('appearance.theme.accentColor', color.id)}
                              className={`p-2 rounded border cursor-pointer flex flex-col items-center gap-1.5 justify-center transition-all ${
                                isSelected 
                                  ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary/25' 
                                  : 'border-[#232329]/60 bg-[#09090b]/50 hover:bg-[#111115]'
                              }`}
                            >
                              <div 
                                className="w-5 h-5 rounded-full border border-white/10" 
                                style={{ background: color.hex }}
                              />
                              <span className="text-[10px] font-sans text-zinc-350">{color.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {localSettings.appearance.theme.accentColor === 'custom' && (
                      <div 
                        id="color-custom-hex"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'color-custom-hex' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Custom Hex Accent Code</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={localSettings.appearance.theme.customAccentColor || '#f59e0b'}
                            onChange={(e) => updateLocalNested('appearance.theme.customAccentColor', e.target.value)}
                            className="glass-input flex-1 font-mono uppercase"
                            placeholder="#f59e0b"
                          />
                          <input 
                            type="color" 
                            value={localSettings.appearance.theme.customAccentColor || '#f59e0b'}
                            onChange={(e) => updateLocalNested('appearance.theme.customAccentColor', e.target.value)}
                            className="w-10 h-[34px] rounded border border-border-glass bg-transparent cursor-pointer p-0.5"
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Density picker Subsection inside Color Accent / Theme styling */}
                    <div className="space-y-2 pt-4 border-t border-border-glass">
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Layout Spacing Density</label>
                      <div className="grid grid-cols-3 gap-3 font-sans">
                        {[
                          { id: 'compact', name: 'Compact', desc: 'Minimal padding' },
                          { id: 'comfortable', name: 'Comfortable', desc: 'Standard gaps' },
                          { id: 'spacious', name: 'Spacious', desc: 'Generous padding' }
                        ].map((den) => {
                          const isActive = localSettings.appearance.theme.density === den.id;
                          return (
                            <div
                              key={den.id}
                              onClick={() => updateLocalNested('appearance.theme.density', den.id)}
                              className={`p-2.5 rounded border cursor-pointer transition-all text-center ${
                                isActive
                                  ? 'border-accent-primary bg-accent-primary/5 text-zinc-200'
                                  : 'border-[#232329]/60 bg-[#09090b]/50 hover:bg-[#111115] text-zinc-400'
                              }`}
                            >
                              <div className="text-xs font-semibold">{den.name}</div>
                              <div className="text-[9px] text-zinc-550 mt-0.5">{den.desc}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {activeAppearanceSubTab === 'typography' && (
                  <div className="space-y-6 max-w-xl animate-in fade-in duration-150">

                    <div className="grid grid-cols-2 gap-4">
                      {/* General UI Font */}
                      <div 
                        id="typo-ui-font"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'typo-ui-font' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">UI Font Family</label>
                        <select 
                          value={localSettings.appearance.typography.fontFamily}
                          onChange={(e) => updateLocalNested('appearance.typography.fontFamily', e.target.value)}
                          className="glass-input w-full font-sans"
                        >
                          <option value="'Inter', -apple-system, BlinkMacSystemFont, sans-serif">Inter (Standard)</option>
                          <option value="'Geist', -apple-system, sans-serif">Geist</option>
                          <option value="system-ui, sans-serif">System UI Default</option>
                          <option value="'Segoe UI', Tahoma, Geneva, sans-serif">Segoe UI (Windows)</option>
                          <option value="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif">SF Pro (macOS)</option>
                        </select>
                      </div>

                      {/* UI Font Size */}
                      <div 
                        id="typo-ui-size"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'typo-ui-size' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">UI Font Size ({localSettings.appearance.typography.fontSize}px)</label>
                        <input 
                          type="number" min="10" max="22"
                          value={localSettings.appearance.typography.fontSize}
                          onChange={(e) => updateLocalNested('appearance.typography.fontSize', parseInt(e.target.value) || 13)}
                          className="glass-input w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Line Height */}
                      <div 
                        id="typo-lineheight"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'typo-lineheight' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">UI Line Height</label>
                        <input 
                          type="number" min="1.1" max="2.0" step="0.05"
                          value={localSettings.appearance.typography.lineHeight}
                          onChange={(e) => updateLocalNested('appearance.typography.lineHeight', parseFloat(e.target.value) || 1.5)}
                          className="glass-input w-full"
                        />
                      </div>

                      {/* Font Weight */}
                      <div 
                        id="typo-weight"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'typo-weight' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">UI Font Weight</label>
                        <select 
                          value={localSettings.appearance.typography.fontWeight}
                          onChange={(e) => updateLocalNested('appearance.typography.fontWeight', e.target.value)}
                          className="glass-input w-full"
                        >
                          <option value="300">300 (Light)</option>
                          <option value="400">400 (Regular)</option>
                          <option value="500">500 (Medium)</option>
                          <option value="600">600 (Semibold)</option>
                          <option value="700">700 (Bold)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Code Font */}
                      <div 
                        id="typo-code-font"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'typo-code-font' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Code Font Family</label>
                        <select 
                          value={localSettings.appearance.typography.codeFontFamily}
                          onChange={(e) => updateLocalNested('appearance.typography.codeFontFamily', e.target.value)}
                          className="glass-input w-full font-mono text-xs"
                        >
                          <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                          <option value="'Geist Mono', monospace">Geist Mono</option>
                          <option value="'Fira Code', monospace">Fira Code</option>
                          <option value="Consolas, monospace">Consolas</option>
                        </select>
                      </div>

                      {/* Code Font Size */}
                      <div 
                        id="typo-code-size"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'typo-code-size' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Code Font Size ({localSettings.appearance.typography.codeFontSize}px)</label>
                        <input 
                          type="number" min="9" max="24"
                          value={localSettings.appearance.typography.codeFontSize}
                          onChange={(e) => updateLocalNested('appearance.typography.codeFontSize', parseInt(e.target.value) || 12)}
                          className="glass-input w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Terminal Font */}
                      <div 
                        id="typo-term-font"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'typo-term-font' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Terminal Font Family</label>
                        <select 
                          value={localSettings.appearance.typography.terminalFontFamily}
                          onChange={(e) => updateLocalNested('appearance.typography.terminalFontFamily', e.target.value)}
                          className="glass-input w-full font-mono text-xs"
                        >
                          <option value="courier-new, courier, monospace">Courier New</option>
                          <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                          <option value="'Geist Mono', monospace">Geist Mono</option>
                          <option value="'Fira Code', monospace">Fira Code</option>
                        </select>
                      </div>

                      {/* Terminal Font Size */}
                      <div 
                        id="typo-term-size"
                        className={`space-y-2 p-2 rounded transition-all duration-300 ${
                          highlightedOptionId === 'typo-term-size' 
                            ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                            : 'border border-transparent'
                        }`}
                      >
                        <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Terminal Font Size ({localSettings.appearance.typography.terminalFontSize}px)</label>
                        <input 
                          type="number" min="9" max="24"
                          value={localSettings.appearance.typography.terminalFontSize}
                          onChange={(e) => updateLocalNested('appearance.typography.terminalFontSize', parseInt(e.target.value) || 12)}
                          className="glass-input w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeAppearanceSubTab === 'layout' && (
                  <div className="space-y-6 max-w-xl animate-in fade-in duration-150">

                    <div 
                      id="layout-mode"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'layout-mode' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Pane Split Direction Defaults</label>
                      <select 
                        value={localSettings.appearance.layout.layoutMode || 'grid'}
                        onChange={(e) => updateLocalNested('appearance.layout.layoutMode', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="grid" className="bg-[#0f0f15]">Auto Grid</option>
                        <option value="vertical" className="bg-[#0f0f15]">Force Columns (Vertical)</option>
                        <option value="horizontal" className="bg-[#0f0f15]">Force Rows (Horizontal)</option>
                        <option value="flexible" className="bg-[#0f0f15]">Flexible Pane Layout</option>
                      </select>
                    </div>

                    <div 
                      id="layout-sidebar-width"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'layout-sidebar-width' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Sidebar Width Limit ({localSettings.appearance.layout.sidebarWidth || 490}px)</label>
                      <input 
                        type="range" min="220" max="500" step="10"
                        value={localSettings.appearance.layout.sidebarWidth || 490}
                        onChange={(e) => updateLocalNested('appearance.layout.sidebarWidth', parseInt(e.target.value))}
                        className="w-full h-1 bg-[#1a1a24] rounded-lg appearance-none cursor-pointer accent-accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-zinc-555 font-sans">
                        <span>Min: 220px</span>
                        <span>Max: 500px</span>
                      </div>
                    </div>

                    <div 
                      id="layout-panel-height"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'layout-panel-height' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Top Panel Height Bound ({localSettings.appearance.layout.topPanelHeight || 320}px)</label>
                      <input 
                        type="range" min="180" max="800" step="20"
                        value={localSettings.appearance.layout.topPanelHeight || 320}
                        onChange={(e) => updateLocalNested('appearance.layout.topPanelHeight', parseInt(e.target.value))}
                        className="w-full h-1 bg-[#1a1a24] rounded-lg appearance-none cursor-pointer accent-accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-zinc-555 font-sans">
                        <span>Min: 180px</span>
                        <span>Max: 800px</span>
                      </div>
                    </div>

                    <div 
                      id="layout-titlebar"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'layout-titlebar' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-350 font-medium block">Show Split Pane Title Bars</label>
                        <p className="text-[10px] text-zinc-555">Display action headers on nested split terminal views.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.layout.showTerminalTitleBar}
                        onChange={(e) => updateLocalNested('appearance.layout.showTerminalTitleBar', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {activeAppearanceSubTab === 'workspace' && (
                  <div className="space-y-6 max-w-xl animate-in fade-in duration-150">

                    <div 
                      id="work-git"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'work-git' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Show Active Git Branch</label>
                        <p className="text-[10px] text-zinc-555">Render current directory git branch inside status bars.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.workspace.showGitBranch}
                        onChange={(e) => updateLocalNested('appearance.workspace.showGitBranch', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="work-minimap"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'work-minimap' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Show Text Code Minimap</label>
                        <p className="text-[10px] text-zinc-555">Overlay a micro scroll summary in diff workspaces.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.workspace.showMinimap}
                        onChange={(e) => updateLocalNested('appearance.workspace.showMinimap', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="work-actbar"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'work-actbar' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Show Left Activity Bar</label>
                        <p className="text-[10px] text-zinc-555">Display the vertical workspace selector navigation strip.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.workspace.showActivityBar}
                        onChange={(e) => updateLocalNested('appearance.workspace.showActivityBar', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="work-statusbar"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'work-statusbar' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Show Bottom Status Bar</label>
                        <p className="text-[10px] text-zinc-555">Display task counts, active workspaces, and git labels.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.workspace.showStatusBar}
                        onChange={(e) => updateLocalNested('appearance.workspace.showStatusBar', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="work-spacing"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'work-spacing' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Pane Spacing Gap ({localSettings.appearance.workspace.paneSpacing}px)</label>
                      <input 
                        type="range" min="0" max="24" step="2"
                        value={localSettings.appearance.workspace.paneSpacing}
                        onChange={(e) => updateLocalNested('appearance.workspace.paneSpacing', parseInt(e.target.value))}
                        className="w-full h-1 bg-[#1a1a24] rounded-lg appearance-none cursor-pointer accent-accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-zinc-550 font-sans">
                        <span>Flush (0px)</span>
                        <span>Max: 24px</span>
                      </div>
                    </div>

                    <div 
                      id="work-sidebar-pos"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'work-sidebar-pos' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Agent Inspector Sidebar Position</label>
                      <select 
                        value={localSettings.appearance.workspace.sidebarPosition || 'left'}
                        onChange={(e) => updateLocalNested('appearance.workspace.sidebarPosition', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="left" className="bg-[#0f0f15]">Left Side Dock</option>
                        <option value="right" className="bg-[#0f0f15]">Right Side Dock</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeAppearanceSubTab === 'terminal' && (
                  <div className="space-y-6 max-w-xl animate-in fade-in duration-150">

                    <div 
                      id="term-cursor"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'term-cursor' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Terminal Cursor Style</label>
                      <select 
                        value={localSettings.appearance.terminal.cursorStyle}
                        onChange={(e) => updateLocalNested('appearance.terminal.cursorStyle', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="block" className="bg-[#0f0f15]">Solid Block</option>
                        <option value="underline" className="bg-[#0f0f15]">Underline</option>
                        <option value="bar" className="bg-[#0f0f15]">Vertical Bar</option>
                      </select>
                    </div>

                    <div 
                      id="term-blink"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'term-blink' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-350 font-medium block">Cursor Blink Animation</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Pulse terminal cursor elements inside focus blocks.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.terminal.cursorBlink}
                        onChange={(e) => updateLocalNested('appearance.terminal.cursorBlink', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="term-copy"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'term-copy' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-350 font-medium block">Copy to Clipboard on Select</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Instantly copy selected characters into the operating system clipboard.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.terminal.copyOnSelect}
                        onChange={(e) => updateLocalNested('appearance.terminal.copyOnSelect', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="term-bell"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'term-bell' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Terminal Alert Bell Style</label>
                      <select 
                        value={localSettings.appearance.terminal.bellStyle || 'none'}
                        onChange={(e) => updateLocalNested('appearance.terminal.bellStyle', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="none" className="bg-[#0f0f15]">Quiet Mode (Bell Off)</option>
                        <option value="sound" className="bg-[#0f0f15]">System Sound Bell</option>
                        <option value="visual" className="bg-[#0f0f15]">Visual Accent Pulse</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeAppearanceSubTab === 'agents' && (
                  <div className="space-y-6 max-w-xl animate-in fade-in duration-150">

                    <div 
                      id="agent-avatar"
                      className={`space-y-2 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'agent-avatar' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20 shadow-glow' 
                          : 'border border-transparent'
                      }`}
                    >
                      <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Agent Avatar Icon Rendering</label>
                      <select 
                        value={localSettings.appearance.agent.avatarStyle || 'initials'}
                        onChange={(e) => updateLocalNested('appearance.agent.avatarStyle', e.target.value)}
                        className="glass-input w-full"
                      >
                        <option value="initials" className="bg-[#0f0f15]">Initials (e.g., CL, AD)</option>
                        <option value="icon" className="bg-[#0f0f15]">Standard Bot SVG Icon</option>
                        <option value="identicon" className="bg-[#0f0f15]">Dynamic Identicon Code Hash</option>
                      </select>
                    </div>

                    <div 
                      id="agent-badge"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'agent-badge' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-350 font-medium block">Show Status Circle Badge</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Add glowing color indicator over agent cards based on running states.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.agent.showAgentStatusBadge}
                        onChange={(e) => updateLocalNested('appearance.agent.showAgentStatusBadge', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="agent-anim"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'agent-anim' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Animate Agent Grid Transitions</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Smooth scale adjustments and slide triggers inside active agent lists.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.agent.animateAgentTransitions}
                        onChange={(e) => updateLocalNested('appearance.agent.animateAgentTransitions', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="agent-compact"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'agent-compact' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Compact Agent Card Density</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Truncate descriptive fields to fit more agents on single displays.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.agent.compactCards}
                        onChange={(e) => updateLocalNested('appearance.agent.compactCards', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {activeAppearanceSubTab === 'accessibility' && (
                  <div className="space-y-6 max-w-xl animate-in fade-in duration-150">

                    <div 
                      id="acc-reader"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'acc-reader' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Screen Reader Mode</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Expose accessibility node labels on interactive charts and panels.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.accessibility.screenReaderMode}
                        onChange={(e) => updateLocalNested('appearance.accessibility.screenReaderMode', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="acc-contrast"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'acc-contrast' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">High Contrast Visuals</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Force background properties to pure black or pure white offsets.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.accessibility.highContrastMode}
                        onChange={(e) => updateLocalNested('appearance.accessibility.highContrastMode', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="acc-motion"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'acc-motion' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Reduced Motion Settings</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Disable all visual panel translations and heavy animation loops.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.accessibility.reducedMotion}
                        onChange={(e) => {
                          updateLocalNested('appearance.accessibility.reducedMotion', e.target.checked);
                          if (e.target.checked) {
                            updateLocalNested('appearance.theme.animationLevel', 'none');
                          }
                        }}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="acc-disable-glassmorphism"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'acc-disable-glassmorphism' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Disable Glassmorphism (Performance Mode)</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Turn off all backdrop blurs and transparency effects to optimize GPU compositing.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.accessibility.disableGlassmorphism || false}
                        onChange={(e) => {
                          updateLocalNested('appearance.accessibility.disableGlassmorphism', e.target.checked);
                        }}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="acc-increase-contrast"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'acc-increase-contrast' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Increase Border Contrast Ratio</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Darken pane separation outlines and border values for high legibility.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.accessibility.increaseContrast}
                        onChange={(e) => updateLocalNested('appearance.accessibility.increaseContrast', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>

                    <div 
                      id="acc-bell"
                      className={`flex items-center justify-between py-2 border-b border-[#232329]/30 p-2 rounded transition-all duration-300 ${
                        highlightedOptionId === 'acc-bell' 
                          ? 'bg-accent-primary/10 ring-1 ring-accent-primary/30 border border-accent-primary/20' 
                          : 'border border-transparent'
                      }`}
                    >
                      <div className="font-sans">
                        <label className="text-xs text-zinc-355 font-medium block">Screen Flashes on System Bell</label>
                        <p className="text-[10px] text-zinc-555 font-medium">Flash active workspace borders during system sound triggers.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={localSettings.appearance.accessibility.accessibleTermBell}
                        onChange={(e) => updateLocalNested('appearance.accessibility.accessibleTermBell', e.target.checked)}
                        className="w-4 h-4 rounded accent-accent-primary cursor-pointer"
                      />
                    </div>
                    </div>
                  )}
                </div>

                {/* 45% Live Preview Section */}
                <div className="w-[45%] bg-[#020203]/25 p-8 flex flex-col items-center justify-center relative overflow-y-auto" style={{
                  backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
                  backgroundSize: '16px 16px'
                }}>
                  {/* Style definition for keyframes */}
                  <style dangerouslySetInnerHTML={{__html: `
                    @keyframes preview-cursor-blink {
                      0%, 100% { opacity: 1; }
                      50% { opacity: 0; }
                    }
                    .animate-cursor-blink {
                      animation: preview-cursor-blink 1s step-end infinite;
                    }
                  `}} />

                  {/* Live Preview Panel Card */}
                  <div className="w-full max-w-[350px] p-4 bg-[#08080c]/60 border border-white/[0.08] rounded-xl flex flex-col gap-4 shadow-2xl relative select-none">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Eye size={12} className="text-zinc-400" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-sans">Live Preview</span>
                      </div>
                      <span className="text-[8px] bg-accent-primary/10 text-accent-primary border border-accent-primary/20 px-1.5 py-0.5 rounded font-mono font-semibold animate-pulse">
                        Active
                      </span>
                    </div>

                    {/* Window Frame Mockup */}
                    <div 
                      className="w-full aspect-[4/3] flex flex-col border overflow-hidden shadow-lg transition-all duration-300"
                      style={{
                        backgroundColor: hexToRgba(getThemeData(localSettings.appearance.theme.theme).bg, localSettings.appearance.theme.transparency / 100),
                        backdropFilter: (localSettings.appearance.theme.backgroundBlur === 'low' ? 'blur(6px)' : localSettings.appearance.theme.backgroundBlur === 'high' ? 'blur(24px)' : 'blur(12px)'),
                        borderRadius: getCornerRadiusValue(localSettings.appearance.theme.cornerRadius),
                        borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
                        color: getThemeData(localSettings.appearance.theme.theme).text
                      }}
                    >
                      {/* Window Header */}
                      <div className="h-6 flex items-center justify-between border-b px-2 select-none" style={{ 
                        borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                        backgroundColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'
                      }}>
                        {/* OS dots */}
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#ff5f56]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#ffbd2e]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f]" />
                        </div>
                        {/* Title */}
                        <span className="text-[7px] text-zinc-500 font-sans tracking-wide">
                          nexora-workspace
                        </span>
                        {/* Empty right block */}
                        <div className="w-9" />
                      </div>

                      {/* Main Workspace split row */}
                      <div className="flex-1 flex min-h-0 relative">
                        
                        {/* 1. Activity Bar */}
                        {localSettings.appearance.workspace.showActivityBar && (
                          <div 
                            className="w-5 flex flex-col items-center py-1.5 gap-2 border-r"
                            style={{ 
                              borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                              backgroundColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)'
                            }}
                          >
                            <div className="w-2.5 h-2.5 rounded flex items-center justify-center" style={{ backgroundColor: getAccentColorHex(localSettings.appearance.theme.accentColor, localSettings.appearance.theme.customAccentColor) }}>
                              <Layers size={6} className="text-white" />
                            </div>
                            <div className="w-2.5 h-2.5 rounded bg-zinc-700/30 flex items-center justify-center">
                              <Terminal size={6} className="text-zinc-500" />
                            </div>
                            <div className="w-2.5 h-2.5 rounded bg-zinc-700/30 flex items-center justify-center mt-auto">
                              <Cpu size={6} className="text-zinc-500" />
                            </div>
                          </div>
                        )}

                        {/* 2. File Explorer / Agent Sidebar */}
                        <div 
                          className="flex-1 flex min-h-0"
                          style={{
                            flexDirection: localSettings.appearance.workspace.sidebarPosition === 'right' ? 'row-reverse' : 'row'
                          }}
                        >
                          {/* Sidebar Container */}
                          <div 
                            className="w-18 flex flex-col p-1.5 gap-1.5 border-r"
                            style={{ 
                              borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                              backgroundColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)',
                              borderLeftWidth: localSettings.appearance.workspace.sidebarPosition === 'right' ? '1px' : '0px',
                              borderRightWidth: localSettings.appearance.workspace.sidebarPosition === 'right' ? '0px' : '1px'
                            }}
                          >
                            <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider font-sans">Agents</span>
                            
                            {/* Mock Agent 1 */}
                            <div className="flex items-center gap-1.5">
                              <div className="relative">
                                {(() => {
                                  const avatarStyle = localSettings.appearance.agent.avatarStyle || 'initials';
                                  const accentHex = getAccentColorHex(localSettings.appearance.theme.accentColor, localSettings.appearance.theme.customAccentColor);
                                  if (avatarStyle === 'icon') {
                                    return (
                                      <div className="w-4.5 h-4.5 rounded bg-white/5 flex items-center justify-center text-zinc-400 border border-white/[0.05]">
                                        <Cpu size={8} />
                                      </div>
                                    );
                                  }
                                  if (avatarStyle === 'identicon') {
                                    return (
                                      <div className="w-4.5 h-4.5 rounded overflow-hidden grid grid-cols-2 gap-[0.5px] p-[0.5px] bg-white/5 border border-white/[0.05]">
                                        <div style={{ backgroundColor: accentHex }} className="opacity-80" />
                                        <div className="bg-zinc-700 opacity-60" />
                                        <div className="bg-zinc-600 opacity-40" />
                                        <div style={{ backgroundColor: accentHex }} className="opacity-90" />
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="w-4.5 h-4.5 rounded bg-white/5 flex items-center justify-center text-[7px] font-bold text-zinc-400 border border-white/[0.05]">
                                      CO
                                    </div>
                                  );
                                })()}
                                {localSettings.appearance.agent.showAgentStatusBadge && (
                                  <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 border border-black/40 animate-pulse" />
                                )}
                              </div>
                              <span className="text-[7px] text-zinc-400 truncate max-w-[38px] font-sans">Coder</span>
                            </div>
                            
                            {/* Mock Agent 2 */}
                            <div className="flex items-center gap-1.5">
                              <div className="relative">
                                {(() => {
                                  const avatarStyle = localSettings.appearance.agent.avatarStyle || 'initials';
                                  const accentHex = getAccentColorHex(localSettings.appearance.theme.accentColor, localSettings.appearance.theme.customAccentColor);
                                  if (avatarStyle === 'icon') {
                                    return (
                                      <div className="w-4.5 h-4.5 rounded bg-white/5 flex items-center justify-center text-zinc-400 border border-white/[0.05]">
                                        <Cpu size={8} />
                                      </div>
                                    );
                                  }
                                  if (avatarStyle === 'identicon') {
                                    return (
                                      <div className="w-4.5 h-4.5 rounded overflow-hidden grid grid-cols-2 gap-[0.5px] p-[0.5px] bg-white/5 border border-white/[0.05]">
                                        <div style={{ backgroundColor: accentHex }} className="opacity-80" />
                                        <div className="bg-zinc-700 opacity-60" />
                                        <div className="bg-zinc-600 opacity-40" />
                                        <div style={{ backgroundColor: accentHex }} className="opacity-90" />
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="w-4.5 h-4.5 rounded bg-white/5 flex items-center justify-center text-[7px] font-bold text-zinc-400 border border-white/[0.05]">
                                      PL
                                    </div>
                                  );
                                })()}
                                {localSettings.appearance.agent.showAgentStatusBadge && (
                                  <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 border border-black/40" />
                                )}
                              </div>
                              <span className="text-[7px] text-zinc-400 truncate max-w-[38px] font-sans">Planner</span>
                            </div>
                          </div>

                          {/* 3. Editor & Terminal Workspace */}
                          <div className="flex-1 flex flex-col min-h-0">
                            
                            {/* Mock Editor */}
                            <div className="flex-1 flex flex-col min-h-0 bg-white/[0.005]">
                              {/* Editor Tabs */}
                              <div className="h-5 border-b flex items-center justify-between" style={{ borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
                                <div className="flex h-full">
                                  <div 
                                    className="px-2 h-full text-[7.5px] text-zinc-200 border-t flex items-center gap-1 bg-white/[0.02]"
                                    style={{ borderTopColor: getAccentColorHex(localSettings.appearance.theme.accentColor, localSettings.appearance.theme.customAccentColor) }}
                                  >
                                    <FileCode2 size={8} style={{ color: getAccentColorHex(localSettings.appearance.theme.accentColor, localSettings.appearance.theme.customAccentColor) }} />
                                    <span>main.tsx</span>
                                  </div>
                                  <div className="px-2 h-full text-[7.5px] text-zinc-500 flex items-center gap-1">
                                    <span>styles.css</span>
                                  </div>
                                </div>
                              </div>

                              {/* Editor Content Area */}
                              <div className="flex-1 flex min-h-0">
                                <div 
                                  className="flex-1 p-2 leading-normal overflow-hidden select-none whitespace-pre"
                                  style={{
                                    fontFamily: localSettings.appearance.typography.codeFontFamily,
                                    fontSize: Math.max(7, Math.min(11, localSettings.appearance.typography.codeFontSize * 0.65)),
                                    lineHeight: '1.2'
                                  }}
                                >
                                  <div>
                                    <span className="text-purple-400 font-semibold">const</span>{' '}
                                    <span style={{ color: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? '#2563eb' : getAccentColorHex(localSettings.appearance.theme.accentColor, localSettings.appearance.theme.customAccentColor) }}>agent</span>{' '}
                                    = <span className="text-emerald-400">"Coder"</span>;
                                  </div>
                                  <div>
                                    <span className="text-purple-400 font-semibold">if</span> (running) {'{'}
                                  </div>
                                  <div className="pl-2">
                                    <span>console.log(agent);</span>
                                  </div>
                                  <div>{'}'}</div>
                                </div>

                                {/* Minimap */}
                                {localSettings.appearance.workspace.showMinimap && (
                                  <div className="w-3 border-l flex flex-col gap-[1.5px] p-[1.5px] opacity-35 bg-white/[0.01]" style={{ borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
                                    <div className="h-0.5 bg-zinc-500 rounded-sm" />
                                    <div className="h-1 bg-zinc-500 rounded-sm w-[75%]" />
                                    <div className="h-0.5 bg-zinc-500 rounded-sm" />
                                    <div className="h-1 bg-zinc-500 rounded-sm w-[90%]" />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Separator / Spacer gap */}
                            <div 
                              style={{ 
                                height: `calc(${localSettings.appearance.workspace.paneSpacing}px * 0.15)`,
                                backgroundColor: 'transparent'
                              }} 
                            />

                            {/* Mock Terminal */}
                            <div className="h-[75px] border-t flex flex-col bg-black/[0.15]" style={{ borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
                              {/* Terminal Header */}
                              {localSettings.appearance.layout.showTerminalTitleBar && (
                                <div className="h-4.5 px-1.5 flex items-center justify-between bg-white/[0.01] border-b" style={{ borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
                                  <span className="text-[6px] text-zinc-500 font-sans font-semibold uppercase">terminal (zsh)</span>
                                </div>
                              )}
                              
                              {/* Terminal Content */}
                              <div 
                                className="flex-1 p-1.5 select-none leading-normal"
                                style={{
                                  fontFamily: localSettings.appearance.typography.terminalFontFamily,
                                  fontSize: Math.max(6.5, Math.min(10.5, localSettings.appearance.typography.terminalFontSize * 0.65)),
                                  color: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? '#27272a' : '#e4e4e7',
                                  lineHeight: '1.2'
                                }}
                              >
                                <div className="flex items-center gap-0.5">
                                  <span style={{ color: getAccentColorHex(localSettings.appearance.theme.accentColor, localSettings.appearance.theme.customAccentColor) }} className="font-bold">~ $ </span>
                                  <span>nexora dev</span>
                                </div>
                                <div className="text-zinc-500">✔ Loaded plugins</div>
                                <div className="flex items-center">
                                  <span>Listening on :3000</span>
                                  {(() => {
                                    const cursorStyle = localSettings.appearance.terminal.cursorStyle;
                                    const cursorBlink = localSettings.appearance.terminal.cursorBlink;
                                    const accentHex = getAccentColorHex(localSettings.appearance.theme.accentColor, localSettings.appearance.theme.customAccentColor);
                                    let cursorClass = "inline-block align-middle ml-0.5 ";
                                    if (cursorBlink) {
                                      cursorClass += "animate-cursor-blink";
                                    }
                                    let style: React.CSSProperties = {
                                      backgroundColor: accentHex,
                                    };
                                    if (cursorStyle === 'block') {
                                      style.width = '6px';
                                      style.height = '11px';
                                    } else if (cursorStyle === 'underline') {
                                      style.width = '6px';
                                      style.height = '2px';
                                      style.marginTop = '9px';
                                    } else { // 'bar'
                                      style.width = '2px';
                                      style.height = '11px';
                                    }
                                    return <span className={cursorClass} style={style} />;
                                  })()}
                                </div>
                              </div>
                            </div>

                          </div>
                        </div>

                      </div>

                      {/* Mock Status Bar */}
                      {localSettings.appearance.workspace.showStatusBar && (
                        <div 
                          className="h-3.5 px-1.5 border-t flex items-center justify-between text-[5.5px] text-zinc-500 font-sans select-none" 
                          style={{ 
                            borderColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                            backgroundColor: getThemeData(localSettings.appearance.theme.theme).id === 'Light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                            <span>Preview Online</span>
                          </div>
                          {localSettings.appearance.workspace.showGitBranch && (
                            <div className="flex items-center gap-0.5 opacity-85">
                              <span className="font-mono">git:</span>
                              <span className="font-semibold text-zinc-400">main</span>
                            </div>
                          )}
                        </div>
                      )}

                    </div>

                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Reset & Save Controls */}
          <div className="p-4 border-t border-border-glass bg-[#08080c]/60 flex items-center justify-between select-none">
            
            {/* Multi-tier Resets layout */}
            <div className="flex gap-2.5 items-center font-sans">
              <button 
                onClick={handleResetSection}
                className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-semibold cursor-pointer"
                title="Reset active tab settings"
              >
                <RotateCcw size={12} /> Reset Section
              </button>
              <span className="text-zinc-700 text-[10px]">|</span>
              <button 
                onClick={handleResetAppearance}
                className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-350 transition-colors font-semibold cursor-pointer"
                title="Reset all visuals themes"
              >
                <RotateCcw size={12} /> Reset Appearance
              </button>
              <span className="text-zinc-700 text-[10px]">|</span>
              <button 
                onClick={handleResetAll}
                className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-rose-455 transition-colors font-bold cursor-pointer"
                title="Reset all settings to original defaults"
              >
                <RotateCcw size={12} /> Reset All
              </button>
            </div>

            {/* Cancel/Save */}
            <div className="flex gap-2.5 font-sans">
              <button 
                onClick={() => setSettingsModalOpen(false)}
                className="glass-button glass-button--ghost py-1.5 px-5 cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="glass-button glass-button--primary py-1.5 px-5 cursor-pointer text-xs flex items-center gap-1.5 font-semibold"
              >
                <Save size={13} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
