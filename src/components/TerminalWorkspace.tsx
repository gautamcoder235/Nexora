import React, { useState, useRef, useEffect } from "react";
import { Terminal as TerminalIcon, X, Grid, AlignJustify, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { TerminalSession } from "../types";
import { TerminalPane } from "./terminal/TerminalPane";
import { EventBus } from "../core/events";

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
}

const TerminalFrame: React.FC<TerminalFrameProps> = React.memo(({ session, isFocused, isAnimating, isHighlighted, isHidden = false, globalRefreshKey, onFocusToggle }) => {
  const killTerminal = useOrchestratorStore(s => s.killTerminal);
  const frameRef = useRef<HTMLDivElement>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const refreshKey = localRefreshKey + globalRefreshKey;
  
  useEffect(() => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('set_terminal_visibility', { 
        sessionId: session.id, 
        visibility: isHidden ? 'Hidden' : 'Visible' 
      }).catch(err => console.error('Failed to set terminal visibility:', err));
    });
  }, [isHidden, session.id]);
  
  return (
    <div 
      ref={frameRef}
      className={`flex-grow flex flex-col bg-[#000000] rounded border overflow-hidden relative group font-mono min-w-0 transition-all duration-300 h-full min-h-0 ${
        isHighlighted
          ? "border-[#f59e0b] shadow-[0_0_12px_rgba(245,158,11,0.3)]"
          : isFocused 
          ? "border-border-glass hover:border-border-glass-hover" 
          : "border-border-glass hover:border-border-glass-hover"
      }`}
    >
      {/* Title / Action bar */}
      <div className="flex items-center justify-between px-2 h-[24px] bg-white/[0.03] backdrop-blur-md border-b border-border-glass/35 text-[9.5px] select-none text-zinc-400 flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] rounded-t-[inherit]">
        <div className="flex items-center gap-1.5 truncate">
          <TerminalIcon size={10.5} className="text-zinc-500 flex-shrink-0" />
          <span className="truncate font-semibold">{session.title}</span>
          <span className="text-[8px] bg-white/5 text-zinc-500 px-1 py-0.5 rounded font-bold font-mono tracking-wider">{session.id}</span>
        </div>

        <div className="flex items-center gap-1 text-zinc-500 opacity-60 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); setLocalRefreshKey(prev => prev + 1); }} 
            title="Refresh Terminal Display"
            className="hover:text-zinc-300 p-1 hover:bg-white/5 rounded cursor-pointer transition-colors"
          >
            <RotateCcw size={10} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onFocusToggle(frameRef.current); }} 
            title={isFocused ? "Exit Focus Mode" : "Focus Session"}
            className="hover:text-zinc-300 p-1 hover:bg-white/5 rounded cursor-pointer transition-colors"
          >
            {isFocused ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); killTerminal(session.id); }} 
            title="Kill Terminal Session"
            className="hover:text-rose-400 p-1 hover:bg-rose-500/10 rounded cursor-pointer transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* Terminal Viewport Container (Renders our block-based TerminalPane) */}
      <div className="flex-grow flex-1 min-h-0 w-full overflow-hidden relative bg-[#000000]">
        <TerminalPane paneId={session.id} isFocused={isFocused} isAnimating={isAnimating} refreshKey={refreshKey} />
      </div>
    </div>
  );
});


