import { invoke } from '@tauri-apps/api/core';
import { ToolDefinition } from '../../protocol';
import { RegisteredTool } from '../ToolRegistry';

const terminalExecDef: ToolDefinition = {
  id: 'terminal.exec',
  name: 'Execute Command',
  description: 'Execute a command in a terminal session',
  inputSchema: {
    type: 'object',
    properties: { sessionId: { type: 'string' }, command: { type: 'string' } },
    required: ['sessionId', 'command']
  },
  riskLevel: 'terminal',
  timeoutMs: 60000,
  streamable: true,
  supportsCancel: true,
  category: 'terminal'
};

const terminalStopDef: ToolDefinition = {
  id: 'terminal.stop',
  name: 'Stop Terminal',
  description: 'Stop or kill a running terminal process',
  inputSchema: {
    type: 'object',
    properties: { sessionId: { type: 'string' } },
    required: ['sessionId']
  },
  riskLevel: 'terminal',
  timeoutMs: 5000,
  streamable: false,
  supportsCancel: false,
  category: 'terminal'
};

const agentSpawnDef: ToolDefinition = {
  id: 'agent.spawn',
  name: 'Spawn Agent',
  description: 'Spawn a new agent terminal',
  inputSchema: {
    type: 'object',
    properties: { role: { type: 'string' }, prompt: { type: 'string' } },
    required: ['role', 'prompt']
  },
  riskLevel: 'terminal',
  timeoutMs: 10000,
  streamable: false,
  supportsCancel: false,
  category: 'terminal'
};

const agentMessageDef: ToolDefinition = {
  id: 'agent.message',
  name: 'Message Agent',
  description: 'Send a message to an agent terminal',
  inputSchema: {
    type: 'object',
    properties: { agentId: { type: 'string' }, message: { type: 'string' } },
    required: ['agentId', 'message']
  },
  riskLevel: 'safe',
  timeoutMs: 5000,
  streamable: false,
  supportsCancel: false,
  category: 'terminal'
};

const agentKillDef: ToolDefinition = {
  id: 'agent.kill',
  name: 'Kill Agent',
  description: 'Kill an agent terminal',
  inputSchema: {
    type: 'object',
    properties: { agentId: { type: 'string' } },
    required: ['agentId']
  },
  riskLevel: 'terminal',
  timeoutMs: 5000,
  streamable: false,
  supportsCancel: false,
  category: 'terminal'
};

export const terminalTools: RegisteredTool[] = [
  {
    definition: terminalExecDef,
    executor: async (args) => {
      await invoke('write_pty', { id: args.sessionId, data: args.command + '\n' });
      return { proposalId: '', toolId: terminalExecDef.id, status: 'success', output: 'Command sent to terminal', durationMs: 0 };
    }
  },
  {
    definition: terminalStopDef,
    executor: async (args) => {
      await invoke('kill_pty', { id: args.sessionId });
      return { proposalId: '', toolId: terminalStopDef.id, status: 'success', output: 'Terminal stopped', durationMs: 0 };
    }
  },
  {
    definition: agentSpawnDef,
    executor: async (args) => {
      const id = await invoke<string>('spawn_pty', { config: { role: args.role, prompt: args.prompt } });
      return { proposalId: '', toolId: agentSpawnDef.id, status: 'success', output: `Agent spawned with ID: ${id}`, durationMs: 0 };
    }
  },
  {
    definition: agentMessageDef,
    executor: async (args) => {
      await invoke('write_pty', { id: args.agentId, data: args.message + '\n' });
      return { proposalId: '', toolId: agentMessageDef.id, status: 'success', output: 'Message sent to agent', durationMs: 0 };
    }
  },
  {
    definition: agentKillDef,
    executor: async (args) => {
      await invoke('kill_pty', { id: args.agentId });
      return { proposalId: '', toolId: agentKillDef.id, status: 'success', output: 'Agent killed', durationMs: 0 };
    }
  }
];
