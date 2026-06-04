import React, { useState } from "react";
import { Terminal as TerminalIcon, X, RefreshCw, Grid, AlignJustify, Maximize2, Minimize2 } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { TerminalSession } from "../types";
import { TerminalPane } from "./terminal/TerminalPane";

// ==========================================
// Single Terminal Panel Component
// ==========================================
interface TerminalFrameProps {
  session: TerminalSession;
  isFocused: boolean;
  onFocusToggle: () => void;
}

const TerminalFrame: React.FC<TerminalFrameProps> = ({ session, isFocused, onFocusToggle }) => {
  const killTerminal = useOrchestratorStore(s => s.killTerminal);
  const restartTerminal = useOrchestratorStore(s => s.restartTerminal);
  
  const handleRestart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await restartTerminal(session.id);
  };

  return (
    <div 
      className={`flex-grow flex flex-col bg-[#0a0a0a] rounded border overflow-hidden relative group font-mono min-w-0 transition-all h-full min-h-0 ${
        isFocused 
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
            onClick={(e) => { e.stopPropagation(); onFocusToggle(); }} 
            title={isFocused ? "Exit Focus Mode" : "Focus Session"}
            className="hover:text-zinc-300 p-0.5 hover:bg-[#1a1a20] rounded"
          >
            {isFocused ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
          <button 
            onClick={handleRestart} 
            title="Restart PTY shell"
            className="hover:text-zinc-300 p-0.5 hover:bg-[#1a1a20] rounded"
          >
            <RefreshCw size={11} />
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
        <TerminalPane paneId={session.id} isFocused={isFocused} />
      </div>
    </div>
  );
};


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

  // Handle Focus Mode
  if (focusSessionId) {
    const focusSession = terminals.find(t => t.id === focusSessionId);
    if (focusSession) {
      return (
        <div className="flex-grow flex flex-col h-full space-y-1.5">
          <TerminalFrame 
            session={focusSession} 
            isFocused={true} 
            onFocusToggle={() => setFocusSessionId(null)} 
          />
        </div>
      );
    } else {
      setFocusSessionId(null);
    }
  }

  // Calculate layout classes
  let containerClass = "grid gap-1.5 flex-1 min-h-0 ";
  if (layout.type === 'grid') {
    if (terminals.length === 1) {
      containerClass += "grid-cols-1 grid-rows-1";
    } else if (terminals.length === 2) {
      containerClass += "grid-cols-2 grid-rows-1";
    } else {
      containerClass += "grid-cols-2 lg:grid-cols-3 auto-rows-fr";
    }
  } else if (layout.type === 'vertical') {
    containerClass += "grid-flow-col auto-cols-fr grid-rows-1";
  } else {
    containerClass += "grid-cols-1 auto-rows-fr";
  }

  return (
    <div className="flex-grow flex flex-col h-full space-y-1.5">
      {/* Terminal Workspace Controls */}
      <div className="flex items-center justify-between px-1 select-none">
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

      {/* Render Grid/Spits of terminals */}
      <div className={containerClass}>
        {terminals.map((session) => (
          <TerminalFrame 
            key={session.id} 
            session={session} 
            isFocused={false}
            onFocusToggle={() => setFocusSessionId(session.id)}
          />
        ))}
      </div>
    </div>
  );
};
