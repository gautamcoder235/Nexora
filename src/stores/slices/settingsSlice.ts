import { StateCreator } from 'zustand';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../../types';
import { deepMerge } from '../../utils/object';
import { PluginRegistry } from '../../plugins';

export interface SettingsSlice {
  settings: AppSettings;
  isSettingsModalOpen: boolean;
  setSettingsModalOpen: (isOpen: boolean) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const createSettingsSlice: StateCreator<any, [], [], SettingsSlice> = (set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  isSettingsModalOpen: false,

  setSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen }),

  updateSettings: (updates) => {
    set((state: any) => {
      const merged = deepMerge(state.settings, updates);
      
      const updatedAgents = (state.agents || []).map((agent: any) => {
        const plugin = PluginRegistry.getPluginForAgent(agent.cliCommand, agent.arguments || []);
        if (plugin && plugin.id !== 'generic') {
          const overrides = merged.cliOverrides?.[plugin.id] || {};
          const cliCommand = overrides.cliCommand !== undefined ? overrides.cliCommand : plugin.cliCommand;
          const defaultArgs = overrides.defaultArgs !== undefined ? overrides.defaultArgs : plugin.defaultArgs;
          const name = overrides.name !== undefined ? overrides.name : agent.name;
          return {
            ...agent,
            name,
            cliCommand,
            arguments: defaultArgs || []
          };
        }

        const prevCustomCli = state.settings?.customCLIs?.find((c: any) => c.command === agent.cliCommand);
        if (prevCustomCli) {
          const newCustomCli = merged.customCLIs?.find((c: any) => c.id === prevCustomCli.id);
          if (newCustomCli) {
            return {
              ...agent,
              name: newCustomCli.name,
              cliCommand: newCustomCli.command,
              arguments: newCustomCli.args || []
            };
          }
        }

        return agent;
      });

      if (merged.appearance) {
        import('../../services/ThemeManager').then(({ ThemeManager }) => {
          ThemeManager.applyAppearance(merged.appearance, get().sidebarWidth, get().topPanelHeight);
        });
      }

      return { 
        settings: merged, 
        agents: updatedAgents 
      };
    });
    if (typeof get().saveSnapshot === 'function') {
      get().saveSnapshot();
    }
  },

  resetSettings: () => {
    set((state: any) => {
      const updatedAgents = (state.agents || []).map((agent: any) => {
        const plugin = PluginRegistry.getPluginForAgent(agent.cliCommand, agent.arguments || []);
        if (plugin && plugin.id !== 'generic') {
          const overrides = DEFAULT_APP_SETTINGS.cliOverrides?.[plugin.id] || {};
          const cliCommand = overrides.cliCommand !== undefined ? overrides.cliCommand : plugin.cliCommand;
          const defaultArgs = overrides.defaultArgs !== undefined ? overrides.defaultArgs : plugin.defaultArgs;
          const name = overrides.name !== undefined ? overrides.name : plugin.name;
          return {
            ...agent,
            name,
            cliCommand,
            arguments: defaultArgs || []
          };
        }
        return agent;
      });
      return { 
        settings: DEFAULT_APP_SETTINGS, 
        agents: updatedAgents 
      };
    });
    import('../../services/ThemeManager').then(({ ThemeManager }) => {
      ThemeManager.applyAppearance(DEFAULT_APP_SETTINGS.appearance, get().sidebarWidth, get().topPanelHeight);
    });
    if (typeof get().saveSnapshot === 'function') {
      get().saveSnapshot();
    }
  },
});
