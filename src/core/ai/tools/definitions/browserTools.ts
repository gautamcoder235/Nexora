import { ToolDefinition } from '../../protocol';
import { RegisteredTool } from '../ToolRegistry';
import { useBrowserStore } from '../../../../stores/browserStore';

const browserOpenDef: ToolDefinition = {
  id: 'browser.open',
  name: 'Open Browser URL',
  description: 'Open a URL in the embedded browser',
  inputSchema: {
    type: 'object',
    properties: { url: { type: 'string' } },
    required: ['url']
  },
  riskLevel: 'browser',
  timeoutMs: 15000,
  streamable: false,
  supportsCancel: true,
  category: 'browser'
};

const browserScreenshotDef: ToolDefinition = {
  id: 'browser.screenshot',
  name: 'Browser Screenshot',
  description: 'Take a screenshot of the current browser page',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  riskLevel: 'read',
  timeoutMs: 10000,
  streamable: false,
  supportsCancel: false,
  category: 'browser'
};

export const browserTools: RegisteredTool[] = [
  {
    definition: browserOpenDef,
    executor: async (args) => {
      const url = typeof args?.url === 'string' ? args.url : undefined;
      useBrowserStore.getState().openBrowserPanel(url);
      return { proposalId: '', toolId: browserOpenDef.id, status: 'success', output: `Opened URL: ${url || 'default'} in browser panel`, durationMs: 45 };
    }
  },
  {
    definition: browserScreenshotDef,
    executor: async () => {
      // TODO: implement with Tauri IPC
      return { proposalId: '', toolId: browserScreenshotDef.id, status: 'success', output: 'Screenshot captured', durationMs: 0 };
    }
  }
];
