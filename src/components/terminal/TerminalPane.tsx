/**
 * Multi Vibe — TerminalPane Component
 *
 * Renders a direct, interactive xterm.js terminal.
 * Key input is forwarded directly to the backend PTY and output is rendered in real-time.
 */
import React, { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import '@xterm/xterm/css/xterm.css';
import './TerminalPane.css';

interface TerminalPaneProps {
  paneId: string;
  isFocused: boolean;
  isAnimating: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ paneId, isFocused, isAnimating }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const isAnimatingRef = useRef<boolean>(isAnimating);

  // Sync the ref synchronously during render to prevent layout reflow race conditions
  isAnimatingRef.current = isAnimating;

  const terminals = useOrchestratorStore((s) => s.terminals);
  const updateTerminalHistory = useOrchestratorStore((s) => s.updateTerminalHistory);

  const termSession = terminals.find((t) => t.id === paneId);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize interactive xterm.js instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      theme: {
        background: '#0a0a0f',
        foreground: '#e2e8f0',
        cursor: '#8b5cf6',
        black: '#0f0f15',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#cbd5e1',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#a78bfa',
        brightCyan: '#22d3ee',
        brightWhite: '#f1f5f9',
      },
      allowProposedApi: true,
      disableStdin: false, // Enable user keyboard input
    });

    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(serializeAddon);
    
    // Load WebGL / Canvas renderer addon for smooth rendering, high FPS up to 240, and crisp text
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        // Fallback to Canvas renderer if WebGL context is lost
        try {
          const canvasAddon = new CanvasAddon();
          term.loadAddon(canvasAddon);
        } catch (e) {
          console.warn('Canvas renderer fallback failed:', e);
        }
      });
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL renderer initialization failed, trying Canvas renderer:', e);
      try {
        const canvasAddon = new CanvasAddon();
        term.loadAddon(canvasAddon);
      } catch (err) {
        console.warn('Canvas renderer initialization failed, falling back to standard DOM renderer:', err);
      }
    }
    
    term.open(containerRef.current);
    
    // Fit to parent container dimensions and initialize size in PTY
    try {
      fitAddon.fit();
      invoke('resize_pty', {
        sessionId: paneId,
        rows: term.rows,
        cols: term.cols,
      }).catch(err => console.warn('Initial PTY resize failed:', err));
    } catch (e) {
      console.warn('Initial terminal fit failed:', e);
    }

    // Restore serialized history for all sessions EXCEPT 'reconnecting'.
    // If a session is 'reconnecting', a fresh PTY is booting and will output
    // its own initial state. Writing history then would cause overlapping duplicates.
    // For live ('connected') sessions, standard shells (bash, python) NEED this
    // history restored to not appear blank on remount. Ink-based CLIs will have
    // their viewport safely cleared during the initial resize to prevent duplication.
    if (termSession?.history && termSession.status !== 'reconnecting') {
      term.write(termSession.history);
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    serializeAddonRef.current = serializeAddon;

    // Listen to user input and write directly to PTY
    const onDataDisposable = term.onData(async (data) => {
      try {
        await invoke('write_pty', { sessionId: paneId, data });
      } catch (err) {
        console.error('PTY write failed:', err);
      }
    });

    // Handle resizing
    const onResizeDisposable = term.onResize(async ({ cols, rows }) => {
      try {
        // Detect interactive CLIs built on Ink framework (Gemini, Claude)
        // Fetch fresh state from the store to avoid a stale closure bug where
        // we use the command/title from the very first render.
        const freshSession = useOrchestratorStore.getState().terminals.find(t => t.id === paneId);
        const cmd = (freshSession?.command || '').toLowerCase();
        const title = (freshSession?.title || '').toLowerCase();
        
        // Strict prefix checks instead of `.includes` to prevent destructive clears
        // on unrelated user sessions (e.g., bash scripts named "gemini-test").
        if (cmd === 'gemini' || cmd === 'claude' || 
            title.startsWith('gemini') || title.startsWith('claude')) {
          term.write('\x1b[2J\x1b[H');
        }
        
        await invoke('resize_pty', { sessionId: paneId, rows, cols });
      } catch (err) {
        console.warn('PTY resize failed:', err);
      }
    });

    let saveTimeout: any = null;
    const saveHistorySnapshot = () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (termRef.current && serializeAddonRef.current) {
          try {
            const snapshot = serializeAddonRef.current.serialize();
            updateTerminalHistory(paneId, snapshot);
          } catch (e) {
            console.warn('Failed to serialize terminal history:', e);
          }
        }
      }, 500);
    };

    // Listen to backend PTY stdout events.
    // Use a `disposed` flag to handle the async registration race:
    // if the component unmounts before `listen()` resolves, the cleanup
    // function sets `disposed = true` so the resolved unlisten is called immediately.
    let disposed = false;
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    const registerListeners = async () => {
      const unlisten1 = await listen<{ sessionId: string; data: string }>(
        'terminal:stdout',
        (event) => {
          if (event.payload.sessionId !== paneId) return;
          term.write(event.payload.data);
          saveHistorySnapshot();
        }
      );
      if (disposed) { unlisten1(); return; }
      unlistenOutput = unlisten1;

      // Listen for PTY exit to update terminal status
      const unlisten2 = await listen<{ sessionId: string }>(
        'terminal:exit',
        (event) => {
          if (event.payload.sessionId !== paneId) return;
          // Update store status to 'disconnected' so UI reflects dead PTY
          useOrchestratorStore.getState().updateTerminalStatus(paneId, 'disconnected');
        }
      );
      if (disposed) { unlisten2(); return; }
      unlistenExit = unlisten2;
    };
    registerListeners();

    // Resize observer (debounced to prevent layout corruption during CSS animation transitions)
    let resizeTimeout: any = null;
    const resizeObserver = new ResizeObserver(() => {
      if (isAnimatingRef.current) return; // Skip resizes during focus zoom transitions

      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (containerRef.current) {
          try {
            fitAddon.fit();
          } catch (e) {
            // ignore transient layout resize errors
          }
        }
      }, 100);
    });
    resizeObserver.observe(containerRef.current);

    // Focus terminal immediately on mount if it's focused
    if (isFocused) {
      term.focus();
    }

    return () => {
      disposed = true;
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        // Flush any pending history snapshot immediately before unmount to prevent data loss
        if (termRef.current && serializeAddonRef.current) {
          try {
            useOrchestratorStore.getState().updateTerminalHistory(paneId, serializeAddonRef.current.serialize());
          } catch (e) {}
        }
      }
      if (resizeTimeout) clearTimeout(resizeTimeout);
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      resizeObserver.disconnect();
      if (unlistenOutput) unlistenOutput();
      if (unlistenExit) unlistenExit();
      term.dispose();
    };
  }, [paneId]);

  // Focus terminal when isFocused prop changes
  useEffect(() => {
    if (isFocused && termRef.current) {
      termRef.current.focus();
    }
  }, [isFocused]);

  // Fit layout once transitions complete (debounced slightly to let layout fully settle)
  useEffect(() => {
    if (!isAnimating && fitAddonRef.current && containerRef.current) {
      const timer = setTimeout(() => {
        if (fitAddonRef.current && containerRef.current) {
          try {
            fitAddonRef.current.fit();
          } catch (e) {
            // ignore
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isAnimating]);

  return (
    <div className="terminal-pane terminal-pane-direct relative w-full h-full bg-[#0a0a0f] p-2 font-mono overflow-hidden">
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '100%' }} />
    </div>
  );
};
