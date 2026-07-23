import { ToolDefinition } from '../../protocol';
import { RegisteredTool } from '../ToolRegistry';

const diagnosticsLintDef: ToolDefinition = {
  id: 'diagnostics.lint',
  name: 'Run Linter',
  description: 'Run linter on workspace',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  riskLevel: 'read',
  timeoutMs: 30000,
  streamable: true,
  supportsCancel: true,
  category: 'diagnostics'
};

const diagnosticsTestDef: ToolDefinition = {
  id: 'diagnostics.test',
  name: 'Run Tests',
  description: 'Run test suite',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  riskLevel: 'terminal',
  timeoutMs: 120000,
  streamable: true,
  supportsCancel: true,
  category: 'diagnostics'
};

const diagnosticsBuildDef: ToolDefinition = {
  id: 'diagnostics.build',
  name: 'Run Build',
  description: 'Run build command',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  riskLevel: 'terminal',
  timeoutMs: 120000,
  streamable: true,
  supportsCancel: true,
  category: 'diagnostics'
};

export const diagnosticTools: RegisteredTool[] = [
  {
    definition: diagnosticsLintDef,
    executor: async () => {
      // TODO: implement
      return { proposalId: '', toolId: diagnosticsLintDef.id, status: 'success', output: 'TODO: ran linter', durationMs: 0 };
    }
  },
  {
    definition: diagnosticsTestDef,
    executor: async () => {
      // TODO: implement
      return { proposalId: '', toolId: diagnosticsTestDef.id, status: 'success', output: 'TODO: ran tests', durationMs: 0 };
    }
  },
  {
    definition: diagnosticsBuildDef,
    executor: async () => {
      // TODO: implement
      return { proposalId: '', toolId: diagnosticsBuildDef.id, status: 'success', output: 'TODO: ran build', durationMs: 0 };
    }
  }
];
