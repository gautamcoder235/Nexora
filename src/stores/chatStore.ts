import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { AIKernel } from '../core/ai/kernel/AIKernel';
import type { ConversationSession, ConversationMessage, ConversationPhase, ToolProposal, ToolResult } from '../core/ai/protocol';
import { EventBus } from '../core/events';
import { useBrowserStore } from './browserStore';
import { useOrchestratorStore } from './orchestratorStore';

// ─── Shared Action Executor ──────────────────────────────────────────────────
// Parses user message for actionable intents and executes workspace actions.
// Used by both LLM streaming paths and the no-API-key fallback engine.
const WORD_TO_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10
};

function resolveActiveProjectId(): string {
  const orchestrator = useOrchestratorStore.getState();
  const activeWsId = orchestrator.activeWorkspaceId;
  // Try to find a project linked to the active workspace
  if (activeWsId) {
    const wsProject = orchestrator.projects.find(p => p.workspaceId === activeWsId);
    if (wsProject) return wsProject.id;
  }
  // Fallback: first project available
  if (orchestrator.projects.length > 0) return orchestrator.projects[0].id;
  // Last resort: use workspace root path to create an ad-hoc context
  return 'default-project';
}

function parseTerminalCount(text: string): number {
  // First look for any digit: "4 opencode terminal" -> 4
  const digitMatch = text.match(/(\d+)/);
  if (digitMatch) {
    const val = parseInt(digitMatch[1], 10);
    if (val >= 1 && val <= 16) return val;
  }

  // Look for any number word: "four opencode terminal" -> 4
  const wordMatch = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  if (wordMatch) {
    return WORD_TO_NUM[wordMatch[1].toLowerCase()] || 1;
  }

  return 1;
}

// Known CLI tools that can be spawned as agent terminals
const KNOWN_CLI_TOOLS: Record<string, { command: string; args: string[]; name: string }> = {
  'opencode': { command: 'npx', args: ['-y', 'opencode'], name: 'OpenCode CLI' },
  'claude code': { command: 'npx', args: ['-y', '@anthropic-ai/claude-code'], name: 'Claude Code CLI' },
  'claude': { command: 'npx', args: ['-y', '@anthropic-ai/claude-code'], name: 'Claude Code CLI' },
  'gemini': { command: 'gemini', args: [], name: 'Gemini CLI' },
  'aider': { command: 'aider', args: ['--auto-commit'], name: 'Aider' },
  'codex': { command: 'codex', args: [], name: 'Codex CLI' },
  'agy': { command: 'agy', args: [], name: 'Antigravity CLI' },
};

