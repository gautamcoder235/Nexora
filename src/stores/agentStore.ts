/**
 * Nexora — Agent Store (Zustand)
 *
 * Manages detected AI coding agents, active instances, and conversation logs.
 */
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AgentInfo, AgentType, AgentStatus } from '../types/agent';

interface BackendAgentInfo {
  name: string;
  binary_path: string;
  version: string | null;
  agent_type: string;
}

interface AgentState {
  /** List of detected CLI agents */
  agents: AgentInfo[];
  /** Whether the detection scan is in progress */
  isScanning: boolean;

  // --- Actions ---
  /** Scan the PATH for installed coding CLI agents */
  detectAgents: () => Promise<void>;
  /** Update status of a specific agent */
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  isScanning: false,

  detectAgents: async () => {
    set({ isScanning: true });
    try {
      // Invoke Tauri command to scan PATH
      const backendAgents = await invoke<BackendAgentInfo[]>('detect_agents');
      const mappedAgents: AgentInfo[] = backendAgents.map((ba) => {
        let type: AgentType = 'other';
        if (ba.agent_type === 'ClaudeCode') type = 'claude-code';
        else if (ba.agent_type === 'Codex') type = 'codex';
        else if (ba.agent_type === 'GeminiCli') type = 'gemini-cli';
        else if (ba.agent_type === 'Aider') type = 'aider';
        else if (ba.agent_type === 'OpenCode') type = 'opencode';

        return {
          id: `agent-${ba.name.toLowerCase().replace(/\s+/g, '-')}`,
          name: ba.name,
          type,
          binaryPath: ba.binary_path,
          version: ba.version,
          status: 'available', // Detected CLI agents are ready/available
        };
      });

      set({ agents: mappedAgents, isScanning: false });
    } catch (err) {
      console.error('Failed to detect installed agents:', err);
      set({ isScanning: false });
    }
  },

  updateAgentStatus: (agentId, status) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === agentId ? { ...a, status } : a)),
    })),
}));
