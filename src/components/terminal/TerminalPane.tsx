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
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { TerminalBufferManager } from '../../services/TerminalBufferManager';
import '@xterm/xterm/css/xterm.css';
import './TerminalPane.css';

interface TerminalPaneProps {
  paneId: string;
  isFocused: boolean;
  isAnimating: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = React.memo(({ paneId, isFocused, isAnimating }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isAnimatingRef = useRef<boolean>(isAnimating);

  // Sync the ref synchronously during render to prevent layout reflow race conditions
  isAnimatingRef.current = isAnimating;

  const terminals = useOrchestratorStore((s) => s.terminals);
  const settings = useOrchestratorStore((s) => s.settings);
  const termSession = terminals.find((t) => t.id === paneId);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize interactive xterm.js instance
    const term = new Terminal({
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle as any,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
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
    term.loadAddon(fitAddon);

    // Helper to safely check if WebGL2 is supported by the environment
    const isWebGL2Supported = () => {
      try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
      } catch (e) {
        return false;
      }
    };

    // Load WebGL / Canvas renderer addon for smooth rendering, high FPS up to 240, and crisp text
    if (settings.hardwareAcceleration && isWebGL2Supported()) {
      try {
        const webglAddon = new WebglAddon();
        
        // Safely handle WebGL context loss
        webglAddon.onContextLoss(() => {
          console.warn('WebGL context lost. Disposing and falling back to Canvas renderer.');
          webglAddon.dispose();
          
          try {
            const canvasAddon = new CanvasAddon();
            term.loadAddon(canvasAddon);
          } catch (e) {
            console.warn('Canvas fallback failed. Using standard DOM renderer.', e);
          }
        });

        term.loadAddon(webglAddon);
      } catch (e) {
        console.warn('WebGL renderer initialization failed:', e);
        try {
          const canvasAddon = new CanvasAddon();
          term.loadAddon(canvasAddon);
        } catch (err) {
          console.warn('Canvas initialization failed, falling back to standard DOM renderer:', err);
        }
      }
    } else {
      // If WebGL2 is not supported, fallback cleanly without attempting initialization
      console.warn('WebGL2 not supported. Falling back to Canvas renderer.');
      try {
        const canvasAddon = new CanvasAddon();
        term.loadAddon(canvasAddon);
      } catch (err) {
        console.warn('Canvas initialization failed, falling back to standard DOM renderer:', err);
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

    // Restore history safely from standalone Buffer Manager
    const bufferManager = TerminalBufferManager.getInstance();
    const historyPayload = bufferManager.getSnapshot(paneId);
    if (historyPayload && termSession?.status !== 'reconnecting') {
      term.write(historyPayload);
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Custom Key Event Handler for Clipboard (Copy/Paste)
    term.attachCustomKeyEventHandler((arg) => {
      // Handle Copy: Ctrl+C or Cmd+C (only if text is selected, otherwise send SIGINT)
      // Also allow Ctrl+Shift+C explicitly for copying
      if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyC' && arg.type === 'keydown') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false; // Prevent xterm from sending ^C to the process
        }
      }
      
      // Handle Paste: Ctrl+V or Cmd+V
      // xterm usually handles native paste events, but this is a fallback intercept
      if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyV' && arg.type === 'keydown') {
        return true; // Let browser handle paste
      }
      
      return true;
    });

    if (settings.copyOnSelect) {
      term.onSelectionChange(() => {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
        }
      });
    }

    // Listen to user input and write directly to PTY
    const onDataDisposable = term.onData(async (data) => {
      try {
        await invoke('write_pty', { sessionId: paneId, data });
      } catch (err) {
        console.error('PTY write failed:', err);
      }
    });

    // Handle resizing
    let ptyResizeTimeout: any = null;
    const onResizeDisposable = term.onResize(async ({ cols, rows }) => {
      if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout);
      ptyResizeTimeout = setTimeout(async () => {
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
      }, 150); // Debounce PTY resize to prevent backend spam
    });

    // --- Terminal Buffer Manager Subscription & Dirty-Write Coalescing ---
    let writeQueue = '';
    let coalesceFrameId: number | null = null;
    
    bufferManager.subscribe(paneId, (chunk) => {
      writeQueue += chunk.data;
      
      // Coalesce multiple chunks arriving within the same frame
      if (coalesceFrameId === null) {
        coalesceFrameId = requestAnimationFrame(() => {
          if (writeQueue.length > 0) {
            const startWrite = performance.now();
            term.write(writeQueue);
            const endWrite = performance.now();
            
            // Frame-Time metrics
            const writeDuration = endWrite - startWrite;
            if (writeDuration > 10) {
              console.warn(`[TerminalPane ${paneId}] Slow xterm.write: ${writeDuration.toFixed(2)}ms for ${new Blob([writeQueue]).size} bytes`);
            }
            writeQueue = '';
          }
          coalesceFrameId = null;
        });
      }
    });

    let disposed = false;
    let unlistenExit: (() => void) | null = null;

    const registerListeners = async () => {
      // Listen for PTY exit to update terminal status
      const unlisten2 = await listen<{ sessionId: string }>(
        'terminal:exit',
        (event) => {
          if (event.payload.sessionId !== paneId) return;
          useOrchestratorStore.getState().updateTerminalStatus(paneId, 'disconnected');
        }
      );
      if (disposed) { unlisten2(); return; }
      unlistenExit = unlisten2;
    };
    registerListeners();

    // Resize observer (runs smoothly during animations at 60fps)
    let resizeFrame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (containerRef.current) {
          try {
            fitAddon.fit();
          } catch (e) {
            // ignore transient layout resize errors
          }
        }
      });
    });
    resizeObserver.observe(containerRef.current);

    // Focus terminal immediately on mount if it's focused
    if (isFocused) {
      term.focus();
    }

    return () => {
      disposed = true;
      bufferManager.unsubscribe(paneId);
      if (coalesceFrameId !== null) cancelAnimationFrame(coalesceFrameId);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      onDataDisposable.dispose();
      if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout);
      onResizeDisposable.dispose();
      resizeObserver.disconnect();
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

  // Apply runtime settings dynamically
  useEffect(() => {
    if (termRef.current) {
      const term = termRef.current;
      if (term.options.fontSize !== settings.fontSize) term.options.fontSize = settings.fontSize;
      if (term.options.fontFamily !== settings.fontFamily) term.options.fontFamily = settings.fontFamily;
      if (term.options.cursorBlink !== settings.cursorBlink) term.options.cursorBlink = settings.cursorBlink;
      if (term.options.cursorStyle !== settings.cursorStyle) term.options.cursorStyle = settings.cursorStyle as any;
    }
  }, [settings.fontSize, settings.fontFamily, settings.cursorBlink, settings.cursorStyle]);

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
    <div className="terminal-pane terminal-pane-direct relative w-full h-full bg-[#0a0a0f] font-mono overflow-hidden">
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '100%' }} />
    </div>
  );
});
