import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Copy, 
  Clipboard, 
  Sidebar, 
  Layout, 
  Terminal, 
  X, 
  Maximize2, 
  Minimize2, 
  Grid, 
  AlignJustify,
  ChevronRight,
  Cpu,
  HardDrive
} from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";

export const ContextMenu: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [terminalIsFocused, setTerminalIsFocused] = useState(false);
  const [showSubmenu, setShowSubmenu] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  const {
    isSidebarVisible,
    isTaskCenterVisible,
    setSidebarVisible,
    setTaskCenterVisible,
    killTerminal,
    layout,
    changeLayoutType,
    terminals
  } = useOrchestratorStore();

  // Performance simulated states from global stats
  const [mockCpu, setMockCpu] = useState(2);
  const [mockRam, setMockRam] = useState(1.15);

  useEffect(() => {
    const activePTYsCount = terminals.filter(t => t.status === 'connected').length;
    const interval = setInterval(() => {
      const baseCpu = 1 + activePTYsCount * 4;
      const fluctuatingCpu = Math.max(1, baseCpu + Math.floor(Math.random() * 5) - 2);
      const baseRam = 1.1 + activePTYsCount * 0.22;
      const fluctuatingRam = Number((baseRam + Math.random() * 0.05 - 0.02).toFixed(2));
      setMockCpu(fluctuatingCpu);
      setMockRam(fluctuatingRam);
    }, 2000);
    return () => clearInterval(interval);
  }, [terminals]);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Don't intercept right clicks on editable elements, inputs, textareas or inside monaco editor
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('.monaco-editor')
      ) {
        // Allow default context menu for input fields
        return;
      }

      e.preventDefault();

      // Find if clicked inside a terminal frame
      const terminalFrame = target.closest(".terminal-frame") as HTMLElement | null;
      if (terminalFrame) {
        const sessionId = terminalFrame.getAttribute("data-session-id");
        const isFocused = terminalFrame.getAttribute("data-focused") === "true";
        setTerminalSessionId(sessionId);
        setTerminalIsFocused(isFocused);
      } else {
        setTerminalSessionId(null);
        setTerminalIsFocused(false);
      }

      // Calculate context menu position
      let x = e.clientX;
      let y = e.clientY;

      // Make sure menu doesn't go offscreen (width is ~200px, height is ~350px)
      const menuWidth = 220;
      const menuHeight = terminalFrame ? 390 : 250;

      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 8;
      }

      setPosition({ x, y });
      setVisible(true);
      setShowSubmenu(false);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setVisible(false);
      }
    };

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!visible) return null;

  const handleCopy = () => {
    document.execCommand("copy");
    setVisible(false);
  };

  const handlePaste = () => {
    navigator.clipboard.readText()
      .then((text) => {
        if (text && terminalSessionId) {
          invoke("write_pty", { sessionId: terminalSessionId, data: text });
        }
      })
      .catch((err) => console.error("Failed to read clipboard:", err));
    setVisible(false);
  };

  const handleToggleTerminalFocus = () => {
    if (terminalSessionId) {
      window.dispatchEvent(
        new CustomEvent("toggle-terminal-focus", {
          detail: { sessionId: terminalSessionId }
        })
      );
    }
    setVisible(false);
  };


  const handleKillTerminal = () => {
    if (terminalSessionId) {
      killTerminal(terminalSessionId);
    }
    setVisible(false);
  };

  const handleToggleSidebar = () => {
    setSidebarVisible(!isSidebarVisible);
    setVisible(false);
  };

  const handleToggleTaskCenter = () => {
    setTaskCenterVisible(!isTaskCenterVisible);
    setVisible(false);
  };

  const handleLayoutChange = (type: "grid" | "vertical" | "horizontal") => {
    changeLayoutType(type);
    setVisible(false);
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-56 bg-[#0e0e11]/95 backdrop-blur-md border border-[#232329] rounded-lg shadow-2xl py-1.5 text-zinc-300 text-xs font-sans select-none animate-in fade-in zoom-in-95 duration-100 ease-out"
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
    >
      {terminalSessionId && (
        <>
          <div className="px-3 py-1 text-[10px] text-zinc-500 font-mono tracking-wider uppercase border-b border-[#232329]/40 pb-1 mb-1 truncate flex items-center gap-1.5">
            <Terminal size={10} className="text-zinc-500" />
            <span>Terminal: {terminalSessionId}</span>
          </div>
          
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-purple-500/10 hover:text-purple-400 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Copy size={13} className="text-zinc-400" />
              <span>Copy Selection</span>
            </div>
            <span className="text-[9px] text-zinc-500 font-mono">Ctrl+C</span>
          </button>

          <button
            onClick={handlePaste}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-purple-500/10 hover:text-purple-400 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Clipboard size={13} className="text-zinc-400" />
              <span>Paste to Shell</span>
            </div>
            <span className="text-[9px] text-zinc-500 font-mono">Ctrl+V</span>
          </button>

          <div className="h-[1px] bg-[#232329]/60 my-1.5" />

          <button
            onClick={handleToggleTerminalFocus}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-purple-500/10 hover:text-purple-400 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {terminalIsFocused ? (
                <Minimize2 size={13} className="text-zinc-400" />
              ) : (
                <Maximize2 size={13} className="text-zinc-400" />
              )}
              <span>{terminalIsFocused ? "Exit Focus Mode" : "Focus Session"}</span>
            </div>
          </button>


          <button
            onClick={handleKillTerminal}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-rose-500/10 hover:text-rose-400 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <X size={13} className="text-rose-500/70" />
              <span>Kill Session</span>
            </div>
          </button>

          <div className="h-[1px] bg-[#232329]/60 my-1.5" />
        </>
      )}

      {/* Global Actions */}
      <div className="h-[1px] bg-[#232329]/60 my-1.5" />

      <button
        onClick={handleToggleSidebar}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-purple-500/10 hover:text-purple-400 text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Sidebar size={13} className="text-zinc-400" />
          <span>{isSidebarVisible ? "Collapse Sidebar" : "Expand Sidebar"}</span>
        </div>
      </button>

      <button
        onClick={handleToggleTaskCenter}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-purple-500/10 hover:text-purple-400 text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Layout size={13} className="text-zinc-400" />
          <span>{isTaskCenterVisible ? "Hide Task Center" : "Show Task Center"}</span>
        </div>
      </button>

      {/* Change Layout with submenus */}
      <div 
        className="relative"
        onMouseEnter={() => setShowSubmenu(true)}
        onMouseLeave={() => setShowSubmenu(false)}
      >
        <button
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-purple-500/10 hover:text-purple-400 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Grid size={13} className="text-zinc-400" />
            <span>Multiplexer Layout</span>
          </div>
          <ChevronRight size={12} className="text-zinc-500" />
        </button>

        {showSubmenu && (
          <div 
            ref={submenuRef}
            className="absolute top-0 left-full ml-0.5 w-44 bg-[#0e0e11]/95 backdrop-blur-md border border-[#232329] rounded-lg shadow-2xl py-1 text-zinc-300 text-xs select-none"
          >
            <button
              onClick={() => handleLayoutChange("grid")}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${
                layout.type === "grid" 
                  ? "bg-purple-500/10 text-purple-400 font-medium" 
                  : "hover:bg-purple-500/10 hover:text-purple-400"
              }`}
            >
              <Grid size={12} />
              <span>Grid Layout</span>
            </button>
            <button
              onClick={() => handleLayoutChange("vertical")}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${
                layout.type === "vertical" 
                  ? "bg-purple-500/10 text-purple-400 font-medium" 
                  : "hover:bg-purple-500/10 hover:text-purple-400"
              }`}
            >
              <AlignJustify size={12} className="rotate-90" />
              <span>Vertical Splits</span>
            </button>
            <button
              onClick={() => handleLayoutChange("horizontal")}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${
                layout.type === "horizontal" 
                  ? "bg-purple-500/10 text-purple-400 font-medium" 
                  : "hover:bg-purple-500/10 hover:text-purple-400"
              }`}
            >
              <AlignJustify size={12} />
              <span>Horizontal Splits</span>
            </button>
          </div>
        )}
      </div>

      <div className="h-[1px] bg-[#232329]/60 my-1.5" />

      {/* Simulated Stats Section (Advanced Telemetry UI visual element) */}
      <div className="px-3 py-1.5 font-mono text-[9px] text-zinc-500 space-y-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Cpu size={10} className="text-purple-500/70" />
            CPU LOAD
          </span>
          <span className="text-zinc-400">{mockCpu}%</span>
        </div>
        <div className="w-full bg-[#1b1b22] h-1 rounded overflow-hidden">
          <div 
            className="bg-purple-500 h-full transition-all duration-500" 
            style={{ width: `${mockCpu}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between pt-1">
          <span className="flex items-center gap-1">
            <HardDrive size={10} className="text-purple-500/70" />
            RAM USAGE
          </span>
          <span className="text-zinc-400">{mockRam} GB</span>
        </div>
        <div className="w-full bg-[#1b1b22] h-1 rounded overflow-hidden">
          <div 
            className="bg-purple-500 h-full transition-all duration-500" 
            style={{ width: `${(mockRam / 8) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};