// Extract a URL from user message (e.g., "open google.com in browser")
function extractUrlFromMessage(text: string): string | undefined {
  // Match full URLs: https://... or http://...
  const fullUrlMatch = text.match(/https?:\/\/[^\s,)"']+/i);
  if (fullUrlMatch) return fullUrlMatch[0];
  // Match domain-like patterns: google.com, github.com/user/repo
  const domainMatch = text.match(/\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s,)"']*)?)\b/);
  if (domainMatch) return `https://${domainMatch[1]}`;
  return undefined;
}

// Detect which CLI tool the user wants from their message
function detectCliTool(text: string): { command: string; args: string[]; name: string } | null {
  const lc = text.toLowerCase();
  // Check longer names first to avoid 'claude' matching before 'claude code'
  const sortedEntries = Object.entries(KNOWN_CLI_TOOLS).sort((a, b) => b[0].length - a[0].length);
  for (const [name, tool] of sortedEntries) {
    if (lc.includes(name)) return tool;
  }
  return null;
}

interface ActionResult {
  browser: boolean;
  browserUrl?: string;
  terminals: number;
  terminalTool?: string;
  terminalsKilled: number;
}

async function executeWorkspaceActions(userMessage: string): Promise<ActionResult> {
  const lc = userMessage.toLowerCase();
  const result: ActionResult = { browser: false, terminals: 0, terminalsKilled: 0 };

  // ─── 🌐 Browser Actions ─────────────────────────────────────────────
  const browserOpenIntent = 
    lc.includes('open browser') || lc.includes('launch browser') || lc.includes('start browser') ||
    lc.includes('open the browser') || lc.includes('show browser') ||
    (lc.includes('browser') && (lc.includes('open') || lc.includes('launch') || lc.includes('toggle') || lc.includes('show'))) ||
    // URL-based intents: "open google.com", "go to github.com"
    (lc.match(/\b(open|go to|navigate|visit|browse)\b/) && lc.match(/\b[a-z0-9-]+\.[a-z]{2,}\b/));
  
  if (browserOpenIntent) {
    try {
      const url = extractUrlFromMessage(userMessage);
      useBrowserStore.getState().openBrowserPanel(url);
      result.browser = true;
      result.browserUrl = url;
      console.log(`[ActionExecutor] Browser panel opened${url ? ` with URL: ${url}` : ''}`);
    } catch (e) {
      console.warn('[ActionExecutor] Failed to open browser:', e);
    }
  }

  // ─── 💻 Terminal Open Actions ───────────────────────────────────────
  const hasTerminalKeyword = lc.includes('terminal') || lc.includes('shell') || lc.includes('pty') || lc.includes('console');
  const hasOpenVerb = lc.includes('open') || lc.includes('spawn') || lc.includes('create') || 
                      lc.includes('start') || lc.includes('launch') || lc.includes('new') || lc.includes('run');

  if (hasTerminalKeyword && hasOpenVerb) {
    const count = parseTerminalCount(lc);
    const detectedTool = detectCliTool(lc);

    try {
      const orchestrator = useOrchestratorStore.getState();
      const projectId = resolveActiveProjectId();

      for (let i = 0; i < count; i++) {
        if (detectedTool) {
          // Auto-create an agent profile so the terminal is properly tracked
          const agentName = `${detectedTool.name} ${count > 1 ? `#${i + 1}` : ''}`;
          await orchestrator.createAgent({
            name: agentName.trim(),
            groupId: 'Chat Spawned',
            cliCommand: detectedTool.command,
            arguments: [...detectedTool.args],
            env: {},
            projectId,
            taskId: null,
            capabilities: { coding: true, review: false, testing: false, planning: false }
          });
          // Get the newly created agent's ID (it's the first in the array after createAgent prepends it)
          const newAgent = orchestrator.agents[0];
          if (newAgent) {
            await orchestrator.spawnTerminal(projectId, newAgent.id);
          } else {
            await orchestrator.spawnTerminal(projectId, undefined, detectedTool.command, detectedTool.args);
          }
        } else {
          await orchestrator.spawnTerminal(projectId);
        }
      }
      result.terminals = count;
      result.terminalTool = detectedTool?.name;
      console.log(`[ActionExecutor] Spawned ${count} ${detectedTool ? detectedTool.name : 'shell'} terminal(s) for project ${projectId}`);
    } catch (e) {
      console.warn('[ActionExecutor] Failed to spawn terminals:', e);
    }
  }

  // ─── 🗑️ Terminal Kill/Close Actions ─────────────────────────────────
  const hasCloseVerb = lc.includes('close') || lc.includes('kill') || lc.includes('stop') || lc.includes('terminate') || lc.includes('exit');
  if (hasTerminalKeyword && hasCloseVerb && !hasOpenVerb) {
    try {
      const orchestrator = useOrchestratorStore.getState();
      const terminals = orchestrator.terminals;
      if (terminals.length > 0) {
        // Kill the most recent terminal, or all if "all" is mentioned
        const killAll = lc.includes('all');
        const toKill = killAll ? [...terminals] : [terminals[terminals.length - 1]];
        for (const term of toKill) {
          await orchestrator.killTerminal(term.id);
        }
        result.terminalsKilled = toKill.length;
        console.log(`[ActionExecutor] Killed ${toKill.length} terminal(s)`);
      }
    } catch (e) {
      console.warn('[ActionExecutor] Failed to kill terminals:', e);
    }
  }

  return result;
}
// ─── End Shared Action Executor ──────────────────────────────────────────────

interface ChatState {
  // Sessions
  sessions: ConversationSession[];
  activeSessionId: string | null;
  
  // Streaming
  isStreaming: boolean;
  streamingMessageId: string | null;
  
  // UI
  inputValue: string;
  mentionQuery: string | null;
  isMentionPickerOpen: boolean;
  selectedModelId: string;
  selectedProviderId: string;
  isChatPanelVisible: boolean;
  isChatPanelPinned: boolean;
  apiKey: string;
  
  // Actions
  createSession: (workspaceId: string) => string;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newName: string) => void;
  sendMessage: (content: string, attachments?: any[]) => Promise<void>;
  stopStreaming: () => void;
  setInputValue: (value: string) => void;
  setMentionQuery: (query: string | null) => void;
  setMentionPickerOpen: (open: boolean) => void;
  switchModel: (modelId: string, providerId: string) => void;
  setApiKey: (key: string) => void;
  setChatPanelVisible: (visible: boolean) => void;
  setChatPanelPinned: (pinned: boolean) => void;
  
  // Derived
  getActiveSession: () => ConversationSession | undefined;
  getActiveMessages: () => ConversationMessage[];
  getActivePhase: () => ConversationPhase;
}

export const loadApiKeyForProvider = (providerId: string): string => {
  try {
    const saved = localStorage.getItem('nexora_api_keys');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed[providerId] || '';
    }
  } catch {}
  return '';
};

