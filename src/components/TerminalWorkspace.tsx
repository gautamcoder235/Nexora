import React, { useState, useRef, useEffect } from "react";
import { Terminal as TerminalIcon, X, LayoutGrid, Columns2, Rows2, ClipboardList, RefreshCw, RotateCcw, Minimize2, Maximize2, Plus, Check, Loader2 } from "lucide-react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { TerminalSession } from "../types";
import { TerminalPane } from "./terminal/TerminalPane";
import { EventBus } from "../core/events";
import { listen } from "@tauri-apps/api/event";

// ==========================================
// Single Terminal Panel Component
// ==========================================
interface TerminalFrameProps {
  session: TerminalSession;
  isFocused: boolean;
  isAnimating: boolean;
  isHighlighted?: boolean;
  isHidden?: boolean;
  globalRefreshKey: number;
  onFocusToggle: (element: HTMLElement | null) => void;
  dragFileType?: 'image' | 'file' | null;
}

const TerminalFrame: React.FC<TerminalFrameProps> = React.memo(({ session, isFocused, isAnimating, isHighlighted, isHidden = false, globalRefreshKey, onFocusToggle, dragFileType = null }) => {
  const killTerminal = useOrchestratorStore(s => s.killTerminal);
  const settings = useOrchestratorStore(s => s.settings);
  const agents = useOrchestratorStore(s => s.agents);
  const completedTerminals = useOrchestratorStore(s => s.completedTerminals);
  const renameTerminal = useOrchestratorStore(s => s.renameTerminal);
  const clearTerminalCompleted = useOrchestratorStore(s => s.clearTerminalCompleted);

  const frameRef = useRef<HTMLDivElement>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const refreshKey = localRefreshKey + globalRefreshKey;

  const agent = agents.find(a => a.id === session.agentId);
  const isWorking = session.executionState === 'running';
  const isCompleted = session.executionState === 'completed';
  const isFailed = session.executionState === 'failed';
  const isAborted = session.executionState === 'aborted';

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);

  useEffect(() => {
    setEditTitle(session.title);
  }, [session.title]);

  const handleSaveRename = () => {
    if (editTitle.trim() && editTitle.trim() !== session.title) {
      renameTerminal(session.id, editTitle.trim());
    }
    setIsEditing(false);
  };
  
  useEffect(() => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('set_terminal_visibility', { 
        sessionId: session.id, 
        visibility: isHidden ? 'Hidden' : 'Visible' 
      }).catch(err => console.error('Failed to set terminal visibility:', err));
    });
  }, [isHidden, session.id]);

  let borderClass = "border-[var(--border-glass)] hover:border-[var(--border-glass-hover)]";
  if (isHighlighted) {
    borderClass = "border-[var(--accent-primary)] shadow-[0_0_12px_rgba(var(--accent-primary-rgb),0.3)]";
  } else if (isCompleted) {
    borderClass = "terminal-border-pulse";
  } else if (isFocused) {
    borderClass = "border-[rgba(var(--accent-primary-rgb),0.8)] shadow-[0_0_8px_rgba(255,255,255,0.05)]";
  }
  
  return (
    <div 
      ref={frameRef}
      onMouseDown={() => {
        if (isCompleted || isFailed || isAborted) {
          useOrchestratorStore.getState().updateTerminalExecutionState(session.id, 'idle');
          clearTerminalCompleted(session.id);
        }
      }}
      className={`flex-grow flex flex-col bg-[var(--bg-primary)] rounded border overflow-hidden relative group font-mono min-w-0 transition-all duration-300 h-full min-h-0 ${borderClass}`}
    >
      {/* Title / Action bar */}
      {settings.appearance?.layout?.showTerminalTitleBar !== false && (
        <div className="flex items-center justify-between px-2.5 h-[26px] bg-gradient-to-r from-[var(--bg-primary)]/80 to-[var(--bg-secondary)]/30 backdrop-blur-md border-b border-[var(--border-glass)] text-[9.5px] select-none text-[var(--text-secondary)] flex-shrink-0 rounded-t-[inherit]">
          <div className="flex items-center gap-2 truncate group/title">
            {/* Left Status Indicator */}
            {isWorking ? (
              <Loader2 size={11} className="text-[var(--accent-warning)] animate-spin" />
            ) : isCompleted ? (
              <Check size={11} className="text-[var(--agent-status-success)] drop-shadow-[0_0_2px_rgba(52,211,153,0.4)]" />
            ) : (
              <TerminalIcon size={11} className="text-[var(--text-muted)]" />
            )}

            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename();
                  if (e.key === 'Escape') {
                    setEditTitle(session.title);
                    setIsEditing(false);
                  }
                }}
                className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-glass)] px-1 py-0.5 rounded text-[9.5px] font-mono focus:outline-none focus:border-[var(--accent-primary)]"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              <span 
                className="truncate font-bold font-sans tracking-wide text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer select-none"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                title="Double click to rename"
              >
                {session.title}
              </span>
            )}
            
            {/* Compact ID Tag */}
            <span className="text-[7.5px] font-mono tracking-widest bg-[var(--bg-glass-light)]/20 border border-[var(--border-glass)] text-[var(--text-muted)] px-1.5 py-0.5 rounded uppercase opacity-0 group-hover/title:opacity-100 transition-opacity duration-200">
              {session.id.substring(0, 6)}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 text-[var(--text-secondary)] opacity-60 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={(e) => { e.stopPropagation(); setLocalRefreshKey(prev => prev + 1); }} 
              title="Refresh Terminal Display"
              className="hover:text-[var(--text-primary)] p-1 hover:bg-[var(--border-glass)] rounded transition-colors cursor-pointer"
            >
              <RotateCcw size={10} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onFocusToggle(frameRef.current); }} 
              title={isFocused ? "Exit Focus Mode" : "Focus Session"}
              className="hover:text-[var(--text-primary)] p-1 hover:bg-[var(--border-glass)] rounded transition-colors cursor-pointer"
            >
              {isFocused ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); killTerminal(session.id); }} 
              title="Kill Terminal Session"
              className="hover:text-[var(--accent-error)] p-1 hover:bg-[rgba(var(--accent-error-rgb),0.1)] rounded transition-colors cursor-pointer"
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      {/* Terminal Viewport Container (Renders our block-based TerminalPane) */}
      <div className="flex-grow flex-1 min-h-0 w-full overflow-hidden relative bg-[var(--bg-primary)]">
        <TerminalPane paneId={session.id} isFocused={isFocused} isAnimating={isAnimating} refreshKey={refreshKey} dragFileType={dragFileType} />
      </div>
    </div>
  );
});


