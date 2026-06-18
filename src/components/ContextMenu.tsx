import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Copy, 
  Clipboard, 
  Terminal, 
  X, 
  Maximize2, 
  Minimize2, 
  ChevronRight,
  Cpu,
  HardDrive,
  Globe,
  Bot,
  ClipboardList,
  LayoutGrid,
  Columns2,
  Rows2
} from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { useBrowserStore } from "../stores/browserStore";

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
    terminals,
    settings
  } = useOrchestratorStore();

  const isBrowserPanelVisible = useBrowserStore((s) => s.isBrowserPanelVisible);

  const shortcuts = settings?.shortcuts || {};
  const sidebarShortcut = shortcuts.toggleSidebar || 'Ctrl+B';
  const taskCenterShortcut = shortcuts.toggleTaskCenter || 'Ctrl+J';
  const browserShortcut = shortcuts.toggleBrowser || 'Ctrl+Shift+B';

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

      // Make sure menu doesn't go offscreen (width is ~220px, height is ~350px)
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

  const handleToggleBrowserPanel = () => {
    useBrowserStore.getState().toggleBrowserPanel();
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
          <div className="px-3 py-1.5 text-[10px] text-zinc-500 font-mono tracking-wider uppercase border-b border-[#232329]/40 pb-1.5 mb-1 truncate flex items-center gap-1.5">
            <Terminal size={10} className="text-zinc-500" />
            <span>Terminal: {terminalSessionId}</span>
          </div>
          
          <button
            onClick={handleCopy}
            className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md hover:bg-purple-500/10 hover:text-purple-400 text-left transition-all duration-100 cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <Copy size={13} className="text-zinc-400 group-hover:text-purple-400 transition-colors" />
              <span>Copy Selection</span>
            </div>
            <span className="text-[9px] text-zinc-500 group-hover:text-purple-400/70 font-mono">Ctrl+C</span>
          </button>

          <button
            onClick={handlePaste}
            className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md hover:bg-purple-500/10 hover:text-purple-400 text-left transition-all duration-100 cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <Clipboard size={13} className="text-zinc-400 group-hover:text-purple-400 transition-colors" />
              <span>Paste to Shell</span>
            </div>
            <span className="text-[9px] text-zinc-500 group-hover:text-purple-400/70 font-mono">Ctrl+V</span>
          </button>

          <div className="h-[1px] bg-[#232329]/60 my-1 mx-1.5" />

          <button
            onClick={handleToggleTerminalFocus}
            className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md hover:bg-purple-500/10 hover:text-purple-400 text-left transition-all duration-100 cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              {terminalIsFocused ? (
                <Minimize2 size={13} className="text-zinc-400 group-hover:text-purple-400 transition-colors" />
              ) : (
                <Maximize2 size={13} className="text-zinc-400 group-hover:text-purple-400 transition-colors" />
              )}
              <span>{terminalIsFocused ? "Exit Focus Mode" : "Focus Session"}</span>
            </div>
          </button>


          <button
            onClick={handleKillTerminal}
            className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md hover:bg-rose-500/10 hover:text-rose-400 text-left transition-all duration-100 cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <X size={13} className="text-rose-500/70 group-hover:text-rose-400 transition-colors" />
              <span>Kill Session</span>
            </div>
          </button>

          <div className="h-[1px] bg-[#232329]/60 my-1 mx-1.5" />
        </>
      )}

      {/* Global Actions */}
      <button
        onClick={handleToggleSidebar}
        className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md hover:bg-purple-500/10 hover:text-purple-400 text-left transition-all duration-100 cursor-pointer flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <Bot size={13} className="text-zinc-400 group-hover:text-purple-400 transition-colors" />
          <span>{isSidebarVisible ? "Collapse Sidebar" : "Expand Sidebar"}</span>
        </div>
        <span className="text-[9px] text-zinc-500 group-hover:text-purple-400/70 font-mono">{sidebarShortcut}</span>
      </button>

      <button
        onClick={handleToggleTaskCenter}
        className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md hover:bg-purple-500/10 hover:text-purple-400 text-left transition-all duration-100 cursor-pointer flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <ClipboardList size={13} className="text-zinc-400 group-hover:text-purple-400 transition-colors" />
          <span>{isTaskCenterVisible ? "Hide Task Center" : "Show Task Center"}</span>
        </div>
        <span className="text-[9px] text-zinc-500 group-hover:text-purple-400/70 font-mono">{taskCenterShortcut}</span>
      </button>

      <button
        onClick={handleToggleBrowserPanel}
        className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md hover:bg-purple-500/10 hover:text-purple-400 text-left transition-all duration-100 cursor-pointer flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <Globe size={13} className="text-zinc-400 group-hover:text-purple-400 transition-colors" />
          <span>{isBrowserPanelVisible ? "Hide Web Browser" : "Show Web Browser"}</span>
        </div>
        <span className="text-[9px] text-zinc-500 group-hover:text-purple-400/70 font-mono">{browserShortcut}</span>
      </button>

      {/* Change Layout with submenus */}
      <div 
        className="relative"
        onMouseEnter={() => setShowSubmenu(true)}
        onMouseLeave={() => setShowSubmenu(false)}
      >
        <button
          className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md hover:bg-purple-500/10 hover:text-purple-400 text-left transition-all duration-100 cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center gap-2">
            <LayoutGrid size={13} className="text-zinc-400 group-hover:text-purple-400 transition-colors" />
            <span>Multiplexer Layout</span>
          </div>
          <ChevronRight size={12} className="text-zinc-500 group-hover:text-purple-400 transition-colors" />
        </button>

        {showSubmenu && (
          <div 
            ref={submenuRef}
            className="absolute top-0 left-full ml-1 w-44 bg-[#0e0e11]/95 backdrop-blur-md border border-[#232329] rounded-lg shadow-2xl py-1 text-zinc-300 text-xs select-none animate-in fade-in zoom-in-95 duration-100 ease-out"
          >
            <button
              onClick={() => handleLayoutChange("grid")}
              className={`w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md text-left transition-all duration-100 cursor-pointer flex items-center gap-2 group ${
                layout.type === "grid" 
                  ? "bg-purple-500/10 text-purple-400 font-medium" 
                  : "hover:bg-purple-500/10 hover:text-purple-400"
              }`}
            >
              <LayoutGrid size={12} className={layout.type === "grid" ? "text-purple-400" : "text-zinc-400 group-hover:text-purple-400"} />
              <span>Grid Layout</span>
            </button>
            <button
              onClick={() => handleLayoutChange("vertical")}
              className={`w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md text-left transition-all duration-100 cursor-pointer flex items-center gap-2 group ${
                layout.type === "vertical" 
                  ? "bg-purple-500/10 text-purple-400 font-medium" 
                  : "hover:bg-purple-500/10 hover:text-purple-400"
              }`}
            >
              <Columns2 size={12} className={layout.type === "vertical" ? "text-purple-400" : "text-zinc-400 group-hover:text-purple-400"} />
              <span>Vertical Splits</span>
            </button>
            <button
              onClick={() => handleLayoutChange("horizontal")}
              className={`w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md text-left transition-all duration-100 cursor-pointer flex items-center gap-2 group ${
                layout.type === "horizontal" 
                  ? "bg-purple-500/10 text-purple-400 font-medium" 
                  : "hover:bg-purple-500/10 hover:text-purple-400"
              }`}
            >
              <Rows2 size={12} className={layout.type === "horizontal" ? "text-purple-400" : "text-zinc-400 group-hover:text-purple-400"} />
              <span>Horizontal Splits</span>
            </button>
          </div>
        )}
      </div>

      <div className="h-[1px] bg-[#232329]/60 my-1.5 mx-1.5" />

      {/* Simulated Stats Section (Advanced Telemetry UI visual element) */}
      <div className="bg-black/30 border border-[#232329]/30 rounded-md p-2 mx-1.5 mb-1.5 font-mono text-[9px] text-zinc-550 space-y-1.5">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Cpu size={10} className="text-purple-500/80 animate-pulse" />
              CPU LOAD
            </span>
            <span className="text-purple-400 font-semibold">{mockCpu}%</span>
          </div>
          <div className="w-full bg-[#1b1b22] h-1 rounded overflow-hidden">
            <div 
              className="bg-gradient-to-r from-purple-500 to-fuchsia-500 h-full transition-all duration-500 ease-out" 
              style={{ width: `${mockCpu}%` }}
            />
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="flex items-center gap-1.5">
              <HardDrive size={10} className="text-purple-500/80" />
              RAM USAGE
            </span>
            <span className="text-purple-400 font-semibold">{mockRam} GB</span>
          </div>
          <div className="w-full bg-[#1b1b22] h-1 rounded overflow-hidden">
            <div 
              className="bg-gradient-to-r from-purple-500 to-fuchsia-500 h-full transition-all duration-500 ease-out" 
              style={{ width: `${(mockRam / 8) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