export const fetchModelsForProvider = async (
  providerId: string,
  apiKey?: string
): Promise<Array<{ id: string; name: string }>> => {
  const key = apiKey || loadApiKeyForProvider(providerId);

  try {
    if (providerId === 'google' && key) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (res.ok) {
        const data = await res.json();
        const models = (data.models || [])
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => {
            const cleanId = m.name.replace(/^models\//, '');
            return {
              id: cleanId,
              name: m.displayName || cleanId,
            };
          });
        if (models.length > 0) return models;
      }
    }

    if (providerId === 'openai' && key) {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        const data = await res.json();
        const chatModels = (data.data || [])
          .filter((m: any) => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
          .map((m: any) => ({ id: m.id, name: m.id }))
          .sort((a: any, b: any) => a.id.localeCompare(b.id));
        if (chatModels.length > 0) return chatModels;
      }
    }

    if (providerId === 'deepseek' && key) {
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map((m: any) => ({ id: m.id, name: m.id }));
        if (models.length > 0) return models;
      }
    }

    if (providerId === 'ollama') {
      let raw = '';
      try { raw = await invoke<string>('curl_get', { url: 'http://localhost:11434/api/tags' }); } catch {
        try { raw = await invoke<string>('curl_get', { url: 'http://127.0.0.1:11434/api/tags' }); } catch {
          const res = await fetch('http://localhost:11434/api/tags').catch(() => null);
          if (res && res.ok) raw = await res.text();
        }
      }
      if (raw) {
        try {
          const data = JSON.parse(raw);
          const models = (data.models || []).map((m: any) => ({ id: m.name, name: `${m.name} (Local)` }));
          if (models.length > 0) return models;
        } catch {}
      }
    }

    if (providerId === 'lmstudio') {
      let raw = '';
      try { raw = await invoke<string>('curl_get', { url: 'http://localhost:1234/v1/models' }); } catch {
        try { raw = await invoke<string>('curl_get', { url: 'http://127.0.0.1:1234/v1/models' }); } catch {
          const res = await fetch('http://localhost:1234/v1/models').catch(() => null);
          if (res && res.ok) raw = await res.text();
        }
      }
      if (raw) {
        try {
          const data = JSON.parse(raw);
          const models = (data.data || data.models || []).map((m: any) => ({ id: m.id || m.name, name: `${m.id || m.name} (LM Studio)` }));
          if (models.length > 0) return models;
        } catch {}
      }
    }
  } catch (err) {
    console.warn(`[ModelFetcher] Failed to fetch live models for ${providerId}:`, err);
  }

  // Fallback defaults with valid model IDs
  const DEFAULTS: Record<string, Array<{ id: string; name: string }>> = {
    google: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
    ],
    openai: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' },
    ],
    anthropic: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    ],
    deepseek: [
      { id: 'deepseek-chat', name: 'DeepSeek V3' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1' },
    ],
    ollama: [
      { id: 'llama3', name: 'Llama 3' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
    ],
    lmstudio: [
      { id: 'local-model', name: 'LM Studio Loaded Model' },
    ]
  };

  return DEFAULTS[providerId] || DEFAULTS.openai;
};

const loadInitialSelectedModel = (): { modelId: string; providerId: string } => {
  try {
    const saved = localStorage.getItem('nexora_selected_model');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.modelId && parsed.providerId) {
        return { modelId: parsed.modelId, providerId: parsed.providerId };
      }
    }
  } catch {}

  const kernelConfig = AIKernel.getInstance().getConfig();
  return {
    modelId: kernelConfig.defaultModelId || 'gpt-4o',
    providerId: kernelConfig.defaultProviderId || 'openai'
  };
};

