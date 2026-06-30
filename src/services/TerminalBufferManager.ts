import { listen } from '@tauri-apps/api/event';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import { DEFAULT_APP_SETTINGS } from '../types';
import { PluginRegistry } from '../plugins/registry';
import { BlockParser } from '../lib/terminal/blockParser';

export interface Chunk {
  sequenceId: number;
  timestamp: number;
  data: string;
}

export class ChunkBuffer {
  chunks: Chunk[] = [];
  totalBytes: number = 0;
  nextSequenceId: number = 0;
}

export type TerminalVisibility = 'Visible' | 'Hidden' | 'Background';

export class TerminalBufferManager {
  private static instance: TerminalBufferManager;
  private buffers = new Map<string, ChunkBuffer>();
  // Default to 50MB per session
  public maxBufferBytes: number = 50 * 1024 * 1024;

  private visibilities = new Map<string, TerminalVisibility>();
  
  // Callbacks for components to listen to new chunks (only if visible)
  private subscribers = new Map<string, (chunk: Chunk) => void>();
  
  // Replay queues
  private replayQueues = new Map<string, Chunk[]>();
  private replayAnimFrameIds = new Map<string, number>();

  private isListening = false;

  private pendingTokens = new Map<string, number>();
  private commitTimeout: any = null;
  private lastTriggerOffsets = new Map<string, number>();
  private blockParsers = new Map<string, BlockParser>();
  private watchdogTimers = new Map<string, any>();
  private abortedPendingSessions = new Set<string>();

  private constructor() {}

  public setAbortedPending(sessionId: string) {
    this.abortedPendingSessions.add(sessionId);
  }

  public isAbortedPending(sessionId: string): boolean {
    return this.abortedPendingSessions.has(sessionId);
  }

  public clearAbortedPending(sessionId: string) {
    this.abortedPendingSessions.delete(sessionId);
  }

  public static getInstance(): TerminalBufferManager {
    if (!TerminalBufferManager.instance) {
      TerminalBufferManager.instance = new TerminalBufferManager();
      TerminalBufferManager.instance.setupGlobalListeners();
    }
    return TerminalBufferManager.instance;
  }

  private async setupGlobalListeners() {
    if (this.isListening) return;
    this.isListening = true;

    listen<{ sessionId: string; data: string }>(
      'terminal:stdout',
      (event) => {
        const { sessionId, data } = event.payload;
        this.append(sessionId, data);

        // 1. Block parser integration (OSC 133 semantic zones)
        let parser = this.blockParsers.get(sessionId);
        if (!parser) {
          parser = new BlockParser();
          this.blockParsers.set(sessionId, parser);
        }
        const events = parser.parse(data);
        for (const ev of events) {
          this.handleBlockEvent(sessionId, ev);
        }

        this.clearAbortedPending(sessionId);

        // 2. Reset silence watchdog timer
        const existingTimer = this.watchdogTimers.get(sessionId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        this.watchdogTimers.set(
          sessionId,
          setTimeout(() => {
            this.runSilenceWatchdogCheck(sessionId);
          }, 5000)
        );

        this.handleAutoResponders(sessionId);
        this.handleConversationParser(sessionId);
        this.handleProjectNotFoundError(sessionId);
      }
    );

    // Initialize limit from store
    this.maxBufferBytes = (useOrchestratorStore.getState().settings?.appearance?.terminal?.terminalScrollbackLimit || DEFAULT_APP_SETTINGS.appearance.terminal.terminalScrollbackLimit) * 150;

    // Listen to settings changes dynamically
    useOrchestratorStore.subscribe((state) => {
      const newLimitBytes = (state.settings?.appearance?.terminal?.terminalScrollbackLimit || DEFAULT_APP_SETTINGS.appearance.terminal.terminalScrollbackLimit) * 150; // Approx 150 bytes per line with ANSI
      if (this.maxBufferBytes !== newLimitBytes) {
        this.maxBufferBytes = newLimitBytes;
        // Trim existing buffers to new limit immediately
        for (const buffer of this.buffers.values()) {
          this.trimBuffer(buffer);
        }
      }
    });
  }

  public append(sessionId: string, data: string): Chunk {
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = new ChunkBuffer();
      this.buffers.set(sessionId, buffer);
    }

    const chunk: Chunk = {
      sequenceId: buffer.nextSequenceId++,
      timestamp: Date.now(),
      data,
    };

    buffer.chunks.push(chunk);
    buffer.totalBytes += data.length;

    this.trimBuffer(buffer);

    // Accumulate stdout tokens (approx 4 characters per token)
    const estimatedTokens = Math.ceil(data.length / 4);
    this.pendingTokens.set(sessionId, (this.pendingTokens.get(sessionId) || 0) + estimatedTokens);

    if (!this.commitTimeout) {
      this.commitTimeout = setTimeout(() => {
        this.commitPendingTokens();
      }, 1000);
    }

    const visibility = this.visibilities.get(sessionId) || 'Visible';

    if (visibility === 'Visible') {
      // If we are currently replaying, queue it up so it stays in order
      const replayQueue = this.replayQueues.get(sessionId);
      if (replayQueue && replayQueue.length > 0) {
        replayQueue.push(chunk);
      } else {
        // Direct dispatch
        const subscriber = this.subscribers.get(sessionId);
        if (subscriber) {
          subscriber(chunk);
        }
      }
    } else {
      // Hoard the chunk, do not dispatch
      let replayQueue = this.replayQueues.get(sessionId);
      if (!replayQueue) {
        replayQueue = [];
        this.replayQueues.set(sessionId, replayQueue);
      }
      replayQueue.push(chunk);
    }

    return chunk;
  }

