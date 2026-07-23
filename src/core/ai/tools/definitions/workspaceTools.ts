import { invoke } from '@tauri-apps/api/core';
import { ToolDefinition } from '../../protocol';
import { ExecutionContext, RegisteredTool } from '../ToolRegistry';

const fileReadDef: ToolDefinition = {
  id: 'file.read',
  name: 'Read File',
  description: 'Read file content from workspace',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path']
  },
  riskLevel: 'read',
  timeoutMs: 5000,
  streamable: false,
  supportsCancel: true,
  category: 'workspace'
};

const fileWriteDef: ToolDefinition = {
  id: 'file.write',
  name: 'Write File',
  description: 'Write content to a file',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' }, content: { type: 'string' } },
    required: ['path', 'content']
  },
  riskLevel: 'write',
  timeoutMs: 10000,
  streamable: false,
  supportsCancel: true,
  category: 'workspace'
};

const workspaceSearchDef: ToolDefinition = {
  id: 'workspace.search',
  name: 'Search Workspace',
  description: 'Search files by name pattern',
  inputSchema: {
    type: 'object',
    properties: { pattern: { type: 'string' } },
    required: ['pattern']
  },
  riskLevel: 'read',
  timeoutMs: 15000,
  streamable: false,
  supportsCancel: true,
  category: 'workspace'
};

const searchCodeDef: ToolDefinition = {
  id: 'search.code',
  name: 'Search Code',
  description: 'Search code content with grep',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  },
  riskLevel: 'read',
  timeoutMs: 20000,
  streamable: false,
  supportsCancel: true,
  category: 'workspace'
};

export const workspaceTools: RegisteredTool[] = [
  {
    definition: fileReadDef,
    executor: async (args, context) => {
      const content = await invoke<string>('read_project_file', { path: args.path, workspace: context.workspacePath });
      return {
        proposalId: '',
        toolId: fileReadDef.id,
        status: 'success',
        output: content,
        durationMs: 0
      };
    }
  },
  {
    definition: fileWriteDef,
    executor: async (args, context) => {
      await invoke('write_project_file', { path: args.path, content: args.content, workspace: context.workspacePath });
      return {
        proposalId: '',
        toolId: fileWriteDef.id,
        status: 'success',
        output: 'File written successfully',
        durationMs: 0
      };
    }
  },
  {
    definition: workspaceSearchDef,
    executor: async (args, context) => {
      const files = await invoke<string[]>('list_directory', { pattern: args.pattern, workspace: context.workspacePath });
      return {
        proposalId: '',
        toolId: workspaceSearchDef.id,
        status: 'success',
        output: JSON.stringify(files),
        durationMs: 0
      };
    }
  },
  {
    definition: searchCodeDef,
    executor: async (args, context) => {
      const results = await invoke<string>('search_in_files', { query: args.query, workspace: context.workspacePath });
      return {
        proposalId: '',
        toolId: searchCodeDef.id,
        status: 'success',
        output: results,
        durationMs: 0
      };
    }
  }
];