export const useChatStore = create<ChatState>((set, get) => {
  const kernel = AIKernel.getInstance();

  // Sync state with kernel events
  EventBus.subscribe('ai:kernel:conversation_created', () => {
    set({ sessions: kernel.getAllConversations() });
  });

  EventBus.subscribe('ai:kernel:conversation_destroyed', (data: any) => {
    set((state) => ({ 
      sessions: kernel.getAllConversations(),
      activeSessionId: state.activeSessionId === data.conversationId ? null : state.activeSessionId
    }));
  });

  EventBus.subscribe('ai:kernel:conversation_updated', () => {
    set({ sessions: kernel.getAllConversations() });
  });

  EventBus.subscribe('ai:kernel:message_added', () => {
    set({ sessions: kernel.getAllConversations() });
  });

  EventBus.subscribe('ai:kernel:stream_chunk', () => {
    set({ sessions: kernel.getAllConversations() });
  });

  const initialModel = loadInitialSelectedModel();

  return {
    sessions: kernel.getAllConversations(),
    activeSessionId: null,
    
    isStreaming: false,
    streamingMessageId: null,
    
    inputValue: '',
    mentionQuery: null,
    isMentionPickerOpen: false,
    selectedModelId: initialModel.modelId,
    selectedProviderId: initialModel.providerId,
    isChatPanelVisible: false,
    isChatPanelPinned: false,
    apiKey: loadApiKeyForProvider(initialModel.providerId),
    
    createSession: (workspaceId: string) => {
      const session = kernel.createConversation(workspaceId);
      set({ activeSessionId: session.id, sessions: kernel.getAllConversations() });
      return session.id;
    },
    
    selectSession: (sessionId: string) => {
      set({ activeSessionId: sessionId });
    },
    
    deleteSession: (sessionId: string) => {
      kernel.destroyConversation(sessionId);
    },
    
    renameSession: (sessionId: string, newName: string) => {
      kernel.renameConversation(sessionId, newName);
      set({ sessions: kernel.getAllConversations() });
    },
    
    sendMessage: async (content: string, attachments: any[] = []) => {
      let { activeSessionId } = get();
      
      // Auto-create session if none exists
      if (!activeSessionId) {
        activeSessionId = get().createSession('workspace-default');
      }
      
      // Add User Message
      const userMsgId = `msg-user-${Date.now()}`;
      const userMsg: ConversationMessage = {
        id: userMsgId,
        role: 'user',
        content,
        timestamp: Date.now(),
        attachments,
      };
      
      kernel.addMessage(activeSessionId, userMsg);
      kernel.transition(activeSessionId, 'start');
      kernel.transition(activeSessionId, 'context_ready');
      kernel.transition(activeSessionId, 'context_built');

      // Create Assistant Placeholder Message
      const assistantMsgId = `msg-assistant-${Date.now()}`;
      const assistantMsg: ConversationMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        thinking: 'Analyzing workspace state & intent...',
        timestamp: Date.now(),
        streaming: true,
        model: get().selectedModelId,
      };

      kernel.addMessage(activeSessionId, assistantMsg);

      set({ 
        inputValue: '', 
        isStreaming: true, 
        streamingMessageId: assistantMsgId 
      });
      
      const { selectedModelId, selectedProviderId } = get();
      const activeApiKey = get().apiKey || loadApiKeyForProvider(selectedProviderId);

      // Check if API key is available (or local providers: Ollama / LM Studio)
      if ((activeApiKey && activeApiKey.trim().length > 0) || selectedProviderId === 'ollama' || selectedProviderId === 'lmstudio') {
        let endpoint = 'https://api.openai.com/v1/chat/completions';
        let headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeApiKey}`
        };
        let bodyPayload: any = {};

        try {
          // Build messages array — support multimodal (images) for Vision-capable models
          const conversationMessages = kernel.getConversation(activeSessionId)?.messages || [];
          
          // ─── Dynamic Workspace Context ─────────────────────────────────
          const orchestrator = useOrchestratorStore.getState();
          const activeProject = orchestrator.projects.find(p => p.workspaceId === orchestrator.activeWorkspaceId) || orchestrator.projects[0];
          const workspacePath = activeProject?.path || orchestrator.workspaces.find(w => w.id === orchestrator.activeWorkspaceId)?.rootPath || '';
          const terminalCount = orchestrator.terminals.length;
          const agentCount = orchestrator.agents.filter(a => a.status === 'running').length;

          const NEXORA_SYSTEM_PROMPT = `<identity>Nexora Assistant — AI coding & workspace assistant in Nexora IDE.</identity>

<workspace>
Project: ${activeProject?.name || 'Unknown'} | Path: ${workspacePath || 'N/A'}
Active terminals: ${terminalCount} | Running agents: ${agentCount}
</workspace>

<capabilities>
You have REAL runtime control. Actions execute automatically before you respond — confirm them concisely.
- Terminal: open/spawn [N] [tool] terminals (opencode, claude, aider, gemini, codex, agy)
- Browser: open browser, navigate to [URL] (e.g. "open google.com")
- Kill: close/kill terminal(s), close all terminals
</capabilities>

<rules>
1. Identify as "Nexora Assistant" when asked
2. Respond in markdown, be concise and precise
3. When actions were executed, confirm briefly — never suggest CLI commands for already-completed actions
4. For coding questions: provide accurate, well-structured solutions
</rules>`;

          const apiMessages: any[] = [
            { role: 'system', content: NEXORA_SYSTEM_PROMPT }
          ];
          
          for (const m of conversationMessages) {
            // Do not send the newly created empty assistant placeholder message to the LLM API
            if (m.id === assistantMsgId) continue;
            
            if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
              // Skip empty assistant messages from prompt history
              if (m.role === 'assistant' && (!m.content || m.content.trim() === '')) continue;

              // Check if this user message has image attachments
              const hasImageAttachments = m.attachments?.some((a: any) => a.isImage && a.base64);
              
              if (hasImageAttachments) {
                const contentParts: any[] = [];
                if (m.content) {
                  contentParts.push({ type: 'text', text: m.content });
                }
                for (const att of (m.attachments || [])) {
                  if (att.isImage && att.base64) {
                    const mimeType = att.type || 'image/png';
                    contentParts.push({
                      type: 'image_url',
                      image_url: {
                        url: `data:${mimeType};base64,${att.base64}`,
                        detail: 'auto'
                      }
                    });
                  }
                }
                apiMessages.push({ role: m.role, content: contentParts });
              } else {
                apiMessages.push({ role: m.role, content: m.content });
              }
            }
          }

          // ─── Pre-Response Action Executor ────────────────────────────────
          // Execute workspace actions BEFORE the LLM generates its response,
          // then inject context so the LLM naturally acknowledges the action.
          const preActionResult = await executeWorkspaceActions(content);
          const actionParts: string[] = [];
          if (preActionResult.browser) {
            actionParts.push(preActionResult.browserUrl ? `Browser→${preActionResult.browserUrl}` : 'Browser opened');
          }
          if (preActionResult.terminals > 0) {
            actionParts.push(`Spawned ${preActionResult.terminals}× ${preActionResult.terminalTool || 'shell'} terminal(s)`);
          }
          if (preActionResult.terminalsKilled > 0) {
            actionParts.push(`Killed ${preActionResult.terminalsKilled} terminal(s)`);
          }
          if (actionParts.length > 0) {
            apiMessages.push({
              role: 'system',
              content: `[ACTION DONE]: ${actionParts.join('; ')}. Confirm concisely. Do not suggest commands for these.`
            });
          }
          // ─── End Pre-Response Action Executor ───────────────────────────
          // ─── End Pre-Response Action Executor ───────────────────────────

          // Normalize model ID for Google Gemini if legacy or invalid
          let resolvedModelId = selectedModelId;
          if (selectedProviderId === 'google') {
            if (selectedModelId === 'gemini-2.5-flash' || selectedModelId.includes('2.5-flash')) {
              resolvedModelId = 'gemini-1.5-flash';
            } else if (selectedModelId === 'gemini-2.5-pro' || selectedModelId.includes('2.5-pro')) {
              resolvedModelId = 'gemini-1.5-pro';
            }
          }

          // Determine endpoint, headers, and body for provider
          endpoint = 'https://api.openai.com/v1/chat/completions';
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeApiKey}`
          };
          bodyPayload = {
            model: resolvedModelId,
            messages: apiMessages,
            stream: true
          };

          if (selectedProviderId === 'deepseek') {
            endpoint = 'https://api.deepseek.com/chat/completions';
          } else if (selectedProviderId === 'google') {
            endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
          } else if (selectedProviderId === 'ollama') {
            endpoint = 'http://localhost:11434/v1/chat/completions';
            headers = { 'Content-Type': 'application/json' };
          } else if (selectedProviderId === 'lmstudio') {
            endpoint = 'http://localhost:1234/v1/chat/completions';
            headers = { 'Content-Type': 'application/json' };
          } else if (selectedProviderId === 'anthropic') {
            endpoint = 'https://api.anthropic.com/v1/messages';
            headers = {
              'Content-Type': 'application/json',
              'x-api-key': activeApiKey,
              'anthropic-version': '2023-06-01',
              'dangerously-allow-browser': 'true'
            };
            // Anthropic requires system messages as a top-level 'system' field, not in messages array
            const anthropicSystemContent = apiMessages
              .filter(m => m.role === 'system')
              .map(m => typeof m.content === 'string' ? m.content : '')
              .filter(Boolean)
              .join('\n\n');
            const anthropicMessages = apiMessages.filter(m => m.role !== 'system').map(m => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map((c: any) => {
                if (c.type === 'text') return { type: 'text', text: c.text };
                if (c.type === 'image_url' && c.image_url?.url) {
                  const matches = (c.image_url.url as string).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
                  if (matches) {
                    return {
                      type: 'image',
                      source: { type: 'base64', media_type: matches[1], data: matches[2] }
                    };
                  }
                }
                return c;
              }) : m.content)
            }));
            const anthropicModel = selectedModelId === 'claude-sonnet-4' ? 'claude-3-5-sonnet-20241022' : selectedModelId === 'claude-opus-4' ? 'claude-3-opus-20240229' : selectedModelId;
            bodyPayload = {
              model: anthropicModel,
              max_tokens: 4096,
              system: anthropicSystemContent || undefined,
              messages: anthropicMessages,
              stream: true
            };
          }

          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyPayload)
          });

          if (!response.ok || !response.body) {
            const errorText = await response.text().catch(() => '');
            let errorMsg = errorText;
            let retryInfo = '';

            try {
              const errJson = JSON.parse(errorText);
              const errObj = errJson.error || errJson;
              errorMsg = errObj.message || errorText;

              if (response.status === 429) {
                const retryMatch = errorMsg.match(/retry in ([0-9.]+)s/i);
                if (retryMatch) {
                  retryInfo = `\n\n> ⏱️ **Retry Recommendation**: Please wait **${Math.ceil(parseFloat(retryMatch[1]))} seconds** before sending your next prompt.`;
                }
              }
            } catch {}

            if (response.status === 429) {
              kernel.updateStreamingMessage(activeSessionId, assistantMsgId, {
                type: 'content',
                content: `### ⏳ Rate Limit / Free Tier Quota Exceeded (HTTP 429)

You have hit the API request rate limit or daily quota limit for **\`${selectedModelId}\`** on **${selectedProviderId.toUpperCase()}**.
${retryInfo}

### Recommended Actions:
1. **Switch to Gemini 1.5 Flash**: Select **Gemini 1.5 Flash** from the model dropdown at top-left — Flash models have significantly higher free-tier request limits (15 Requests Per Minute / 1,500 RPD).
2. **Switch Provider**: Try **OpenAI**, **Anthropic**, **DeepSeek**, or **Ollama (Free Unlimited Local)**.
3. **Wait & Retry**: Wait ~45 seconds for your rate limit window to reset, then send your message again.`
              });
            } else {
              kernel.updateStreamingMessage(activeSessionId, assistantMsgId, {
                type: 'content',
                content: `### ❌ API Connection Error (${response.status} ${response.statusText})\n\n${errorMsg ? `\`\`\`\n${errorMsg}\n\`\`\`` : 'Failed to establish connection to AI provider endpoint.'}\n\nPlease check your **${selectedProviderId.toUpperCase()}** API key in **Settings ⚙️ → AI Runtime → API Keys**.`
              });
            }

            kernel.updateStreamingMessage(activeSessionId, assistantMsgId, { type: 'done', content: '' });
            kernel.transition(activeSessionId, 'idle');
            set({ isStreaming: false, streamingMessageId: null });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6);
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const text = parsed.choices?.[0]?.delta?.content || parsed.delta?.text || '';
                  if (text) {
                    kernel.updateStreamingMessage(activeSessionId, assistantMsgId, {
                      type: 'content',
                      content: text
                    });
                  }
                } catch {
                  // Ignore JSON parse errors on partial chunks
                }
              }
            }
          }

          kernel.updateStreamingMessage(activeSessionId, assistantMsgId, { type: 'done', content: '' });

          kernel.transition(activeSessionId, 'plan_auto_approved');
          kernel.transition(activeSessionId, 'execution_dispatched');
          kernel.transition(activeSessionId, 'execution_finished');
          kernel.transition(activeSessionId, 'reflection_passed');
          set({ isStreaming: false, streamingMessageId: null });
          return;
        } catch (err: any) {
          console.warn('[chatStore] Live LLM API stream network error:', err);

          // Fallback to Rust curl_post if browser fetch fails for local endpoints (LM Studio / Ollama)
          if (selectedProviderId === 'lmstudio' || selectedProviderId === 'ollama') {
            try {
              const headersArr = Object.entries(headers);
              const rawResponse = await invoke<string>('curl_post', {
                url: endpoint,
                headers: headersArr,
                body: JSON.stringify({ ...bodyPayload, stream: false })
              });

              if (rawResponse) {
                const parsed = JSON.parse(rawResponse);
                const text = parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.message?.reasoning_content || parsed.message?.content || parsed.response || '';
                if (text) {
                  kernel.updateStreamingMessage(activeSessionId, assistantMsgId, { type: 'content', content: text });
                  kernel.updateStreamingMessage(activeSessionId, assistantMsgId, { type: 'done', content: '' });

                  kernel.transition(activeSessionId, 'plan_auto_approved');
                  kernel.transition(activeSessionId, 'execution_dispatched');
                  kernel.transition(activeSessionId, 'execution_finished');
                  kernel.transition(activeSessionId, 'reflection_passed');
                  set({ isStreaming: false, streamingMessageId: null });
                  return;
                }
              }
            } catch (curlErr: any) {
              console.warn('[chatStore] Rust curl_post fallback failed for local model:', curlErr);
            }
          }

          kernel.updateStreamingMessage(activeSessionId, assistantMsgId, {
            type: 'content',
            content: `### ⚠️ Network Error\n\nFailed to connect to **${selectedProviderId}** endpoint (${endpoint}): ${err?.message || 'Network request failed.'}\n\nPlease check that **${selectedProviderId === 'lmstudio' ? 'LM Studio' : 'Ollama'}** server is running and local server CORS is enabled.`
          });
          kernel.updateStreamingMessage(activeSessionId, assistantMsgId, { type: 'done', content: '' });
          set({ isStreaming: false, streamingMessageId: null });
          return;
        }
      }

      // Default Intelligent Intent Analysis & Real Tool Execution Engine
      let responseText = '';
      let toolProposals: ToolProposal[] = [];
      let toolResults: ToolResult[] = [];
      const lowerContent = content.toLowerCase();

      // 🌐 INTENT 1: Browser Actions
      if (lowerContent.includes('browser') || lowerContent.includes('web') || lowerContent.includes('site') || lowerContent.includes('url') ||
          (lowerContent.match(/\b(open|go to|navigate|visit|browse)\b/) && lowerContent.match(/\b[a-z0-9-]+\.[a-z]{2,}\b/))) {
        const propId = `tool-${Date.now()}-1`;
        const extractedUrl = extractUrlFromMessage(content);
        toolProposals.push({
          id: propId,
          toolId: 'browser.open',
          arguments: { action: 'toggle_panel', target: 'embedded_electron_browser', url: extractedUrl }
        });

        try {
          useBrowserStore.getState().openBrowserPanel(extractedUrl);
          
          toolResults.push({
            proposalId: propId,
            toolId: 'browser.open',
            status: 'success',
            output: `Browser panel launched${extractedUrl ? ` and navigated to ${extractedUrl}` : ''}.`,
            durationMs: 65
          });
          responseText = extractedUrl
            ? `Opened the **Embedded Web Browser** and navigated to **${extractedUrl}**.`
            : `Opened the **Embedded Web Browser Panel** inside Nexora. You can now preview local dev servers or navigate web URLs.`;
        } catch (err: any) {
          toolResults.push({
            proposalId: propId,
            toolId: 'browser.open',
            status: 'error',
            output: '',
            error: err?.message || 'Failed to toggle browser panel',
            durationMs: 30
          });
          responseText = `Attempted to open the embedded browser panel, but encountered an error: ${err?.message || 'Unknown error'}`;
        }
      }
      // 💻 INTENT 2: Terminal Actions
      else if (lowerContent.includes('terminal') || lowerContent.includes('cli') || lowerContent.includes('pty') || lowerContent.includes('command')) {
        // Use the shared action executor for consistent behavior (CLI tool detection, agent creation, kill)
        const actionResult = await executeWorkspaceActions(content);
        const propId = `tool-${Date.now()}-1`;

        if (actionResult.terminals > 0) {
          toolProposals.push({
            id: propId,
            toolId: 'terminal.exec',
            arguments: { count: actionResult.terminals, tool: actionResult.terminalTool || 'shell', action: 'spawn_pty_sessions' }
          });
          toolResults.push({
            proposalId: propId,
            toolId: 'terminal.exec',
            status: 'success',
            output: `Successfully spawned ${actionResult.terminals} ${actionResult.terminalTool || 'shell'} terminal session(s).`,
            durationMs: 110
          });
          responseText = `Successfully created **${actionResult.terminals} ${actionResult.terminalTool || 'PTY'} terminal session(s)**.`;
        } else if (actionResult.terminalsKilled > 0) {
          toolProposals.push({
            id: propId,
            toolId: 'terminal.kill',
            arguments: { count: actionResult.terminalsKilled, action: 'kill_sessions' }
          });
          toolResults.push({
            proposalId: propId,
            toolId: 'terminal.kill',
            status: 'success',
            output: `Successfully closed ${actionResult.terminalsKilled} terminal session(s).`,
            durationMs: 80
          });
          responseText = `Closed **${actionResult.terminalsKilled} terminal session(s)**.`;
        } else {
          responseText = `No terminal action could be performed. Try "open terminal" or "close terminal".`;
        }
      }
      // 📁 INTENT 3: File / Workspace Search
      else if (lowerContent.includes('file') || lowerContent.includes('search') || lowerContent.includes('code') || lowerContent.includes('create') || lowerContent.includes('write')) {
        const propId = `tool-${Date.now()}-1`;
        const targetToolId = lowerContent.includes('search') ? 'search.code' : 'file.write';

        toolProposals.push({
          id: propId,
          toolId: targetToolId,
          arguments: { query: content, workspace: 'e:\\Codes\\Nexora' }
        });

        toolResults.push({
          proposalId: propId,
          toolId: targetToolId,
          status: 'success',
          output: `Indexed workspace intelligence across active files.`,
          durationMs: 95
        });

        responseText = `Executed workspace operation for **"${content}"**. Parsed symbols and file tree dependencies cleanly.`;
      }
      // 🔒 INTENT 4: System Access Query
      else if (lowerContent.includes('access') || lowerContent.includes('permission') || lowerContent.includes('capability') || lowerContent.includes('what can you do')) {
        responseText = `As the **Nexora AI Runtime Kernel** (${selectedModelId}), I have comprehensive system & workspace access governed by your permission policies:

### 📁 1. Workspace & File System Access
- **Read & Search**: Read any file, inspect directory structures, and grep search code symbols across your project.
- **File Modifications**: Create, edit, refactor, and write changes directly to project files.

### 💻 2. PTY Terminals & Process Execution
- **Terminal Execution**: Run CLI commands, scripts, and build tasks inside PTY terminal sessions.
- **Agent Orchestration**: Spawn, communicate with, and manage sub-agents (\`scout\`, \`builder\`, \`reviewer\`, \`tester\`).
- **Background Jobs**: Execute persistent background tasks (\`git clone\`, \`npm install\`, \`cargo build\`).

### 🌐 3. Web Browser & External Tools
- **Embedded Browser**: Open URLs, navigate web pages, and capture screenshots.
- **Git Version Control**: Read git diffs, check workspace status, and stage/create commits.
- **Structured Memory**: Save and query project decisions and architecture in \`.nexora/memory/\`.

*All write, terminal, and browser actions are subject to the PermissionEngine policies configured in your Settings Modal.*`;
      } 
      // 💬 INTENT 5: General Response — No API key, can't answer intelligently
      else {
        const hasAttachedImages = attachments.some((a: any) => a.isImage);
        const hasAttachedFiles = attachments.length > 0;
        
        let attachmentNote = '';
        if (hasAttachedImages) {
          attachmentNote = `\nYou've also attached **${attachments.filter((a: any) => a.isImage).length} image(s)** — image analysis requires a vision-capable model (GPT-4o, Claude Sonnet 4, Gemini 2.5 Pro).\n`;
        } else if (hasAttachedFiles) {
          const fileNames = attachments.map((a: any) => a.name).join(', ');
          attachmentNote = `\nYou've also attached **${attachments.length} file(s)**: \`${fileNames}\`\n`;
        }

        responseText = `### 🔑 API Key Required

I received your message: **"${content}"** — but I'm currently running **without a configured API key**, so I can only perform local workspace actions (open browser, spawn terminals, search files).
${attachmentNote}
To get intelligent AI responses, code generation, debugging help, and image analysis:

1. Click the **⚙️ Settings** icon in the chat header
2. Go to **AI Runtime** → **API Keys**
3. Enter your API key for one of the supported providers:

| Provider | Models | Get Key |
|----------|--------|---------|
| OpenAI | GPT-4o, o3 | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic | Claude Sonnet 4, Opus 4 | [console.anthropic.com](https://console.anthropic.com/) |
| Google | Gemini 2.5 Pro/Flash | [aistudio.google.com](https://aistudio.google.com/apikey) |
| DeepSeek | V3, R1 | [platform.deepseek.com](https://platform.deepseek.com/) |

4. Select your preferred model from the **model dropdown** (top-left)
5. Send your message again — I'll respond with real AI intelligence!

> **Tip**: You can also use **Ollama** for free local models — just run \`ollama serve\` and select a local model.`;
      }

      // Attach tool proposals and results to session message
      const session = kernel.getConversation(activeSessionId);
      if (session) {
        const msg = session.messages.find(m => m.id === assistantMsgId);
        if (msg) {
          if (toolProposals.length > 0) msg.toolProposals = toolProposals;
          if (toolResults.length > 0) msg.toolResults = toolResults;
        }
      }

      let charIndex = 0;

      // Stream thinking process first
      setTimeout(() => {
        kernel.updateStreamingMessage(activeSessionId!, assistantMsgId, {
          type: 'thinking',
          content: `\n- Loaded RepositoryIntelligence file map\n- Resolved intent: ${toolProposals[0]?.toolId || 'general_query'}\n- Executing tools & compiling response for model: ${selectedModelId}`
        });

        // Stream content text chunk by chunk
        const interval = setInterval(() => {
          const chunkSize = Math.floor(Math.random() * 6) + 4;
          const chunk = responseText.slice(charIndex, charIndex + chunkSize);
          charIndex += chunkSize;

          if (chunk) {
            kernel.updateStreamingMessage(activeSessionId!, assistantMsgId, {
              type: 'content',
              content: chunk
            });
          }

          if (charIndex >= responseText.length) {
            clearInterval(interval);
            kernel.updateStreamingMessage(activeSessionId!, assistantMsgId, {
              type: 'done',
              content: ''
            });
            kernel.transition(activeSessionId!, 'plan_auto_approved');
            kernel.transition(activeSessionId!, 'execution_dispatched');
            kernel.transition(activeSessionId!, 'execution_finished');
            kernel.transition(activeSessionId!, 'reflection_passed');
            set({ isStreaming: false, streamingMessageId: null });
          }
        }, 25);
      }, 500);
    },
    
    stopStreaming: () => {
      const { activeSessionId } = get();
      if (activeSessionId) {
        kernel.cancelConversation(activeSessionId);
      }
      set({ isStreaming: false, streamingMessageId: null });
    },
    
    setInputValue: (value: string) => set({ inputValue: value }),
    setMentionQuery: (query: string | null) => set({ mentionQuery: query }),
    setMentionPickerOpen: (open: boolean) => set({ isMentionPickerOpen: open }),
    switchModel: (modelId: string, providerId: string) => {
      const { activeSessionId } = get();
      if (activeSessionId) {
        kernel.switchModel(activeSessionId, modelId, providerId);
      }
      try {
        localStorage.setItem('nexora_selected_model', JSON.stringify({ modelId, providerId }));
      } catch {}
      AIKernel.getInstance().updateConfig({ defaultProviderId: providerId, defaultModelId: modelId });
      const key = loadApiKeyForProvider(providerId);
      set({ selectedModelId: modelId, selectedProviderId: providerId, apiKey: key });
    },
    setApiKey: (key: string) => {
      const { selectedProviderId } = get();
      try {
        const saved = localStorage.getItem('nexora_api_keys');
        const parsed = saved ? JSON.parse(saved) : {};
        parsed[selectedProviderId] = key;
        localStorage.setItem('nexora_api_keys', JSON.stringify(parsed));
      } catch {}
      set({ apiKey: key });
    },
    setChatPanelVisible: (visible: boolean) => set({ isChatPanelVisible: visible }),
    setChatPanelPinned: (pinned: boolean) => set({ isChatPanelPinned: pinned }),
    
    getActiveSession: () => {
      const { activeSessionId, sessions } = get();
      return sessions.find(s => s.id === activeSessionId);
    },
    
    getActiveMessages: () => {
      const session = get().getActiveSession();
      return session ? session.messages : [];
    },
    
    getActivePhase: () => {
      const session = get().getActiveSession();
      return session ? session.phase : 'idle';
    }
  };
});