  private trimBuffer(buffer: ChunkBuffer) {
    while (buffer.totalBytes > this.maxBufferBytes && buffer.chunks.length > 0) {
      const removedChunk = buffer.chunks.shift();
      if (removedChunk) {
        buffer.totalBytes -= removedChunk.data.length;
      }
    }
  }

  public getSnapshot(sessionId: string): string {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return '';
    return buffer.chunks.map((c) => c.data).join('');
  }

  public getLastSequenceId(sessionId: string): number {
    const buffer = this.buffers.get(sessionId);
    if (!buffer || buffer.chunks.length === 0) return -1;
    return buffer.chunks[buffer.chunks.length - 1].sequenceId;
  }

  public clear(sessionId: string) {
    this.buffers.delete(sessionId);
    this.replayQueues.delete(sessionId);
    const frameId = this.replayAnimFrameIds.get(sessionId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      this.replayAnimFrameIds.delete(sessionId);
    }
  }

  public subscribe(sessionId: string, callback: (chunk: Chunk) => void) {
    this.subscribers.set(sessionId, callback);
  }

  public unsubscribe(sessionId: string) {
    this.subscribers.delete(sessionId);
  }

  public setVisibility(sessionId: string, visibility: TerminalVisibility) {
    const oldVisibility = this.visibilities.get(sessionId) || 'Visible';
    this.visibilities.set(sessionId, visibility);

    // If becoming visible, schedule a gradual replay
    if (visibility === 'Visible' && oldVisibility !== 'Visible') {
      this.scheduleGradualReplay(sessionId);
    }
  }

  private scheduleGradualReplay(sessionId: string) {
    const queue = this.replayQueues.get(sessionId);
    const subscriber = this.subscribers.get(sessionId);

    if (!queue || queue.length === 0 || !subscriber) return;

    if (this.replayAnimFrameIds.has(sessionId)) return;

    const replayBatch = () => {
      const q = this.replayQueues.get(sessionId);
      if (!q || q.length === 0) {
        this.replayAnimFrameIds.delete(sessionId);
        return;
      }

      // Replay chunks in batches (e.g., up to 256KB or 10 chunks per frame)
      let bytesSent = 0;
      const MAX_BYTES_PER_FRAME = 256 * 1024;
      
      // Combine chunks into a single string for optimal xterm writing
      let combinedData = '';
      
      while (q.length > 0 && bytesSent < MAX_BYTES_PER_FRAME) {
        const chunk = q.shift()!;
        combinedData += chunk.data;
        bytesSent += chunk.data.length;
      }

      if (combinedData.length > 0) {
        // Send as a single chunk to the subscriber to avoid multiple xterm writes
        subscriber({
          sequenceId: -1, // Internal replay marker
          timestamp: Date.now(),
          data: combinedData
        });
      }

      if (q.length > 0) {
        this.replayAnimFrameIds.set(sessionId, requestAnimationFrame(replayBatch));
      } else {
        this.replayAnimFrameIds.delete(sessionId);
      }
    };

    this.replayAnimFrameIds.set(sessionId, requestAnimationFrame(replayBatch));
  }

