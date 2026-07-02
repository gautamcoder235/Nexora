import { invoke } from "@tauri-apps/api/core";
import { AgentPlugin } from "./types";
import { claudePlugin } from "./claude";
import { agyPlugin } from "./agy";
import { codexPlugin } from "./codex";
import { opencodePlugin } from "./opencode";
import { genericPlugin } from "./generic";
import { nexoraPlugin } from "./nexora";

export class PluginRegistry {
  private static plugins: Map<string, AgentPlugin> = new Map([
    ["claude", claudePlugin],
    ["agy", agyPlugin],
    ["codex", codexPlugin],
    ["opencode", opencodePlugin],
    ["nexora", nexoraPlugin],
    ["generic", genericPlugin]
  ]);

  /**
   * Fetch plugin by ID (e.g. "claude"). Falls back to generic shell driver.
   * Dynamically merges any user overrides from the global orchestrator settings.
   */
  static get(id: string): AgentPlugin {
    const base = this.plugins.get(id) || genericPlugin;
    
    // Safely fetch overrides without creating a hard top-level circular dependency
    let overrides = {};
    try {
      const useOrchestratorStore = (window as any).__useOrchestratorStore;
      if (useOrchestratorStore) {
        overrides = useOrchestratorStore.getState().settings.cliOverrides?.[id] || {};
      }
    } catch (e) {
      // Store might not be initialized yet
    }

    return { ...base, ...overrides };
  }

  /**
   * Return all registered driver plugins, fully merged with their user overrides.
   */
  static getAll(): AgentPlugin[] {
    return Array.from(this.plugins.keys()).map(id => this.get(id));
  }

  /**
   * Resolve corresponding AgentPlugin by command and arguments prefix
   */
  static getPluginForAgent(cliCommand: string, agentArgs: string[]): AgentPlugin {
    const allPlugins = this.getAll();
    for (const plugin of allPlugins) {
      if (plugin.cliCommand === cliCommand) {
        if (cliCommand === 'npx') {
          const isClaude = agentArgs.some(arg => arg.includes('claudecode') || arg.includes('claude'));
          if (isClaude && plugin.id === 'claude') {
            return plugin;
          }
        } else {
          return plugin;
        }
      }
    }
    return this.get('generic');
  }

  /**
   * Check if a CLI command is installed on the user's OS PATH
   */
  static async checkInstalled(id: string): Promise<boolean> {
    const plugin = this.get(id);
    try {
      // Invoke native Rust command presence checker
      return await invoke<boolean>("check_cli_tool", { command: plugin.checkCmd });
    } catch (e) {
      console.warn(`Error running path checker for executable "${plugin.checkCmd}":`, e);
      return false;
    }
  }
}
