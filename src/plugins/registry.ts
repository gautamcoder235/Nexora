import { invoke } from "@tauri-apps/api/core";
import { AgentPlugin } from "./types";
import { claudePlugin } from "./claude";
import { aiderPlugin } from "./aider";
import { geminiPlugin } from "./gemini";
import { codexPlugin } from "./codex";
import { opencodePlugin } from "./opencode";
import { genericPlugin } from "./generic";

export class PluginRegistry {
  private static plugins: Map<string, AgentPlugin> = new Map([
    ["claude", claudePlugin],
    ["aider", aiderPlugin],
    ["gemini", geminiPlugin],
    ["codex", codexPlugin],
    ["opencode", opencodePlugin],
    ["generic", genericPlugin]
  ]);

  /**
   * Fetch plugin by ID (e.g. "claude"). Falls back to generic shell driver.
   */
  static get(id: string): AgentPlugin {
    return this.plugins.get(id) || genericPlugin;
  }

  /**
   * Return all registered driver plugins
   */
  static getAll(): AgentPlugin[] {
    return Array.from(this.plugins.values());
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
