import { ToolDefinition } from '../../protocol';
import { RegisteredTool } from '../ToolRegistry';

const memorySearchDef: ToolDefinition = {
  id: 'memory.search',
  name: 'Search Memory',
  description: 'Search project memory/knowledge base',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  },
  riskLevel: 'read',
  timeoutMs: 15000,
  streamable: false,
  supportsCancel: false,
  category: 'memory'
};

const memoryStoreDef: ToolDefinition = {
  id: 'memory.store',
  name: 'Store Memory',
  description: 'Store a new memory entry',
  inputSchema: {
    type: 'object',
    properties: { content: { type: 'string' }, category: { type: 'string' } },
    required: ['content', 'category']
  },
  riskLevel: 'write',
  timeoutMs: 10000,
  streamable: false,
  supportsCancel: false,
  category: 'memory'
};

export const memoryTools: RegisteredTool[] = [
  {
    definition: memorySearchDef,
    executor: async (args) => {
      // TODO: implement
      return { proposalId: '', toolId: memorySearchDef.id, status: 'success', output: `TODO: searched memory for ${args.query}`, durationMs: 0 };
    }
  },
  {
    definition: memoryStoreDef,
    executor: async (args) => {
      // TODO: implement
      return { proposalId: '', toolId: memoryStoreDef.id, status: 'success', output: `TODO: stored memory in category ${args.category}`, durationMs: 0 };
    }
  }
];
