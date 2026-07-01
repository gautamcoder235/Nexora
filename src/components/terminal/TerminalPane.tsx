/**
 * Nexora — TerminalPane Component
 *
 * Renders a direct, interactive xterm.js terminal.
 * Key input is forwarded directly to the backend PTY and output is rendered in real-time.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { ThemeManager } from '../../services/ThemeManager';
import { DEFAULT_APP_SETTINGS } from '../../types';
import { TerminalBufferManager } from '../../services/TerminalBufferManager';
import { terminalMetricsCollector } from '../../services/TerminalMetrics';
import '@xterm/xterm/css/xterm.css';
import './TerminalPane.css';

interface TerminalPaneProps {
  paneId: string;
  isFocused: boolean;
  isAnimating: boolean;
  refreshKey?: number;
  isDragOver?: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = React.memo(({ paneId, isFocused, isAnimating, refreshKey, isDragOver = false }) => {
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

  const settings = useOrchestratorStore((s) => s.settings);
  const termSession = useOrchestratorStore((s) => s.terminals.find((t) => t.id === paneId));

  // Dynamic terminal theme updates on theme switch
  useEffect(() => {
    if (!termRef.current) return;
    const activeTheme = ThemeManager.getTheme(settings.appearance?.theme?.theme || 'Midnight');
    const termTheme = activeTheme.terminal;
    termRef.current.options.theme = {
      background: termTheme.background,
      foreground: termTheme.foreground,
      cursor: termTheme.cursor,
      black: termTheme.black,
      red: termTheme.red,
      green: termTheme.green,
      yellow: termTheme.yellow,
      blue: termTheme.blue,
      magenta: termTheme.magenta,
      cyan: termTheme.cyan,
      white: termTheme.white,
      brightBlack: termTheme.brightBlack,
      brightRed: termTheme.brightRed,
      brightGreen: termTheme.brightGreen,
      brightYellow: termTheme.brightYellow,
      brightBlue: termTheme.brightBlue,
      brightMagenta: termTheme.brightMagenta,
      brightCyan: termTheme.brightCyan,
      brightWhite: termTheme.brightWhite,
      cursorAccent: termTheme.cursorAccent,
      selectionBackground: termTheme.selectionBackground,
    };
  }, [settings.appearance?.theme]);

  useEffect(() => {
    if (!containerRef.current) return;

    const activeTheme = ThemeManager.getTheme(settings.appearance?.theme?.theme || 'Midnight');
    const termTheme = activeTheme.terminal;

    // Initialize interactive xterm.js instance
    const term = new Terminal({
      cursorBlink: settings.appearance?.terminal?.cursorBlink ?? DEFAULT_APP_SETTINGS.appearance.terminal.cursorBlink,
      cursorStyle: (settings.appearance?.terminal?.cursorStyle ?? DEFAULT_APP_SETTINGS.appearance.terminal.cursorStyle) as any,
      fontSize: settings.appearance?.typography?.terminalFontSize ?? DEFAULT_APP_SETTINGS.appearance.typography.terminalFontSize,
      fontFamily: settings.appearance?.typography?.terminalFontFamily ?? DEFAULT_APP_SETTINGS.appearance.typography.terminalFontFamily,
      scrollback: settings.appearance?.terminal?.terminalScrollbackLimit ?? DEFAULT_APP_SETTINGS.appearance.terminal.terminalScrollbackLimit,
      // @ts-ignore
      bellStyle: (settings.appearance?.terminal?.bellStyle === 'visual' ? 'none' : (settings.appearance?.terminal?.bellStyle || 'none')) as any,
      theme: {
        background: termTheme.background,
        foreground: termTheme.foreground,
        cursor: termTheme.cursor,
        black: termTheme.black,
        red: termTheme.red,
        green: termTheme.green,
        yellow: termTheme.yellow,
        blue: termTheme.blue,
        magenta: termTheme.magenta,
        cyan: termTheme.cyan,
        white: termTheme.white,
        brightBlack: termTheme.brightBlack,
        brightRed: termTheme.brightRed,
        brightGreen: termTheme.brightGreen,
        brightYellow: termTheme.brightYellow,
        brightBlue: termTheme.brightBlue,
        brightMagenta: termTheme.brightMagenta,
        brightCyan: termTheme.brightCyan,
        brightWhite: termTheme.brightWhite,
        cursorAccent: termTheme.cursorAccent,
        selectionBackground: termTheme.selectionBackground,
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

    let activeWebglAddon: WebglAddon | null = null;
    let activeCanvasAddon: CanvasAddon | null = null;

    // Load WebGL / Canvas renderer addon for smooth rendering, high FPS up to 240, and crisp text
    // MUST be called AFTER term.open() according to xterm.js spec!
    const useGpu = settings?.appearance?.terminal?.hardwareAcceleration ?? settings?.hardwareAcceleration ?? true;
    if (useGpu && isWebGL2Supported()) {
      try {
        const webglAddon = new WebglAddon();
        activeWebglAddon = webglAddon;
        
        // Safely handle WebGL context loss
        webglAddon.onContextLoss(() => {
          console.warn('WebGL context lost. Disposing and falling back to Canvas renderer.');
          // Defer to avoid crashing xterm's internal event dispatcher during the event
          setTimeout(() => {
            try { webglAddon.dispose(); } catch (e) {}
            activeWebglAddon = null;
            try {
              const canvasAddon = new CanvasAddon();
              activeCanvasAddon = canvasAddon;
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
          activeCanvasAddon = canvasAddon;
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
        activeCanvasAddon = canvasAddon;
        term.loadAddon(canvasAddon);
      } catch (err) {
        console.warn('Canvas initialization failed, falling back to standard DOM renderer:', err);
      }
    }
    
    // Fit to parent container dimensions and initialize size in PTY
    // Defer slightly to allow flexbox grid to settle dimensions, but do NOT 
    // block on document.fonts.ready as it triggers a 3-second timeout on missing fonts.
    setTimeout(() => {
      requestAnimationFrame(() => {
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
    }, 25);

    // Restore history safely from standalone Buffer Manager
    const bufferManager = TerminalBufferManager.getInstance();
    const historyPayload = bufferManager.getSnapshot(paneId);
    let lastWrittenSequenceId = bufferManager.getLastSequenceId(paneId);
    if (historyPayload) {
      term.write(historyPayload);
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Custom Key Event Handler for Clipboard (Copy/Paste) and Global App Shortcuts
    term.attachCustomKeyEventHandler((arg) => {
      // Allow app-level shortcuts to bubble up to the window listener
      if (arg.type === 'keydown') {
        const currentSettings = useOrchestratorStore.getState().settings;
        const shortcuts = { ...DEFAULT_APP_SETTINGS.shortcuts, ...(currentSettings?.shortcuts || {}) };
        
        const checkShortcut = (shortcutString: string | undefined) => {
          if (!shortcutString || shortcutString.toLowerCase() === 'none') return false;
          const parts = shortcutString.toLowerCase().split('+').map(s => s.trim());
          const key = parts[parts.length - 1];
          const needsCtrl = parts.includes('ctrl') || parts.includes('cmd');
          const needsShift = parts.includes('shift');
          const needsAlt = parts.includes('alt');
          
          const hasCtrl = arg.ctrlKey || arg.metaKey;
          if (needsCtrl !== hasCtrl) return false;
          if (needsShift !== arg.shiftKey) return false;
          if (needsAlt !== arg.altKey) return false;
          
          if (key === ',') return arg.key === ',';
          return arg.key.toLowerCase() === key || (arg.code || '').toLowerCase() === 'key' + key;
        };

        const isAppShortcut = 
          checkShortcut(shortcuts.toggleSidebar) ||
          checkShortcut(shortcuts.toggleTaskCenter) ||
          checkShortcut(shortcuts.toggleAddAgent) ||
          checkShortcut(shortcuts.openSettings) ||
          checkShortcut(shortcuts.toggleBrowser || 'Ctrl+Shift+B') ||
          checkShortcut(shortcuts.toggleReviewCenter || 'Ctrl+Shift+R');

        if (isAppShortcut) {
          return false; // Let it bubble up to the global window listener
        }
      }

      // Handle Copy: Ctrl+C or Cmd+C (only if text is selected, otherwise send SIGINT)
      // Also allow Ctrl+Shift+C explicitly for copying
      if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyC' && arg.type === 'keydown') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false; // Prevent xterm from sending ^C to the process
        } else {
          // If no text selection, Ctrl+C sends SIGINT to abort the active task. Flag it for the watchdog!
          import('../../services/TerminalBufferManager').then((m) => {
            m.TerminalBufferManager.getInstance().setAbortedPending(paneId);
          }).catch(err => console.error('Failed to import TerminalBufferManager:', err));
        }
      }
      
      // Handle Escape: Flag aborted pending for watchdog (used to cancel active queries)
      if (arg.key === 'Escape' && arg.type === 'keydown') {
        import('../../services/TerminalBufferManager').then((m) => {
          m.TerminalBufferManager.getInstance().setAbortedPending(paneId);
        }).catch(err => console.error('Failed to import TerminalBufferManager:', err));
      }
      
      // Handle Paste: Ctrl+V or Cmd+V
      // In Tauri, native shortcuts might be blocked without a menu, so we manually intercept and write to PTY.
      // We call preventDefault() to prevent the browser's native paste event from also firing (causing double paste).
      if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyV' && arg.type === 'keydown') {
        arg.preventDefault();
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

    const doCopy = settings?.appearance?.terminal?.copyOnSelect ?? settings?.copyOnSelect ?? true;
    if (doCopy) {
      term.onSelectionChange(() => {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
        }
      });
    }

    // Listen to user input and write directly to PTY
    const onDataDisposable = term.onData(async (data) => {
      // Transition from 'idle' to 'running' on keypress input (ignore focus/mouse system sequences)
      const store = useOrchestratorStore.getState();
      const session = store.terminals.find(t => t.id === paneId);
      const isSystemSequence = data === '\x1b[I' || data === '\x1b[O' || data.startsWith('\x1b[M') || data.startsWith('\x1b[<');
      
      if (!isSystemSequence && session && session.executionState === 'idle') {
        store.updateTerminalExecutionState(paneId, 'running');
      }

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
      if (chunk.sequenceId === -1 || chunk.sequenceId > lastWrittenSequenceId) {
        writeQueue += chunk.data;
        if (chunk.sequenceId !== -1) {
          lastWrittenSequenceId = chunk.sequenceId;
        }
        
        // Coalesce multiple chunks arriving within the same frame
        if (coalesceFrameId === null) {
          coalesceFrameId = requestAnimationFrame(drainQueue);
        }
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
      
      // xterm.js does NOT automatically dispose addons when the main terminal is disposed.
      // We must explicitly destroy the WebGL contexts to prevent GPU leak limit crashes!
      try {
        if (activeWebglAddon) activeWebglAddon.dispose();
      } catch (e) { console.warn('WebGL addon dispose error:', e); }
      
      try {
        if (activeCanvasAddon) activeCanvasAddon.dispose();
      } catch (e) { console.warn('Canvas addon dispose error:', e); }
      
      try {
        fitAddon.dispose();
      } catch (e) { console.warn('Fit addon dispose error:', e); }

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
      const tFs = settings.appearance?.typography?.terminalFontSize ?? DEFAULT_APP_SETTINGS.appearance.typography.terminalFontSize;
      const tFf = settings.appearance?.typography?.terminalFontFamily ?? DEFAULT_APP_SETTINGS.appearance.typography.terminalFontFamily;
      const tCb = settings.appearance?.terminal?.cursorBlink ?? DEFAULT_APP_SETTINGS.appearance.terminal.cursorBlink;
      const tCs = settings.appearance?.terminal?.cursorStyle ?? DEFAULT_APP_SETTINGS.appearance.terminal.cursorStyle;
      const tSb = settings.appearance?.terminal?.terminalScrollbackLimit ?? DEFAULT_APP_SETTINGS.appearance.terminal.terminalScrollbackLimit;
      const tBs = settings.appearance?.terminal?.bellStyle ?? DEFAULT_APP_SETTINGS.appearance.terminal.bellStyle;

      term.options.fontSize = tFs;
      term.options.fontFamily = tFf;
      term.options.cursorBlink = tCb;
      term.options.cursorStyle = tCs as any;
      term.options.cursorInactiveStyle = tCs as any; // Forces unfocused cursor to match preview!
      term.options.scrollback = tSb;
      // @ts-ignore
      term.options.bellStyle = (tBs === 'visual' ? 'none' : (tBs || 'none')) as any;
      
      // Force focus to trigger immediate cursor redraw in WebGL
      term.focus();
    }
  }, [
    settings.appearance?.typography?.terminalFontSize,
    settings.appearance?.typography?.terminalFontFamily,
    settings.appearance?.terminal?.cursorBlink,
    settings.appearance?.terminal?.cursorStyle,
    settings.appearance?.terminal?.terminalScrollbackLimit,
    settings.appearance?.terminal?.bellStyle
  ]);

  // Fit layout once transitions complete has been removed as ResizeObserver natively handles it.

  return (
    <div 
      data-pane-id={paneId}
      className="terminal-pane terminal-pane-direct relative w-full h-full bg-[#000000] font-mono overflow-hidden"
    >
      {/* Connecting/Loading Overlay */}
      {termSession?.status === 'connecting' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#000000]/70 backdrop-blur-[6px] transition-all duration-300 pointer-events-none select-none">
          <div className="flex flex-col items-center justify-center p-6 text-center gap-3">
            <div className="w-8 h-8 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
            <div>
              <p className="text-zinc-200 text-[11px] font-mono tracking-wide">
                Warming PTY Shell...
              </p>
              <p className="text-zinc-500 text-[9px] font-mono mt-1">
                Allocating process context
              </p>
            </div>
          </div>
        </div>
      )}
      <div 
        ref={containerRef} 
        className="w-full h-full flex-1" 
        style={{ 
          minHeight: '100%',
          opacity: isBlackout ? 0 : 1,
          transition: isBlackout ? 'none' : 'opacity 150ms ease-in'
        }} 
      />

      {/* Transparent Glassmorphic Image Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#09090b]/85 backdrop-blur-[3px] transition-all duration-300 pointer-events-none select-none">
          <div className="m-2.5 inset-0 absolute border-2 border-dashed border-[#38bdf8]/40 rounded-lg flex flex-col items-center justify-center p-6 text-center gap-3">
            <div className="p-3 bg-[#38bdf8]/10 border border-[#38bdf8]/20 rounded-full animate-bounce">
              <ImageIcon className="w-6 h-6 text-[#38bdf8]" />
            </div>
            <div>
              <p className="text-zinc-100 text-[11px] font-bold tracking-wider uppercase font-sans">
                Drop to send image
              </p>
              <p className="text-zinc-400 text-[9px] font-mono mt-1 max-w-[200px]">
                Inserts absolute image path into terminal input
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