// ==========================================
// Terminal Workspace Grid Panel
// ==========================================

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

  // Early return logic moved into the main render to keep background workspaces alive
  // Calculate layout classes
  let containerClass = "flex gap-1.5 flex-1 min-h-0 ";
  const is2Terminals = terminals.length === 2;
  const isVertical = layout.type === 'grid' || layout.type === 'vertical';

  let gridColumns = 1;

  if (layout.type === 'grid') {
    if (terminals.length <= 2) {
      containerClass += "flex-row";
      gridColumns = terminals.length;
    } else {
      // Dynamic math engine to prioritize height over width (minimize rows)
      // Max 4 columns per row because 12 is divisible by 1, 2, 3, 4, 6.
      const maxCols = isLg ? 4 : 2;
      const targetRows = Math.ceil(terminals.length / maxCols);
      gridColumns = Math.ceil(terminals.length / targetRows);
      
      containerClass = "grid gap-1.5 flex-1 min-h-0 grid-cols-12 auto-rows-fr";
    }
  } else if (layout.type === 'vertical') {
    containerClass += "flex-row";
  } else {
    containerClass += "flex-col";
  }

  // Check if we are using the grid fallback
  const isGridFallback = layout.type === 'grid' && terminals.length > 2;

  const getNormalGridStyle = (_sessId: string, index?: number): React.CSSProperties => {
    if (isGridFallback && index !== undefined) {
      // Calculate perfect span in the 12-column grid to stretch last row items automatically
      const row = Math.floor(index / gridColumns);
      const totalRows = Math.ceil(terminals.length / gridColumns);
      const isLastRow = row === totalRows - 1;
      const itemsInThisRow = isLastRow ? (terminals.length % gridColumns || gridColumns) : gridColumns;
      const span = 12 / itemsInThisRow;
      
      return {
        gridColumn: `span ${span} / span ${span}`
      };
    }
    
    return {
      width: isVertical ? "auto" : "100%",
      height: !isVertical ? "auto" : "100%",
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
    };
  };

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
      {/* Terminal Workspace Controls */}
      <div className="flex items-center justify-between px-1 select-none flex-shrink-0">
        <span className="text-[11px] font-bold text-zinc-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
          <TerminalIcon size={12} />
          Terminal Multiplexer Grid ({terminals.length} Session{terminals.length > 1 ? "s" : ""})
        </span>

        {/* Layout Toggles */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setGlobalRefreshKey(prev => prev + 1)}
            title="Refresh All Terminals"
            className="p-1 rounded transition-colors border mr-1 cursor-pointer bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
          >
            <RotateCcw size={13} />
          </button>
          
          <button
            onClick={() => setTaskCenterVisible(!isTaskCenterVisible)}
            title={isTaskCenterVisible ? "Maximize Terminal View (Hide Task Board)" : "Show Task Board"}
            className={`p-1 rounded transition-colors border mr-1.5 cursor-pointer ${
              !isTaskCenterVisible 
                ? 'bg-accent-primary/10 text-accent-primary border-accent-primary/20' 
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-350'
            }`}
          >
            {isTaskCenterVisible ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
          </button>

          <button
            onClick={() => changeLayoutType('grid')}
            title="Grid Layout"
            className={`p-1 rounded transition-colors border cursor-pointer ${
              layout.type === 'grid' 
                ? 'bg-zinc-800/40 text-accent-primary border-zinc-700/50' 
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Grid size={13} />
          </button>
          <button
            onClick={() => changeLayoutType('vertical')}
            title="Vertical splits"
            className={`p-1 rounded transition-colors border cursor-pointer ${
              layout.type === 'vertical' 
                ? 'bg-zinc-800/40 text-accent-primary border-zinc-700/50' 
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-350'
            }`}
          >
            <AlignJustify size={13} className="rotate-90" />
          </button>
          <button
            onClick={() => changeLayoutType('horizontal')}
            title="Horizontal splits"
            className={`p-1 rounded transition-colors border cursor-pointer ${
              layout.type === 'horizontal' 
                ? 'bg-zinc-800/40 text-accent-primary border-zinc-700/50' 
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-350'
            }`}
          >
            <AlignJustify size={13} />
          </button>
        </div>
      </div>

      {/* Render Grid/Splits of active terminals with smooth expand animation */}
      {terminals.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center bg-bg-primary/20 border border-border-glass border-dashed rounded-lg h-full p-8 text-center text-zinc-500 font-mono select-none">
          <TerminalIcon size={36} className="text-zinc-850 mb-3 animate-pulse" />
          <p className="text-xs font-semibold text-zinc-450">Terminal Panel Idle</p>
          <p className="text-[10px] text-zinc-650 mt-1 max-w-[280px]">
            Launch an Agent CLI or click "+" in the Agent Panel to spawn interactive shells.
          </p>
        </div>
      ) : (
        <div ref={workspaceRef} className={`${containerClass} relative`}>
          {terminals.map((session, index) => {
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
                // Fade out other terminals during the transition
                wrapperStyle = {
                  ...getNormalGridStyle(session.id, index),
                  opacity: 0.15,
                  transition: 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                  pointerEvents: 'none',
                };
              } else {
                // Hide them completely once maximized without breaking xterm layout
                wrapperStyle = {
                  ...getNormalGridStyle(session.id, index),
                  opacity: 0,
                  pointerEvents: 'none',
                };
              }
            } else if (animatingSessionId !== null) {
              // Fade in other terminals smoothly during the minimize transition
              wrapperStyle = {
                ...getNormalGridStyle(session.id, index),
                opacity: 0.15,
                transition: 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                pointerEvents: 'none',
              };
            } else {
              // Normal layout flow
              wrapperStyle = getNormalGridStyle(session.id, index);
              wrapperStyle.transition = 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)';
            }

            return (
              <React.Fragment key={session.id}>
                {showPlaceholder && (
                  <div 
                    key={`placeholder-${session.id}`}
                    data-placeholder-id={session.id}
                    style={{ ...getNormalGridStyle(session.id, index), pointerEvents: 'none' }}
                    className="border border-dashed border-border-glass rounded bg-[#000000]/40 min-h-0 min-w-0 h-full"
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
                    isHighlighted={session.agentId === highlightedAgentId}
                    isHidden={focusSessionId !== null && focusSessionId !== session.id}
                    onFocusToggle={(frameEl) => handleFocusToggle(session.id, frameEl)}
                    globalRefreshKey={globalRefreshKey}
                  />
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}


    </div>
  );
};
