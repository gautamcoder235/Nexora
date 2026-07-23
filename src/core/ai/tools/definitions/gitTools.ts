import { ToolDefinition } from '../../protocol';
import { RegisteredTool } from '../ToolRegistry';

const gitDiffDef: ToolDefinition = {
  id: 'git.diff',
  name: 'Git Diff',
  description: 'Get git diff of workspace changes',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  riskLevel: 'read',
  timeoutMs: 10000,
  streamable: false,
  supportsCancel: false,
  category: 'git'
};

const gitStatusDef: ToolDefinition = {
  id: 'git.status',
  name: 'Git Status',
  description: 'Get git status',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  riskLevel: 'read',
  timeoutMs: 10000,
  streamable: false,
  supportsCancel: false,
  category: 'git'
};

const gitCommitDef: ToolDefinition = {
  id: 'git.commit',
  name: 'Git Commit',
  description: 'Create a git commit',
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message']
  },
  riskLevel: 'write',
  timeoutMs: 20000,
  streamable: false,
  supportsCancel: false,
  category: 'git'
};

export const gitTools: RegisteredTool[] = [
  {
    definition: gitDiffDef,
    executor: async () => {
      // TODO: implement
      return { proposalId: '', toolId: gitDiffDef.id, status: 'success', output: 'TODO: git diff', durationMs: 0 };
    }
  },
  {
    definition: gitStatusDef,
    executor: async () => {
      // TODO: implement
      return { proposalId: '', toolId: gitStatusDef.id, status: 'success', output: 'TODO: git status', durationMs: 0 };
    }
  },
  {
    definition: gitCommitDef,
    executor: async (args) => {
      // TODO: implement
      return { proposalId: '', toolId: gitCommitDef.id, status: 'success', output: `TODO: git commit with message: ${args.message}`, durationMs: 0 };
    }
  }
];
