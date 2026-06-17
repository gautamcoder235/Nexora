/**
 * Multi Vibe — TerminalPane Component
 *
 * Renders a direct, interactive xterm.js terminal.
 * Key input is forwarded directly to the backend PTY and output is rendered in real-time.
 */
import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { TerminalBufferManager } from '../../services/TerminalBufferManager';
import { terminalMetricsCollector } from '../../services/TerminalMetrics';
import '@xterm/xterm/css/xterm.css';
import './TerminalPane.css';

interface TerminalPaneProps {
  paneId: string;
  isFocused: boolean;
  isAnimating: boolean;
  refreshKey?: number;
}

export const TerminalPane: React.FC<TerminalPaneProps> = React.memo(({ paneId, isFocused, isAnimating, refreshKey }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isAnimatingRef = useRef<boolean>(isAnimating);

  const [isBlackout, setIsBlackout] = useState(true); // Always start fully blacked out
  const isBlackoutRef = useRef(isBlackout);
  const blackoutTimerRef = useRef<any>(null);

  const startBlackout = () => {
    if (!isBlackoutRef.current) {
      setIsBlackout(true);
      isBlackoutRef.current = true;
    }
    if (blackoutTimerRef.current) {
      clearTimeout(blackoutTimerRef.current);
      blackoutTimerRef.current = null;
    }
  };

  const endBlackoutAfterDelay = (delay: number) => {
    if (blackoutTimerRef.current) {
      clearTimeout(blackoutTimerRef.current);
    }
    blackoutTimerRef.current = setTimeout(() => {
      setIsBlackout(false);
      isBlackoutRef.current = false;
      blackoutTimerRef.current = null;
    }, delay);
  };

  useEffect(() => {
    if (isAnimating) {
      startBlackout();
    } else {
      endBlackoutAfterDelay(800);
    }
    return () => {
      if (blackoutTimerRef.current) clearTimeout(blackoutTimerRef.current);
    };
  }, [isAnimating]);

  useEffect(() => {
    let t1: any = null;
    let t2: any = null;
    
    if (refreshKey && refreshKey > 0) {
      startBlackout();
      // Allow DOM to process the blackout first, then trigger fit, then restore
      t1 = setTimeout(() => {
        if (termRef.current) {
          try {
            // Force a backend redraw by faking a tiny resize oscillation 
            // to guarantee the kernel dispatches a SIGWINCH to the CLI.
            // This forces interactive CLIs to completely reprint their layout from scratch.
            termRef.current.clear();
            const currentRows = termRef.current.rows;
            const currentCols = termRef.current.cols;
            
            invoke('resize_pty', { 
              sessionId: paneId, 
              rows: currentRows, 
              cols: Math.max(2, currentCols - 1) 
            }).then(() => {
              t2 = setTimeout(() => {
                invoke('resize_pty', { 
                  sessionId: paneId, 
                  rows: currentRows, 
                  cols: currentCols 
                }).catch(() => {});
              }, 50);
            }).catch(() => {});

          } catch (e) {
            console.error('Manual redraw signal failed:', e);
          }
        }
        
        if (fitAddonRef.current) {
          try {
            fitAddonRef.current.fit();
          } catch (e) {
            console.error('Manual fit failed:', e);
          }
        }
        endBlackoutAfterDelay(800);
      }, 40);
    }
    
    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [refreshKey, paneId]);

  // Auto-refresh ONCE at startup. Many heavy TUIs boot faster than the frontend finishes
  // flexbox layout animations. This forces the PTY to redraw its static boundaries exactly 
  // right before the initial blackout lifts, guaranteeing perfect layout synchronization.
  useEffect(() => {
    let t1: any = null;
    let t2: any = null;
    
    t1 = setTimeout(() => {
      if (termRef.current) {
        try {
          const currentRows = termRef.current.rows;
          const currentCols = termRef.current.cols;
          
          // Dispatch fake SIGWINCH via slight oscillation
          invoke('resize_pty', { 
            sessionId: paneId, 
            rows: currentRows, 
            cols: Math.max(2, currentCols - 1) 
          }).then(() => {
            t2 = setTimeout(() => {
              invoke('resize_pty', { 
                sessionId: paneId, 
                rows: currentRows, 
                cols: currentCols 
              }).catch(() => {});
            }, 50);
          }).catch(() => {});
        } catch (e) {}
      }
    }, 700);

    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [paneId]);

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
        background: '#000000',
        foreground: '#e2e8f0',
        cursor: '#f59e0b',
        black: '#0f0f15',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#f59e0b',
        cyan: '#06b6d4',
        white: '#cbd5e1',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#fbbf24',
        brightCyan: '#22d3ee',
        brightWhite: '#f1f5f9',
      },
      allowProposedApi: true,
      disableStdin: false, // Enable user keyboard input
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

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
    // MUST be called AFTER term.open() according to xterm.js spec!
    if (settings.hardwareAcceleration && isWebGL2Supported()) {
      try {
        const webglAddon = new WebglAddon();
        
        // Safely handle WebGL context loss
        webglAddon.onContextLoss(() => {
          console.warn('WebGL context lost. Disposing and falling back to Canvas renderer.');
          // Defer to avoid crashing xterm's internal event dispatcher during the event
          setTimeout(() => {
            try { webglAddon.dispose(); } catch (e) {}
            try {
              const canvasAddon = new CanvasAddon();
              term.loadAddon(canvasAddon);
            } catch (e) {
              console.warn('Canvas fallback failed. Using standard DOM renderer.', e);
            }
          }, 0);
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
    
    // Fit to parent container dimensions and initialize size in PTY
    // Wait for fonts to be ready so character metrics are correct!
    document.fonts.ready.then(() => {
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
    });

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
      // In Tauri, native shortcuts might be blocked without a menu, so we manually intercept and write to PTY
      if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyV' && arg.type === 'keydown') {
        navigator.clipboard.readText().then(text => {
          if (text) {
            // Replace newlines with carriage returns. Many simple CLIs and Windows ConPTY 
            // drop inputs or misbehave with raw \n, and term.paste's bracketed paste 
            // can break CLIs that don't support it.
            const cleanText = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
            invoke('write_pty', { sessionId: paneId, data: cleanText }).catch(err => console.error('PTY write failed during paste:', err));
          }
        }).catch(err => {
          console.warn('Failed to read clipboard for paste:', err);
        });
        return false; // We handled the paste manually
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
          // We no longer manually clear the screen here on resize.
          // Native PTY resize is enough, and interactive CLIs will redraw themselves.
          
          await invoke('resize_pty', { sessionId: paneId, rows, cols });
        } catch (err) {
          console.warn('PTY resize failed:', err);
        }
      }, 150); // Debounce PTY resize to prevent backend spam
    });

    // --- Terminal Buffer Manager Subscription & Dirty-Write Coalescing ---
    let writeQueue = '';
    let coalesceFrameId: number | null = null;
    
    const drainQueue = (now: number) => {
      terminalMetricsCollector.recordFrame(paneId, now);
      
      if (writeQueue.length > 0) {
        const startWrite = performance.now();
        
        // Limit characters written per frame to avoid freezing the UI thread
        const MAX_CHARS_PER_FRAME = 256 * 1024; // 256KB
        const chunkToWrite = writeQueue.length > MAX_CHARS_PER_FRAME ? writeQueue.slice(0, MAX_CHARS_PER_FRAME) : writeQueue;
        writeQueue = writeQueue.length > MAX_CHARS_PER_FRAME ? writeQueue.slice(MAX_CHARS_PER_FRAME) : '';
        
        terminalMetricsCollector.recordWrite(paneId, chunkToWrite.length);

        term.write(chunkToWrite, () => {
          const writeDuration = performance.now() - startWrite;
          terminalMetricsCollector.recordRenderLatency(paneId, writeDuration);
        });

        const syncDuration = performance.now() - startWrite;
        if (syncDuration > 15) {
          console.warn(`[TerminalPane] High INP Warning: drainQueue sync parsing took ${syncDuration.toFixed(1)}ms for ${chunkToWrite.length} bytes`);
        }
        
        // If there's more in the queue, schedule another frame
        if (writeQueue.length > 0) {
          coalesceFrameId = requestAnimationFrame(drainQueue);
        } else {
          coalesceFrameId = null;
        }
      } else {
        coalesceFrameId = null;
      }
    };

    bufferManager.subscribe(paneId, (chunk) => {
      writeQueue += chunk.data;
      
      // Coalesce multiple chunks arriving within the same frame
      if (coalesceFrameId === null) {
        coalesceFrameId = requestAnimationFrame(drainQueue);
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

    // Resize observer
    let resizeFrame: number | null = null;
    let resizeTimeout: any = null;
    let lastWidth = 0;
    let lastHeight = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (Math.abs(width - lastWidth) < 1 && Math.abs(height - lastHeight) < 1) {
        return; // Ignore subpixel flex layout shifts that don't change actual size
      }
      lastWidth = width;
      lastHeight = height;

      // 2. Debounce normal resize events to save rendering time
      if (resizeTimeout) clearTimeout(resizeTimeout);
      
      // Instantly hide the canvas during any resize event
      startBlackout();

      // Jitter the timeout randomly to stagger mass GPU texture reallocations
      // preventing Chromium GPU crashes when 15+ terminals resize simultaneously.
      const staggerJitter = 40 + Math.random() * 80;
      resizeTimeout = setTimeout(() => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame((now) => {
          terminalMetricsCollector.recordFrame(paneId, now);
          if (containerRef.current) {
            try {
              fitAddon.fit();
              // After fitting to the new idle size, start the 800ms blackout countdown!
              if (!isAnimatingRef.current) {
                endBlackoutAfterDelay(800);
              }
            } catch (e) {}
          }
          resizeFrame = null;
        });
        resizeTimeout = null;
      }, staggerJitter);
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
      if (resizeTimeout) clearTimeout(resizeTimeout);
      if (unlistenExit) unlistenExit();
      try {
        term.dispose();
      } catch (e) {
        console.warn('Error during terminal cleanup:', e);
      }
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

  // Fit layout once transitions complete has been removed as ResizeObserver natively handles it.

  return (
    <div className="terminal-pane terminal-pane-direct relative w-full h-full bg-[#000000] font-mono overflow-hidden">
      <div 
        ref={containerRef} 
        className="w-full h-full flex-1" 
        style={{ 
          minHeight: '100%',
          opacity: isBlackout ? 0 : 1,
          transition: isBlackout ? 'none' : 'opacity 150ms ease-in'
        }} 
      />
    </div>
  );
});
