import React, { useState, useRef, useEffect } from "react";
import { Terminal as TerminalIcon, X, Grid, AlignJustify, Maximize2, Minimize2 } from "lucide-react";
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
  onFocusToggle: (element: HTMLElement | null) => void;
}

const TerminalFrame: React.FC<TerminalFrameProps> = React.memo(({ session, isFocused, isAnimating, isHighlighted, onFocusToggle }) => {
  const killTerminal = useOrchestratorStore(s => s.killTerminal);
  const frameRef = useRef<HTMLDivElement>(null);
  
  return (
    <div 
      ref={frameRef}
      className={`flex-grow flex flex-col bg-[#0a0a0a] rounded border overflow-hidden relative group font-mono min-w-0 transition-all duration-300 h-full min-h-0 ${
        isHighlighted
          ? "border-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.4)]"
          : isFocused 
          ? "border-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.15)]" 
          : "border-[#232329] hover:border-zinc-800"
      }`}
    >
      {/* Title / Action bar */}
      <div className="flex items-center justify-between px-3 h-8 bg-[#0c0c0e] border-b border-[#1b1b22] text-[11px] select-none text-zinc-400 flex-shrink-0">
        <div className="flex items-center gap-2 truncate">
          <TerminalIcon size={12} className="text-zinc-500 flex-shrink-0" />
          <span className="truncate font-semibold">{session.title}</span>
          <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1 rounded font-bold">{session.id}</span>
        </div>

        <div className="flex items-center gap-2 text-zinc-500 opacity-60 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); onFocusToggle(frameRef.current); }} 
            title={isFocused ? "Exit Focus Mode" : "Focus Session"}
            className="hover:text-zinc-300 p-0.5 hover:bg-[#1a1a20] rounded"
          >
            {isFocused ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); killTerminal(session.id); }} 
            title="Kill Terminal Session"
            className="hover:text-rose-400 p-0.5 hover:bg-[#1a1a20] rounded"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Terminal Viewport Container (Renders our block-based TerminalPane) */}
      <div className="flex-grow flex-1 min-h-0 w-full overflow-hidden relative bg-[#0a0a0a]">
        <TerminalPane paneId={session.id} isFocused={isFocused} isAnimating={isAnimating} />
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
  
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [animatingSessionId, setAnimatingSessionId] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [highlightedAgentId, setHighlightedAgentId] = useState<string | null>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const unsub = EventBus.subscribe("terminal:highlight", (payload: any) => {
      setHighlightedAgentId(payload.agentId);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setHighlightedAgentId(null), 2000);
    });
    return () => {
      unsub();
      if (timeout) clearTimeout(timeout);
    };
  }, []);
  
  
  // Fallback timeout ref to prevent stuck animations
  const animationFallbackTimeoutRef = useRef<any>(null);
  const [transformStyle, setTransformStyle] = useState<React.CSSProperties>({});
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

  if (!activeWorkspaceId) {
    return null;
  }

  if (terminals.length === 0) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center bg-[#070709] border border-[#232329] border-dashed rounded-lg h-full p-8 text-center text-zinc-500 font-mono select-none">
        <TerminalIcon size={36} className="text-zinc-800 mb-3 animate-pulse" />
        <p className="text-xs font-semibold text-zinc-400">Terminal Panel Idle</p>
        <p className="text-[10px] text-zinc-600 mt-1 max-w-[280px]">
          Launch an Agent CLI or click "+" in the Agent Panel to spawn interactive shells.
        </p>
      </div>
    );
  }

  // Calculate layout classes
  let containerClass = "flex gap-1.5 flex-1 min-h-0 ";
  const is2Terminals = terminals.length === 2;
  const isVertical = layout.type === 'grid' || layout.type === 'vertical';

  if (layout.type === 'grid') {
    if (terminals.length === 1) {
      containerClass += "flex-row";
    } else if (is2Terminals) {
      containerClass += "flex-row";
    } else if (terminals.length === 4) {
      containerClass = "grid gap-1.5 flex-1 min-h-0 grid-cols-2 auto-rows-fr";
    } else {
      // Fallback to grid for 3+ terminals
      containerClass = "grid gap-1.5 flex-1 min-h-0 grid-cols-2 lg:grid-cols-3 auto-rows-fr";
    }
  } else if (layout.type === 'vertical') {
    containerClass += "flex-row";
  } else {
    containerClass += "flex-col";
  }

  // Check if we are using the grid fallback
  const isGridFallback = layout.type === 'grid' && terminals.length > 2;

  const getNormalGridStyle = (_sessId: string): React.CSSProperties => {
    if (isGridFallback) return {};
    
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
      
      if (animationFallbackTimeoutRef.current) clearTimeout(animationFallbackTimeoutRef.current);
      animationFallbackTimeoutRef.current = setTimeout(() => {
        if (animatingSessionId === sessionId) {
          setFocusSessionId(null);
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
    <div className="flex-grow flex flex-col h-full space-y-1.5 relative">
      {/* Terminal Workspace Controls */}
      <div className="flex items-center justify-between px-1 select-none flex-shrink-0">
        <span className="text-[11px] font-bold text-zinc-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
          <TerminalIcon size={12} />
          Terminal Multiplexer Grid ({terminals.length} Session{terminals.length > 1 ? "s" : ""})
        </span>

        {/* Layout Toggles */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTaskCenterVisible(!isTaskCenterVisible)}
            title={isTaskCenterVisible ? "Maximize Terminal View (Hide Task Board)" : "Show Task Board"}
            className={`p-1.5 rounded transition-colors border mr-1.5 ${
              !isTaskCenterVisible 
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {isTaskCenterVisible ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
          </button>

          <button
            onClick={() => changeLayoutType('grid')}
            title="Grid Layout"
            className={`p-1.5 rounded transition-colors border ${
              layout.type === 'grid' 
                ? 'bg-zinc-800 text-sky-400 border-zinc-700' 
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Grid size={13} />
          </button>
          <button
            onClick={() => changeLayoutType('vertical')}
            title="Vertical splits"
            className={`p-1.5 rounded transition-colors border ${
              layout.type === 'vertical' 
                ? 'bg-zinc-800 text-sky-400 border-zinc-700' 
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <AlignJustify size={13} className="rotate-90" />
          </button>
          <button
            onClick={() => changeLayoutType('horizontal')}
            title="Horizontal splits"
            className={`p-1.5 rounded transition-colors border ${
              layout.type === 'horizontal' 
                ? 'bg-zinc-800 text-sky-400 border-zinc-700' 
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <AlignJustify size={13} />
          </button>
        </div>
      </div>

      {/* Render Grid/Splits of terminals with smooth expand animation */}
      <div ref={workspaceRef} className={`${containerClass} relative`}>
        {terminals.map((session) => {
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
            // Another terminal is focused/maximized
            if (animatingSessionId !== null) {
              // Fade out other terminals during the transition
              wrapperStyle = {
                ...getNormalGridStyle(session.id),
                opacity: 0.15,
                transition: 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                pointerEvents: 'none',
              };
            } else {
              // Hide them completely once maximized without breaking xterm layout
              wrapperStyle = {
                ...getNormalGridStyle(session.id),
                opacity: 0,
                pointerEvents: 'none',
                visibility: 'hidden', // Ensures they don't block anything or get focus
              };
            }
          } else {
            // Normal layout flow
            wrapperStyle = getNormalGridStyle(session.id);
            wrapperStyle.transition = 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), flex-grow 300ms, width 300ms, height 300ms';
          }

          return (
            <React.Fragment key={session.id}>
              {showPlaceholder && (
                <div 
                  key={`placeholder-${session.id}`}
                  data-placeholder-id={session.id}
                  style={{ ...getNormalGridStyle(session.id), pointerEvents: 'none' }}
                  className="border border-dashed border-[#232329] rounded bg-[#08080a] min-h-0 min-w-0"
                />
              )}
              <div
                key={`frame-wrapper-${session.id}`}
                data-frame-id={session.id}
                className="overflow-hidden flex flex-col h-full"
                style={wrapperStyle}
                onTransitionEnd={(e) => {
                  if (isAnimating && e.propertyName === 'transform') {
                    if (animationFallbackTimeoutRef.current) clearTimeout(animationFallbackTimeoutRef.current);
                    if (isExpanding) {
                      setAnimatingSessionId(null);
                      setTransformStyle({});
                    } else {
                      setFocusSessionId(null);
                      setAnimatingSessionId(null);
                      setTransformStyle({});
                    }
                  }
                }}
              >
                <TerminalFrame 
                  session={session} 
                  isFocused={isFocused}
                  isAnimating={animatingSessionId !== null}
                  isHighlighted={session.agentId === highlightedAgentId}
                  onFocusToggle={(frameEl) => handleFocusToggle(session.id, frameEl)}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