// ==========================================
// Terminal Workspace Grid Panel
// ==========================================

const GlassyResizeHandle = ({ id, isVertical }: { id?: string, isVertical: boolean }) => (
  <PanelResizeHandle
    id={id}
    className={`flex items-center justify-center group z-40 relative ${
      isVertical ? 'cursor-col-resize w-[6px] h-full mx-[0px]' : 'cursor-row-resize h-[6px] w-full my-[0px]'
    }`}
  >
    <div 
      className={`bg-[var(--border-glass)] group-hover:bg-[var(--accent-primary)] group-active:bg-[var(--accent-primary)] transition-colors duration-150 ${
        isVertical ? 'w-[2px] h-full' : 'h-[2px] w-full'
      }`} 
    />
  </PanelResizeHandle>
);

export const TerminalWorkspace: React.FC = () => {
  const terminals = useOrchestratorStore(s => s.terminals);
  const layout = useOrchestratorStore(s => s.layout);
  const changeLayoutType = useOrchestratorStore(s => s.changeLayoutType);
  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const isTaskCenterVisible = useOrchestratorStore(s => s.isTaskCenterVisible);
  const setTaskCenterVisible = useOrchestratorStore(s => s.setTaskCenterVisible);
  const isSidebarVisible = useOrchestratorStore((s) => s.isSidebarVisible);
  const isAgentPanelPinned = useOrchestratorStore((s) => s.isAgentPanelPinned);
  const isSidebarTakingSpace = isSidebarVisible && isAgentPanelPinned;
  
  const [isLg, setIsLg] = useState(() => window.innerWidth >= 1024);
  const [globalRefreshKey, setGlobalRefreshKey] = useState(0);
  
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null);
  const [dragOverType, setDragOverType] = useState<'image' | 'file' | null>(null);

  useEffect(() => {
    const isImageFile = (path: string) => {
      const ext = path.split('.').pop()?.toLowerCase();
      return ext ? ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext) : false;
    };

    const unlistenEnter = listen<{ paths: string[] }>("tauri://drag-enter", (event) => {
      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        const hasImage = paths.some(isImageFile);
        setDragOverType(hasImage ? 'image' : 'file');
      }
    });

    const unlistenOver = listen<{ position: { x: number; y: number } }>("tauri://drag-over", (event) => {
      if (!dragOverType) return;
      const { x, y } = event.payload.position;
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(x / dpr, y / dpr);
      const paneEl = el?.closest('.terminal-pane');
      const paneId = paneEl?.getAttribute('data-pane-id');
      setDragOverPaneId(paneId || null);
    });

    const unlistenLeave = listen<void>("tauri://drag-leave", () => {
      setDragOverType(null);
      setDragOverPaneId(null);
    });

    const unlistenDrop = listen<{ paths: string[]; position: { x: number; y: number } }>("tauri://drag-drop", async (event) => {
      if (!dragOverType) return;
      
      setDragOverType(null);
      const { x, y } = event.payload.position;
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(x / dpr, y / dpr);
      const paneEl = el?.closest('.terminal-pane');
      const paneId = paneEl?.getAttribute('data-pane-id');

      setDragOverPaneId(null);

      if (paneId && event.payload.paths && event.payload.paths.length > 0) {
        const filePath = event.payload.paths[0];
        const formattedPath = filePath.includes(" ") ? `"${filePath}" ` : `${filePath} `;
        
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('write_pty', { sessionId: paneId, data: formattedPath });
          
          // Re-arm watchdog/execution state
          const store = useOrchestratorStore.getState();
          const session = store.terminals.find(t => t.id === paneId);
          if (session && session.executionState === 'idle') {
            store.updateTerminalExecutionState(paneId, 'running');
          }
        } catch (err) {
          console.error('Failed to write file path via native drop:', err);
        }
      }
    });

    return () => {
      unlistenEnter.then((fn) => fn());
      unlistenOver.then((fn) => fn());
      unlistenLeave.then((fn) => fn());
      unlistenDrop.then((fn) => fn());
    };
  }, [dragOverType]);

  useEffect(() => {
    const handleResize = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [highlightedAgentId, setHighlightedAgentId] = useState<string | null>(null);
  const [animatingSessionId, setAnimatingSessionId] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const animationFallbackTimeoutRef = useRef<any>(null);
  const [transformStyle, setTransformStyle] = useState<React.CSSProperties>({});
  
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const unsub = EventBus.subscribe("terminal:highlight", (payload: any) => {
      setHighlightedAgentId(payload.agentId);
      clearTimeout(timeout);
      timeout = setTimeout(() => setHighlightedAgentId(null), 2000);
    });
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (animationFallbackTimeoutRef.current) {
        clearTimeout(animationFallbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    import('../services/TerminalMetrics').then(({ terminalMetricsCollector }) => {
      terminalMetricsCollector.updateFocusSession(focusSessionId);
    });
  }, [focusSessionId]);

  const workspaceRef = useRef<HTMLDivElement>(null);

  // Measure and trigger collapse animation once layout has updated and grid geometry is restored
  useEffect(() => {
    if (animatingSessionId && !isExpanding && workspaceRef.current) {
      const sessionId = animatingSessionId;
      const frameEl = workspaceRef.current.querySelector(`[data-frame-id="${sessionId}"]`) as HTMLElement;
      const placeholderEl = workspaceRef.current.querySelector(`[data-placeholder-id="${sessionId}"]`) as HTMLElement;

      if (frameEl && placeholderEl) {
        // Measure placeholder in its fully restored grid position
        const startRect = frameEl.getBoundingClientRect();
        const endRect = placeholderEl.getBoundingClientRect();
        const workspaceRect = workspaceRef.current.getBoundingClientRect();

        const scaleX = endRect.width / startRect.width;
        const scaleY = endRect.height / startRect.height;
        const translateX = endRect.left - workspaceRect.left;
        const translateY = endRect.top - workspaceRect.top;

        // Force browser layout reflow before starting the transition
        void frameEl.offsetHeight;

        requestAnimationFrame(() => {
          setTransformStyle({
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
            transformOrigin: 'top left',
            zIndex: 50,
            transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
          });
        });
      }
    }
  }, [animatingSessionId, isExpanding]);

  // If the focused session is deleted, reset the focus state
  useEffect(() => {
    if (focusSessionId && !terminals.some(t => t.id === focusSessionId)) {
      setFocusSessionId(null);
      setAnimatingSessionId(null);
      setTransformStyle({});
    }
  }, [terminals, focusSessionId]);

  const handleFocusToggle = (sessionId: string, frameEl: HTMLElement | null) => {
    if (!frameEl || !workspaceRef.current) {
      setFocusSessionId(prev => prev === sessionId ? null : sessionId);
      return;
    }

    const isCurrentlyFocused = focusSessionId === sessionId;

    if (isCurrentlyFocused) {
      // Minimize (Exit Focus Mode)
      setAnimatingSessionId(sessionId);
      setIsExpanding(false);
      setFocusSessionId(null);
      
      if (animationFallbackTimeoutRef.current) clearTimeout(animationFallbackTimeoutRef.current);
      animationFallbackTimeoutRef.current = setTimeout(() => {
        if (animatingSessionId === sessionId) {
          setAnimatingSessionId(null);
          setTransformStyle({});
        }
      }, 400);

      // Start state: full screen
      setTransformStyle({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        transform: 'translate(0px, 0px) scale(1, 1)',
        transformOrigin: 'top left',
        zIndex: 50,
        transition: 'none',
      });
    } else {
      // Maximize (Enter Focus Mode)
      const startRect = frameEl.getBoundingClientRect();
      const workspaceRect = workspaceRef.current.getBoundingClientRect();

      const scaleX = startRect.width / workspaceRect.width;
      const scaleY = startRect.height / workspaceRect.height;
      const translateX = startRect.left - workspaceRect.left;
      const translateY = startRect.top - workspaceRect.top;

      setAnimatingSessionId(sessionId);
      setIsExpanding(true);
      setFocusSessionId(sessionId);
      
      if (animationFallbackTimeoutRef.current) clearTimeout(animationFallbackTimeoutRef.current);
      animationFallbackTimeoutRef.current = setTimeout(() => {
        if (animatingSessionId === sessionId) {
          setAnimatingSessionId(null);
          setTransformStyle({});
        }
      }, 400);

      // Start state: inverted (looks like it's still in the grid)
      setTransformStyle({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
        transformOrigin: 'top left',
        zIndex: 50,
        transition: 'none',
      });

      // Animate to full screen
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransformStyle({
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transform: 'translate(0px, 0px) scale(1, 1)',
            transformOrigin: 'top left',
            zIndex: 50,
            transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
          });
        });
      });
    }
  };

  return (
    <div className="flex-grow flex flex-col h-full space-y-1 relative">
      {/* Terminal Workspace Controls Header */}
      <div className="flex items-center justify-between px-3 h-[28px] bg-[var(--bg-primary)]/40 backdrop-blur-md border border-[var(--border-glass)] rounded-lg select-none flex-shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon size={12.5} className="text-[var(--accent-primary)] drop-shadow-[0_0_4px_rgba(var(--accent-primary-rgb),0.4)]" />
          <span 
            className="text-[10px] font-extrabold font-mono tracking-widest uppercase bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(to right, var(--text-primary), var(--text-secondary))",
            }}
          >
            Terminal Workspace
          </span>
          <span className="text-[9px] bg-[var(--bg-glass-light)]/20 border border-[var(--border-glass)] text-[var(--text-secondary)] font-semibold px-2 py-0.5 rounded-full font-mono">
            {terminals.length} Session{terminals.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Action Controls & Layout Toggles */}
        <div className="flex items-center gap-1 bg-[var(--bg-secondary)] border border-[var(--border-glass)] p-0.5 rounded-md">
          {/* Refresh Controls */}
          <button
            onClick={() => setGlobalRefreshKey(prev => prev + 1)}
            title="Refresh All Terminals"
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass-hover)] cursor-pointer transition-colors"
          >
            <RefreshCw size={11.5} />
          </button>
          
          <button
            onClick={() => setTaskCenterVisible(!isTaskCenterVisible)}
            title={isTaskCenterVisible ? "Hide Task Board" : "Show Task Board"}
            className={`p-1 rounded cursor-pointer transition-all ${
              isTaskCenterVisible 
                ? 'bg-[rgba(var(--accent-primary-rgb),0.18)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.35)] shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.15)]' 
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass-hover)] border border-transparent'
            }`}
          >
            <ClipboardList size={11.5} />
          </button>

          {/* Vertical divider separator */}
          <div className="w-[1px] h-[12px] bg-[var(--border-glass)] mx-0.5" />

          {/* Layout Toggles */}
          <button
            onClick={() => changeLayoutType('grid')}
            title="Grid Layout"
            className={`p-1 rounded transition-all cursor-pointer ${
              layout.type === 'grid' 
                ? 'bg-[rgba(var(--accent-primary-rgb),0.18)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.35)] shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.15)]' 
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass-hover)] border border-transparent'
            }`}
          >
            <LayoutGrid size={11.5} />
          </button>
          <button
            onClick={() => changeLayoutType('vertical')}
            title="Vertical Splits"
            className={`p-1 rounded transition-all cursor-pointer ${
              layout.type === 'vertical' 
                ? 'bg-[rgba(var(--accent-primary-rgb),0.18)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.35)] shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.15)]' 
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass-hover)] border border-transparent'
            }`}
          >
            <Columns2 size={11.5} />
          </button>
          <button
            onClick={() => changeLayoutType('horizontal')}
            title="Horizontal Splits"
            className={`p-1 rounded transition-all cursor-pointer ${
              layout.type === 'horizontal' 
                ? 'bg-[rgba(var(--accent-primary-rgb),0.18)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.35)] shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.15)]' 
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass-hover)] border border-transparent'
            }`}
          >
            <Rows2 size={11.5} />
          </button>
        </div>
      </div>

      {/* Render Grid/Splits of active terminals with smooth expand animation */}
      {terminals.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center bg-[var(--bg-primary)]/20 border border-[var(--border-glass)] border-dashed rounded-lg h-full p-8 text-center text-[var(--text-muted)] font-mono select-none">
          <TerminalIcon size={36} className="text-[var(--text-muted)] mb-3 animate-pulse" />
          <p className="text-xs font-semibold text-[var(--text-secondary)]">Terminal Panel Idle</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 max-w-[280px]">
            Launch an Agent CLI or click "+" in the Agent Panel to spawn interactive shells.
          </p>
        </div>
      ) : (
        <div ref={workspaceRef} className="flex-1 min-h-0 relative flex flex-col w-full h-full">
          {(() => {
            const renderTerminal = (session: TerminalSession, index: number) => {
              const isFocused = focusSessionId === session.id;
              const isAnimating = animatingSessionId === session.id;
              const showPlaceholder = isFocused || isAnimating;

              let wrapperStyle: React.CSSProperties = {};

              if (isFocused || isAnimating) {
                if (isAnimating) {
                  wrapperStyle = transformStyle;
                } else {
                  wrapperStyle = {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 50,
                  };
                }
              } else if (focusSessionId !== null) {
                if (animatingSessionId !== null) {
                  wrapperStyle = {
                    width: '100%',
                    height: '100%',
                    opacity: 0.15,
                    transition: 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                    pointerEvents: 'none',
                  };
                } else {
                  wrapperStyle = {
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    pointerEvents: 'none',
                  };
                }
              } else if (animatingSessionId !== null) {
                wrapperStyle = {
                  width: '100%',
                  height: '100%',
                  opacity: 0.15,
                  transition: 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                  pointerEvents: 'none',
                };
              } else {
                wrapperStyle = { width: '100%', height: '100%' };
                wrapperStyle.transition = 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)';
              }

              return (
                <React.Fragment key={session.id}>
                  {showPlaceholder && (
                    <div 
                      key={`placeholder-${session.id}`}
                      data-placeholder-id={session.id}
                      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                      className="border border-dashed border-[var(--border-glass)] rounded bg-[var(--bg-primary)]/40 min-h-0 min-w-0 h-full"
                    />
                  )}
                  <div
                    key={`frame-wrapper-${session.id}`}
                    data-frame-id={session.id}
                    className="overflow-hidden flex flex-col h-full min-h-0 min-w-0"
                    style={wrapperStyle}
                    onTransitionEnd={(e) => {
                      if (isAnimating && e.propertyName === 'transform') {
                        if (animationFallbackTimeoutRef.current) clearTimeout(animationFallbackTimeoutRef.current);
                        setAnimatingSessionId(null);
                        setTransformStyle({});
                      }
                    }}
                  >
                    <TerminalFrame 
                      session={session} 
                      isFocused={isFocused}
                      isAnimating={isAnimating}
                      isHighlighted={!!highlightedAgentId && session.agentId === highlightedAgentId}
                      isHidden={focusSessionId !== null && focusSessionId !== session.id}
                      onFocusToggle={(frameEl) => handleFocusToggle(session.id, frameEl)}
                      globalRefreshKey={globalRefreshKey}
                      dragFileType={dragOverPaneId === session.id ? dragOverType : null}
                    />
                  </div>
                </React.Fragment>
              );
            };

            if (layout.type === 'grid' && terminals.length > 2) {
              const maxCols = isLg ? 4 : 2;
              const targetRows = Math.ceil(terminals.length / maxCols);
              const gridColumns = Math.ceil(terminals.length / targetRows);

              const rows: TerminalSession[][] = [];
              for (let i = 0; i < terminals.length; i += gridColumns) {
                rows.push(terminals.slice(i, i + gridColumns));
              }

              return (
                <PanelGroup orientation="vertical">
                  {rows.map((row, rowIndex) => (
                    <React.Fragment key={`row-${rowIndex}`}>
                      <Panel minSize={15}>
                        <PanelGroup orientation="horizontal">
                          {row.map((session, colIndex) => {
                            const absoluteIndex = rowIndex * gridColumns + colIndex;
                            return (
                              <React.Fragment key={session.id}>
                                <Panel minSize={15}>
                                  {renderTerminal(session, absoluteIndex)}
                                </Panel>
                                {colIndex < row.length - 1 && !focusSessionId && (
                                  <GlassyResizeHandle isVertical={true} id={`resize-${rowIndex}-${colIndex}`} />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </PanelGroup>
                      </Panel>
                      {rowIndex < rows.length - 1 && !focusSessionId && (
                        <GlassyResizeHandle isVertical={false} id={`resize-row-${rowIndex}`} />
                      )}
                    </React.Fragment>
                  ))}
                </PanelGroup>
              );
            } else {
              const direction = (layout.type === 'vertical' || layout.type === 'grid') ? 'horizontal' : 'vertical';
              const isVerticalResize = direction === 'horizontal';

              return (
                <PanelGroup orientation={direction}>
                  {terminals.map((session, index) => (
                    <React.Fragment key={session.id}>
                      <Panel minSize={15}>
                        {renderTerminal(session, index)}
                      </Panel>
                      {index < terminals.length - 1 && !focusSessionId && (
                        <GlassyResizeHandle isVertical={isVerticalResize} id={`resize-${index}`} />
                      )}
                    </React.Fragment>
                  ))}
                </PanelGroup>
              );
            }
          })()}
        </div>
      )}
    </div>
  );
};