  private commitPendingTokens() {
    this.commitTimeout = null;
    if (this.pendingTokens.size === 0) return;

    const store = useOrchestratorStore.getState();
    const updates: Record<string, number> = {};

    this.pendingTokens.forEach((tokens, sessionId) => {
      const term = store.terminals.find(t => t.id === sessionId);
      if (term && term.agentId) {
        updates[term.agentId] = (updates[term.agentId] || 0) + tokens;
      }
    });

    this.pendingTokens.clear();

    if (Object.keys(updates).length > 0) {
      store.incrementAgentTokens(updates);
    }
  }

  private handleAutoResponders(sessionId: string) {
    try {
      const snapshot = this.getSnapshot(sessionId);
      if (!snapshot) return;

      const lastText = snapshot.slice(-1000);
      const allPlugins = PluginRegistry.getAll();

      // Scan all plugins to ensure auto-responders work dynamically regardless of command naming overrides
      for (const plugin of allPlugins) {
        if (!plugin.autoResponders) continue;

        for (const responder of plugin.autoResponders) {
          if (lastText.includes(responder.pattern)) {
            const lastTriggerKey = `${sessionId}:${responder.pattern}`;
            if (this.lastTriggerOffsets.get(lastTriggerKey) === snapshot.length) {
              continue; // Already triggered for this exact state
            }
            this.lastTriggerOffsets.set(lastTriggerKey, snapshot.length);

            // Invoke PTY write asynchronously to send input
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('write_pty', { sessionId, data: responder.response })
                .catch(err => console.warn(`Auto-responder failed to write to PTY:`, err));
            });
            return; // Only trigger one responder per tick
          }
        }
      }
    } catch (e) {
      console.warn('Auto-responder error:', e);
    }
  }

  private handleConversationParser(sessionId: string) {
    try {
      const snapshot = this.getSnapshot(sessionId);
      if (!snapshot) return;

      const lastText = snapshot.slice(-1000);
      const allPlugins = PluginRegistry.getAll();

      for (const plugin of allPlugins) {
        if (!plugin.conversationParser) continue;

        const regex = new RegExp(plugin.conversationParser.pattern, 'i');
        const match = lastText.match(regex);
        if (match) {
          // Build the new args list with substituted values
          const newArgs = plugin.conversationParser.argsTemplate.map(arg => {
            let substituted = arg;
            for (let i = 1; i < match.length; i++) {
              substituted = substituted.replace(`$${i}`, match[i]);
            }
            return substituted;
          });

          // Update terminal session in the store
          const store = useOrchestratorStore.getState();
          const term = store.terminals.find(t => t.id === sessionId);
          if (term) {
            // Only update if the arguments list is different to avoid dispatch loops
            const isDifferent = !term.args || term.args.length !== newArgs.length || 
                                term.args.some((val, idx) => val !== newArgs[idx]);
            if (isDifferent) {
              useOrchestratorStore.setState(s => ({
                terminals: s.terminals.map(t =>
                  t.id === sessionId ? { ...t, args: newArgs } : t
                )
              }));
              store.saveSnapshot();
              console.log(`[Conversation Parser] Auto-saved conversation args for session ${sessionId}:`, newArgs);
            }
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Conversation parser error:', e);
    }
  }

  private handleProjectNotFoundError(sessionId: string) {
    try {
      const snapshot = this.getSnapshot(sessionId);
      if (!snapshot) return;

      const lastText = snapshot.slice(-500);
      if (lastText.includes("Project Not Found") || (lastText.includes("not found") && lastText.includes("Project"))) {
        const lastTriggerKey = `${sessionId}:project_not_found`;
        if (this.lastTriggerOffsets.get(lastTriggerKey) === snapshot.length) {
          return; // Already triggered for this exact state
        }
        this.lastTriggerOffsets.set(lastTriggerKey, snapshot.length);

        console.warn(`[Self-Healing] Detected Project Not Found error in session ${sessionId}. Attempting auto-recovery by spawning with --new-project.`);
        
        // Trigger self-healing respawn in store
        const store = useOrchestratorStore.getState();
        store.healProjectNotFound(sessionId);
      }
    } catch (e) {
      console.warn('Self-healing error:', e);
    }
  }

  private handleBlockEvent(sessionId: string, event: import('../lib/terminal/blockParser').BlockEvent) {
    const store = useOrchestratorStore.getState();
    const term = store.terminals.find(t => t.id === sessionId);
    if (!term) return;

    switch (event.type) {
      case 'command-start':
      case 'pre-exec':
        store.updateTerminalExecutionState(sessionId, 'running');
        break;
      case 'prompt-start': {
        const currentExecState = term.executionState;
        if (currentExecState !== 'completed' && currentExecState !== 'failed' && currentExecState !== 'aborted') {
          store.updateTerminalExecutionState(sessionId, 'idle');
        }
        break;
      }
      case 'command-done': {
        const exitCode = event.exitCode ?? 0;
        if (exitCode === 0) {
          store.updateTerminalExecutionState(sessionId, 'completed');
          store.markTerminalCompleted(sessionId);
        } else if (exitCode === 130) {
          store.updateTerminalExecutionState(sessionId, 'aborted');
        } else {
          store.updateTerminalExecutionState(sessionId, 'failed');
        }
        break;
      }
      default:
        break;
    }
  }

  private async runSilenceWatchdogCheck(sessionId: string) {
    const store = useOrchestratorStore.getState();
    const term = store.terminals.find(t => t.id === sessionId);
    if (!term || term.executionState !== 'running') return;

    try {
      // 1. Check trailing text prompt patterns to detect idle state for interactive CLIs
      const snapshot = this.getSnapshot(sessionId);
      if (snapshot) {
        const lastLines = snapshot.slice(-300).trim();
        const cleanLines = lastLines.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
        const cleanLower = cleanLines.toLowerCase();
        
        const hasPromptPattern = 
          cleanLower.includes('shortcuts') ||
          cleanLower.includes('anything') ||
          cleanLower.includes('implement') ||
          cleanLower.includes('feature]') ||
          cleanLower.includes('welcome back') ||
          cleanLower.includes('model:') ||
          cleanLower.includes('gpt-') ||
          cleanLower.includes('tip press') ||
          cleanLower.includes('opencode') ||
          /(\?|\>|:|\.\.\.|\$)\s*$/.test(cleanLower) ||
          /[\?\>:\|\$\█]\s*$/.test(cleanLower);

        if (hasPromptPattern) {
          const isAborted = this.isAbortedPending(sessionId);
          const nextState = isAborted ? 'idle' : 'completed';
          store.updateTerminalExecutionState(sessionId, nextState);
          if (nextState === 'completed') {
            store.markTerminalCompleted(sessionId);
          }
          this.clearAbortedPending(sessionId);
          console.log(`[Watchdog] Term ${sessionId} detected as ${nextState.toUpperCase()} via prompt pattern.`);
          return;
        }
      }

      // 2. Fall back to process-level checks
      const { invoke } = await import('@tauri-apps/api/core');
      const procInfo = await invoke<{ has_active_child: boolean; shell_pid: number; children: any[] }>(
        'get_pty_process_info',
        { sessionId }
      );

      if (!procInfo.has_active_child) {
        const isAborted = this.isAbortedPending(sessionId);
        const nextState = isAborted ? 'idle' : 'completed';
        store.updateTerminalExecutionState(sessionId, nextState);
        if (nextState === 'completed') {
          store.markTerminalCompleted(sessionId);
        }
        this.clearAbortedPending(sessionId);
        console.log(`[Watchdog] Term ${sessionId} detected as ${nextState.toUpperCase()} (no active child processes).`);
      }
    } catch (e) {
      console.warn('[Watchdog] Failed to query process info:', e);
    }
  }
}
