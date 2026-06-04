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
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ paneId, isFocused }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);

  const terminals = useOrchestratorStore((s) => s.terminals);
  const updateTerminalHistory = useOrchestratorStore((s) => s.updateTerminalHistory);

  const termSession = terminals.find((t) => t.id === paneId);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize interactive xterm.js instance
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', var(--font-mono, monospace)",
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

    // Write session history if available
    if (termSession?.history) {
      term.write(termSession.history);
    } else {
      // Print welcome info if clean boot
      term.writeln('\x1b[90m┌──────────────────────────────────────────────┐\x1b[0m');
      term.writeln('\x1b[90m│\x1b[0m \x1b[1;35mMulti Vibe Interactive Terminal Workspace\x1b[0m    \x1b[90m│\x1b[0m');
      term.writeln('\x1b[90m│\x1b[0m Direct shell execution enabled. Type to begin. \x1b[90m│\x1b[0m');
      term.writeln('\x1b[90m└──────────────────────────────────────────────┘\x1b[0m');
      term.writeln('');
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

    // Listen to backend PTY stdout events
    let unlistenOutput: (() => void) | null = null;
    const registerListener = async () => {
      unlistenOutput = await listen<{ sessionId: string; data: string }>(
        'terminal:stdout',
        (event) => {
          if (event.payload.sessionId !== paneId) return;
          term.write(event.payload.data);
          saveHistorySnapshot();
        }
      );
    };
    registerListener();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        try {
          fitAddon.fit();
        } catch (e) {
          // ignore transient layout resize errors
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    // Focus terminal immediately on mount if it's focused
    if (isFocused) {
      term.focus();
    }

    return () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      resizeObserver.disconnect();
      if (unlistenOutput) {
        unlistenOutput();
      }
      term.dispose();
    };
  }, [paneId]);

  // Focus terminal when isFocused prop changes
  useEffect(() => {
    if (isFocused && termRef.current) {
      termRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div className="terminal-pane terminal-pane-direct relative w-full h-full bg-[#0a0a0f] p-2 font-mono overflow-hidden">
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '100%' }} />
    </div>
  );
};
