import { useEffect, useState, useRef } from "react";
import { FolderOpen, BarChart2, Cpu, HardDrive, Layers, Trash2, Plus, Save, Pin, PinOff, LayoutGrid, FileText, ChevronDown, Keyboard, SidebarClose, Edit2 } from "lucide-react";
import { ActivityBar } from "./components/ActivityBar";
import { AgentGrid } from "./components/AgentGrid";
import { TerminalWorkspace } from "./components/TerminalWorkspace";
import { ActivityFeed } from "./components/ActivityFeed";
import { TaskCenter } from "./components/TaskCenter";
import { ProjectMemory } from "./components/ProjectMemory";
import { SwarmView } from "./components/SwarmView/SwarmView";
import { AgentReviewCenter } from "./components/ExecutionReview/AgentReviewCenter";
import { useOrchestratorStore } from "./stores/orchestratorStore";
import { useSwarmStore } from "./stores/swarmStore";
import { useBrowserStore } from "./stores/browserStore";
import { useChangesetStore } from "./stores/changesetStore";
import { BrowserPanel } from "./components/browser/BrowserPanel";
import { AnalyticsService } from "./services/analytics";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "./components/ContextMenu";
import { CustomDialog } from "./components/CustomDialog";
import { SettingsModal } from "./components/SettingsModal";
import { EventBus } from "./core/events";
import { DEFAULT_APP_SETTINGS } from "./types";
import { useShallow } from 'zustand/react/shallow';

function App() {
  const initStore = useOrchestratorStore(s => s.initStore);
  const showConfirmDialog = useOrchestratorStore(s => s.showConfirmDialog);
  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const workspaces = useOrchestratorStore(useShallow(s => s.workspaces));
  const createWorkspace = useOrchestratorStore(s => s.createWorkspace);
  const terminals = useOrchestratorStore(useShallow(s => s.terminals));
  const projects = useOrchestratorStore(useShallow(s => s.projects));

  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isMemorySaving, setIsMemorySaving] = useState(false);
  const [memorySaveStatus, setMemorySaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [memorySaveError, setMemorySaveError] = useState("");

  // Keep selectedProjectId in sync when activeWorkspaceId changes
  useEffect(() => {
    if (activeProjects.length > 0) {
      const exists = activeProjects.some(p => p.id === selectedProjectId);
      if (!exists) {
        setSelectedProjectId(activeProjects[0].id);
      }
    } else {
      setSelectedProjectId("");
    }
  }, [activeWorkspaceId, projects]);

  const isSidebarVisible = useOrchestratorStore(s => s.isSidebarVisible);
  const isTaskCenterVisible = useOrchestratorStore(s => s.isTaskCenterVisible);
  const isAgentPanelPinned = useOrchestratorStore(s => s.isAgentPanelPinned);
  const isTaskPanelPinned = useOrchestratorStore(s => s.isTaskPanelPinned);
  const sidebarWidth = useOrchestratorStore(s => s.sidebarWidth);
  const topPanelHeight = useOrchestratorStore(s => s.topPanelHeight);

  const setSidebarVisible = useOrchestratorStore(s => s.setSidebarVisible);
  const setTaskCenterVisible = useOrchestratorStore(s => s.setTaskCenterVisible);
  const setAgentPanelPinned = useOrchestratorStore(s => s.setAgentPanelPinned);
  const setTaskPanelPinned = useOrchestratorStore(s => s.setTaskPanelPinned);
  const setSidebarWidth = useOrchestratorStore(s => s.setSidebarWidth);
  const setTopPanelHeight = useOrchestratorStore(s => s.setTopPanelHeight);

  const { 
    isReviewCenterOpen, 
    setReviewCenterOpen, 
    isReviewPanelPinned, 
    reviewPanelWidth, 
    setReviewPanelWidth,
    toggleReviewPanelPinned
  } = useChangesetStore();

  // Enforce Max 8 Terminals Docking Rule
  useEffect(() => {
    if (terminals.length > 8) {
      if (isAgentPanelPinned) setAgentPanelPinned(false);
      if (isTaskPanelPinned) setTaskPanelPinned(false);
      if (isReviewPanelPinned) toggleReviewPanelPinned();
    }
  }, [terminals.length, isAgentPanelPinned, isTaskPanelPinned, setAgentPanelPinned, setTaskPanelPinned, isReviewPanelPinned, toggleReviewPanelPinned]);

  const [initName, setInitName] = useState("");
  const [showRenameWsModal, setShowRenameWsModal] = useState(false);
  const [renameWsId, setRenameWsId] = useState<string | null>(null);
  const [renameWsName, setRenameWsName] = useState("");

  const handleRenameWs = async () => {
    if (!renameWsName.trim() || !renameWsId) return;
    try {
      await useOrchestratorStore.getState().renameWorkspace(renameWsId, renameWsName);
      setRenameWsId(null);
      setRenameWsName("");
      setShowRenameWsModal(false);
    } catch (e) {
      console.error(e);
    }
  };
  const [isActivityFeedExpanded, setIsActivityFeedExpanded] = useState(false);
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  const [isHeightDragging, setIsHeightDragging] = useState(false);
  const [isSwarmDragging, setIsSwarmDragging] = useState(false);
  const [isBrowserDragging, setIsBrowserDragging] = useState(false);
  const [isReviewDragging, setIsReviewDragging] = useState(false);

  const { isSwarmPanelVisible, swarmPanelHeight, setSwarmPanelHeight } = useSwarmStore();
  const { isBrowserPanelVisible, isBrowserPanelPinned, browserPanelWidth, setBrowserPanelWidth, toggleBrowserPanel, toggleBrowserPanelPinned } = useBrowserStore();

  // Power User Top Right Panel (Tasks/Memory) state
  const [activeRightTab, setActiveRightTab] = useState<"tasks" | "memory">("tasks");

  // Performance Meter State
  const [cpuLoad, setCpuLoad] = useState(0);
  const [ramLoad, setRamLoad] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    const fetchMetrics = async () => {
      try {
        const metrics: { cpu: number; ram_gb: number } = await invoke("get_system_metrics");
        if (isMounted) {
          setCpuLoad(Number(metrics.cpu.toFixed(1)));
          setRamLoad(Number(metrics.ram_gb.toFixed(2)));
        }
      } catch (e) {
        console.error("Failed to fetch system metrics", e);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSidebarDragging(true);
  };

  const resizeRef = useRef({ startY: 0, startHeight: 0, lastHeight: 0, lastWidth: 0 });
  const reviewResizeRef = useRef({ lastWidth: 0 });
  const appRef = useRef<HTMLDivElement>(null);

  const startHeightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startHeight: topPanelHeight, lastHeight: 0, lastWidth: 0 };
    setIsHeightDragging(true);
  };

  useEffect(() => {
    if (!isSidebarDragging) return;

    let frameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const maxWidth = window.innerWidth - 300; // Leave at least 300px for main content
        const newWidth = Math.max(420, Math.min(e.clientX - 56, maxWidth));
        if (appRef.current) appRef.current.style.setProperty('--sidebar-width', `${newWidth}px`);
        resizeRef.current.lastWidth = newWidth;
      });
    };

    const handleMouseUp = () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeRef.current.lastWidth) setSidebarWidth(resizeRef.current.lastWidth);
      setIsSidebarDragging(false);
      useOrchestratorStore.getState().saveSnapshot();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSidebarDragging, setSidebarWidth]);

  useEffect(() => {
    if (!isHeightDragging) return;

    let frameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const delta = e.clientY - resizeRef.current.startY;
        const maxHeight = window.innerHeight - 150; // Leave at least 150px for the terminal pane
        const newHeight = Math.max(150, Math.min(resizeRef.current.startHeight + delta, maxHeight));
        if (appRef.current) appRef.current.style.setProperty('--top-panel-height', `${newHeight}px`);
        resizeRef.current.lastHeight = newHeight;
      });
    };

    const handleMouseUp = () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeRef.current.lastHeight) setTopPanelHeight(resizeRef.current.lastHeight);
      setIsHeightDragging(false);
      useOrchestratorStore.getState().saveSnapshot();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isHeightDragging, setTopPanelHeight]);

  // Constrain panels to window size on mount and on window resize
  // This repairs any persisted state that might be out of bounds.
  useEffect(() => {
    const handleWindowResize = () => {
      const maxHeight = window.innerHeight - 150;
      const maxWidth = window.innerWidth - 300;
      
      if (topPanelHeight > maxHeight) {
        setTopPanelHeight(maxHeight);
      }
      if (sidebarWidth > maxWidth) {
        setSidebarWidth(maxWidth);
      }
    };

    handleWindowResize(); // Run once on mount
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [topPanelHeight, sidebarWidth, setTopPanelHeight, setSidebarWidth]);

  useEffect(() => {
    if (!isSwarmDragging) return;

    let frameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        setSwarmPanelHeight(Math.max(200, Math.min(e.clientY - 80, 700)));
      });
    };
    
    const handleMouseUp = () => {
      if (frameId) cancelAnimationFrame(frameId);
      setIsSwarmDragging(false);
      useOrchestratorStore.getState().saveSnapshot();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSwarmDragging, setSwarmPanelHeight]);

  const startBrowserResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsBrowserDragging(true);
  };

  useEffect(() => {
    if (!isBrowserDragging) return;

    let frameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const leftBoundary = 56 + (isSidebarVisible ? sidebarWidth : 0) + 300;
        const rightBoundary = window.innerWidth - (isReviewCenterOpen && isReviewPanelPinned ? reviewPanelWidth : 0) - 300;
        const currentX = Math.max(leftBoundary, Math.min(e.clientX, rightBoundary));
        const newWidth = window.innerWidth - currentX - 8;

        if (appRef.current) {
          appRef.current.style.setProperty('--browser-panel-width', `${newWidth}px`);
        }
        resizeRef.current.lastWidth = newWidth;
      });
    };

    const handleMouseUp = () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeRef.current.lastWidth) setBrowserPanelWidth(resizeRef.current.lastWidth);
      setIsBrowserDragging(false);
      useOrchestratorStore.getState().saveSnapshot();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isBrowserDragging, isSidebarVisible, sidebarWidth, setBrowserPanelWidth, isReviewCenterOpen, isReviewPanelPinned, reviewPanelWidth]);

  const startReviewResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsReviewDragging(true);
  };

  useEffect(() => {
    if (!isReviewDragging) return;

    let frameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        // Left boundary respects the Activity Bar, dynamic sidebar, and browser width (if pinned)
        const leftBoundary = 
          56 + 
          (isSidebarVisible ? sidebarWidth : 0) + 
          (isBrowserPanelVisible && isBrowserPanelPinned ? browserPanelWidth : 0) + 
          300;
        
        const rightBoundary = window.innerWidth - 300;
        const currentX = Math.max(leftBoundary, Math.min(e.clientX, rightBoundary));
        const newWidth = window.innerWidth - currentX - 8;

        if (appRef.current) {
          appRef.current.style.setProperty('--review-panel-width', `${newWidth}px`);
        }
        reviewResizeRef.current.lastWidth = newWidth;
      });
    };

    const handleMouseUp = () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (reviewResizeRef.current.lastWidth) setReviewPanelWidth(reviewResizeRef.current.lastWidth);
      setIsReviewDragging(false);
      useOrchestratorStore.getState().saveSnapshot();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isReviewDragging, isSidebarVisible, sidebarWidth, isBrowserPanelVisible, isBrowserPanelPinned, browserPanelWidth, setReviewPanelWidth]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      const state = useOrchestratorStore.getState();
      const shortcuts = { ...DEFAULT_APP_SETTINGS.shortcuts, ...(state.settings?.shortcuts || {}) };
      
      const checkShortcut = (shortcutString: string | undefined) => {
        if (!shortcutString) return false;
        const parts = shortcutString.toLowerCase().split('+').map(s => s.trim());
        const key = parts[parts.length - 1];
        const needsCtrl = parts.includes('ctrl') || parts.includes('cmd');
        const needsShift = parts.includes('shift');
        const needsAlt = parts.includes('alt');
        
        // Safety: If input/terminal is focused and the shortcut doesn't require any modifiers, don't trigger it to avoid stealing typing.
        if (isInputFocused && !needsCtrl && !needsAlt) {
          return false;
        }
        
        const hasCtrl = e.ctrlKey || e.metaKey;
        if (needsCtrl !== hasCtrl) return false;
        if (needsShift !== e.shiftKey) return false;
        if (needsAlt !== e.altKey) return false;
        
        if (key === ',') return e.key === ',';
        return e.key.toLowerCase() === key;
      };

      if (checkShortcut(shortcuts.toggleSidebar)) {
        e.preventDefault();
        state.setSidebarVisible(!state.isSidebarVisible);
      } else if (checkShortcut(shortcuts.toggleTaskCenter)) {
        e.preventDefault();
        state.setTaskCenterVisible(!state.isTaskCenterVisible);
      } else if (checkShortcut(shortcuts.openSettings)) {
        e.preventDefault();
        state.setSettingsModalOpen(!state.isSettingsModalOpen);
      } else if (checkShortcut(shortcuts.toggleAddAgent)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('toggle-add-agent'));
      } else if (checkShortcut(shortcuts.toggleBrowser || 'Ctrl+Shift+B')) {
        e.preventDefault();
        useBrowserStore.getState().toggleBrowserPanel();
      } else if (checkShortcut(shortcuts.toggleReviewCenter || 'Ctrl+Shift+R')) {
        e.preventDefault();
        const isOpen = useChangesetStore.getState().isReviewCenterOpen;
        useChangesetStore.getState().setReviewCenterOpen(!isOpen);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    // 1. Initialize local telemetry analytics listeners
    AnalyticsService.init();

    // 2. Load configurations database & active workspace snap
    initStore();
  }, [initStore]);

  const handleInitWorkspace = async () => {
    if (!initName.trim()) return;
    try {
      // Trigger folder picker via Tauri Rust bridge
      const rootPath = await invoke<string | null>("select_folder");
      if (rootPath) {
        await createWorkspace(initName, rootPath);
      }
    } catch (e) {
      console.error("Failed to select folder path:", e);
    }
  };

  // If no workspace is active/defined, prompt to create a Workspace Session
  if (!activeWorkspaceId) {
    return (
      <div className="h-screen w-screen text-zinc-100 flex flex-col justify-center items-center font-sans p-6 select-none relative workspace-setup-bg overflow-hidden">
        {/* Glow ambient background circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[55%] h-[55%] rounded-full bg-amber-500/5 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }}></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[55%] h-[55%] rounded-full bg-purple-500/5 blur-[120px] animate-pulse" style={{ animationDuration: '12s' }}></div>
        </div>

        <div className="w-full max-w-md workspace-setup-card p-8 space-y-6 text-center z-10 relative">
          {/* Logo brand */}
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center group mb-2">
            {/* Outer glowing gradient aura */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 opacity-25 blur-md group-hover:opacity-45 transition-opacity duration-500 animate-pulse"></div>
            {/* Logo box */}
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1c1c24] to-[#0c0c12] border border-white/15 flex items-center justify-center shadow-2xl group-hover:border-amber-500/40 transition-all duration-300">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 font-black text-xl tracking-wider select-none font-mono">
                NX
              </span>
            </div>
          </div>
          
          <div className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight text-white bg-clip-text bg-gradient-to-b from-white via-zinc-100 to-zinc-400 select-none">
              Nexora
            </h1>
            <div className="flex justify-center">
              <span className="px-3 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.05)] select-none">
                AI Orchestrator
              </span>
            </div>
            <p className="text-zinc-400 text-xs max-w-sm mx-auto leading-relaxed pt-2 select-none px-4">
              A command-center dashboard designed to coordinate and monitor <span className="text-zinc-200 font-medium">autonomous CLI coding agents</span> across multiple project folders.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {workspaces.length > 0 ? (
              <div className="space-y-3">
                <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider text-left pl-1">
                  Resume Workspace Session
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                  {workspaces.map(ws => (
                    <div key={ws.id} className="group/item flex items-center gap-2 w-full p-1 rounded-xl bg-white/[0.01] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-200">
                      <button
                        onClick={() => useOrchestratorStore.getState().selectWorkspace(ws.id)}
                        className="flex-1 flex items-center gap-3 px-3 py-2 text-left rounded-lg text-zinc-300 transition-colors min-w-0 bg-transparent border-0 outline-none cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0 group-hover/item:bg-amber-500/20 group-hover/item:border-amber-500/30 transition-all">
                          <FolderOpen size={14} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-zinc-200 truncate group-hover/item:text-white transition-colors">{ws.name}</span>
                          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[220px]" title={ws.rootPath}>{ws.rootPath}</span>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          showConfirmDialog(
                            "Delete Workspace",
                            `Are you sure you want to delete workspace "${ws.name}"?`,
                            () => {
                              useOrchestratorStore.getState().deleteWorkspace(ws.id);
                            }
                          );
                        }}
                        title="Delete Workspace Session"
                        className="mr-2 p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-white/[0.06]"></div>
                  <span className="flex-shrink mx-4 text-zinc-500 text-[9px] font-mono uppercase tracking-wider font-semibold">OR</span>
                  <div className="flex-grow border-t border-white/[0.06]"></div>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono tracking-wider text-left pl-1">
                Create New Session
              </div>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={initName}
                    onChange={(e) => setInitName(e.target.value)}
                    placeholder="Workspace Name (e.g. CLI Coding Team)"
                    className="w-full bg-black/40 border border-white/[0.08] focus:border-amber-500/60 rounded-xl px-4 py-3 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:outline-none transition-all duration-300 focus:shadow-[0_0_15px_rgba(245,158,11,0.08)]"
                  />
                </div>
                {!initName.trim() && (
                  <p className="text-[10px] text-zinc-500 text-left px-1 mt-0.5 italic flex items-center gap-1.5">
                    <span className="inline-block w-1 h-1 rounded-full bg-amber-500/50"></span>
                    Enter a workspace name to select a directory
                  </p>
                )}
                <button
                  onClick={handleInitWorkspace}
                  disabled={!initName.trim()}
                  className={`w-full flex items-center justify-center gap-2 font-bold text-xs py-3 px-4 rounded-xl transition-all duration-300 ${
                    initName.trim()
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 cursor-pointer active:scale-[0.98]"
                      : "bg-white/[0.04] border border-white/[0.06] text-zinc-500 cursor-not-allowed"
                  }`}
                >
                  <FolderOpen size={14} />
                  Choose Workspace Directory
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeWs = workspaces.find(w => w.id === activeWorkspaceId);

  return (
    <div 
      ref={appRef}
      style={{ 
        '--sidebar-width': `${sidebarWidth}px`, 
        '--top-panel-height': `${topPanelHeight}px`,
        '--browser-panel-width': `${browserPanelWidth}px`,
        '--review-panel-width': `${reviewPanelWidth}px`
      } as React.CSSProperties}
      className={`h-screen w-screen text-zinc-200 overflow-hidden flex flex-row font-sans relative bg-black ${(isSidebarDragging || isHeightDragging || isSwarmDragging || isBrowserDragging || isReviewDragging) ? "is-dragging" : ""}`}
    >
      <ActivityBar />

      {/* Main content column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* 2. Main Dashboard Layout splits */}
        <div className="flex-1 flex overflow-hidden pt-2.5 px-2 pb-2 gap-0 relative">
        {/* Left Side Dock columns (resizable) - Agents & Telemetry Feed */}
        {isSidebarVisible && !isAgentPanelPinned && (
          <div 
            className="fixed inset-0 z-20"
            style={{ left: '56px' }} 
            onClick={() => setSidebarVisible(false)}
          />
        )}
        <div 
          className={`flex flex-col gap-1 overflow-hidden ${
            isAgentPanelPinned ? 'flex-shrink-0 relative mr-1' : 'absolute left-2 top-2.5 bottom-2 z-30 shadow-2xl bg-black backdrop-blur-xl border border-border-glass rounded-lg'
          } ${
            isSidebarDragging ? '' : 'transition-[width,opacity,margin,transform] duration-300 ease-out'
          } ${
            isSidebarVisible 
              ? `opacity-100 ${isAgentPanelPinned ? '' : 'translate-x-0'}` 
              : `opacity-0 pointer-events-none ${isAgentPanelPinned ? '' : '-translate-x-4'}`
          }`}
          style={{ width: isSidebarVisible ? 'var(--sidebar-width)' : '0px' }}
        >
          {/* Inner container to prevent text reflow while width animates */}
          <div className="flex-1 flex flex-col h-full gap-1" style={{ width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)' }}>
            {/* Active Agent Profiles list */}
            <div className="flex-grow flex flex-col glass-panel px-1.5 pt-1.5 pb-0 min-h-[300px] overflow-hidden relative">
              <AgentGrid />
            </div>

            {/* Chronological logs feed */}
            <div className={`${isActivityFeedExpanded ? 'h-72' : 'h-7'} flex-shrink-0 transition-[height] duration-300 ease-out`}>
              <ActivityFeed isExpanded={isActivityFeedExpanded} onToggle={() => setIsActivityFeedExpanded(!isActivityFeedExpanded)} />
            </div>
          </div>
        </div>

        {isSidebarVisible && isAgentPanelPinned && (
          <div
            onMouseDown={startSidebarResize}
            onDoubleClick={() => setSidebarVisible(false)}
            className="w-2 bg-transparent cursor-col-resize flex-shrink-0 h-full flex items-center justify-center group relative select-none mr-1"
            title="Drag to resize sidebar, Double-click to collapse"
          >
            {/* Vertical line divider */}
            <div className="w-[1px] h-full bg-border-glass group-hover:bg-accent-primary/50 group-active:bg-accent-primary transition-colors duration-150" />
            
            {/* Drag handle button */}
            <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-accent-primary/50 group-active:border-accent-primary/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
            </div>
          </div>
        )}
        
        {/* Floating Resizer for unpinned Agent Panel */}
        {isSidebarVisible && !isAgentPanelPinned && (
          <div
            onMouseDown={startSidebarResize}
            className="absolute top-2.5 bottom-2 w-2 bg-transparent cursor-col-resize flex items-center justify-center group select-none z-40"
            style={{ left: 'calc(var(--sidebar-width) + 8px)' }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-accent-primary/50 group-active:border-accent-primary/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
            </div>
          </div>
        )}

        {/* Right Side Dock viewport (split into top controls panel & bottom PTY workspace) */}
        <div className="flex-1 min-w-0 flex flex-col gap-0 overflow-hidden relative">
          
          {/* Top Panel Overlay Backdrop */}
          {activeWs && isTaskCenterVisible && !isTaskPanelPinned && (
            <div 
              className="absolute inset-0 z-10" 
              onClick={() => setTaskCenterVisible(false)} 
            />
          )}

          {/* Top Panel (Task Board & Project Memory tabs) */}
          {activeWs && (
            <div 
              className={`flex flex-col glass-panel shadow-2xl bg-black backdrop-blur-xl overflow-hidden ${
                isTaskPanelPinned ? 'relative z-10 flex-shrink-0' : '!absolute top-0 left-0 right-0 z-20'
              } ${isHeightDragging ? '' : 'transition-all duration-300 ease-out'} p-2 border-b border-border-glass`}
              style={
                isTaskPanelPinned 
                  ? { 
                      height: isTaskCenterVisible ? 'var(--top-panel-height)' : '0px', 
                      opacity: isTaskCenterVisible ? 1 : 0,
                      padding: isTaskCenterVisible ? undefined : '0px',
                      borderWidth: isTaskCenterVisible ? undefined : '0px'
                    }
                  : { 
                      height: 'var(--top-panel-height)',
                      left: (isSidebarVisible && !isAgentPanelPinned) ? 'calc(var(--sidebar-width) + 8px)' : '0px',
                      transform: isTaskCenterVisible ? 'translateY(0)' : 'translateY(calc(-1 * var(--top-panel-height)))',
                      opacity: isTaskCenterVisible ? 1 : 0,
                      pointerEvents: isTaskCenterVisible ? 'auto' : 'none'
                    }
              }
            >
              {/* Header Tabs */}
              <header className="h-[46px] bg-black border-b border-[#1e1e28] px-4 flex items-center justify-between select-none flex-shrink-0">
                {/* Left Section: Navigation Tabs & Project Selector */}
                <div className="flex items-center gap-2">
                  {/* Task Center Tab */}
                  <button
                    onClick={() => setActiveRightTab('tasks')}
                    className={`flex items-center gap-1.5 h-[30px] px-2.5 rounded text-[10px] font-bold tracking-wider uppercase border transition-all ${
                      activeRightTab === 'tasks'
                        ? 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/5'
                        : 'border-[#2a2a38] text-[#555568] hover:text-[#e2e2ea] hover:border-[#444458]'
                    }`}
                  >
                    <LayoutGrid size={12} />
                    <span>Task Center</span>
                  </button>

                  {/* Project Memory Tab */}
                  <button
                    onClick={() => setActiveRightTab('memory')}
                    className={`flex items-center gap-1.5 h-[30px] px-2.5 rounded text-[10px] font-bold tracking-wider uppercase border transition-all ${
                      activeRightTab === 'memory'
                        ? 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/5'
                        : 'border-transparent text-[#555568] hover:text-[#e2e2ea]'
                    }`}
                  >
                    <FileText size={12} />
                    <span>Project Memory</span>
                  </button>

                  <div className="w-px h-3.5 bg-[#1e1e28] mx-1"></div>

                  {/* Project Dropdown Selector */}
                  <div className="relative">
                    {activeProjects.length > 0 && (
                      <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="appearance-none flex items-center gap-1.5 h-[30px] px-2.5 pr-7 rounded bg-[#111116] border border-[#2a2a38] text-[11px] font-medium text-[#e2e2ea] hover:border-[#444458] transition-colors outline-none cursor-pointer"
                      >
                        {activeProjects.map(p => (
                          <option key={p.id} value={p.id} className="bg-[#0f0f15]">{p.name}</option>
                        ))}
                      </select>
                    )}
                    {/* Custom Chevron since appearance is none */}
                    {activeProjects.length > 0 && (
                      <ChevronDown size={10} className="text-[#555568] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                  </div>
                </div>

                {/* Right Section: Action Buttons */}
                <div className="flex items-center gap-2">
                  {/* Create Task Button */}
                  {activeRightTab === "tasks" && selectedProjectId && (
                    <button
                      onClick={() => setShowAddForm(!showAddForm)}
                      className="flex items-center gap-1.5 h-[30px] px-3.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-black text-[10px] font-bold tracking-wide transition-colors shadow-lg shadow-[#f59e0b]/5"
                    >
                      <Plus size={12} strokeWidth={2.5} />
                      <span>{showAddForm ? "Hide Form" : "Create Task"}</span>
                    </button>
                  )}

                  {/* Save Memory Button */}
                  {activeRightTab === "memory" && selectedProjectId && (
                    <div className="flex items-center gap-1.5">
                      {memorySaveStatus === "success" && (
                        <span className="text-[9px] text-emerald-455 font-bold bg-emerald-500/10 px-1.5 py-1 rounded border border-emerald-500/20">Saved</span>
                      )}
                      {memorySaveStatus === "error" && (
                        <span className="text-[9px] text-rose-455 font-bold bg-rose-500/10 px-1.5 py-1 rounded border border-rose-500/20" title={memorySaveError}>Error</span>
                      )}
                      <button
                        onClick={() => EventBus.publish("project-memory:save", undefined)}
                        disabled={isMemorySaving}
                        className="flex items-center gap-1 h-[30px] px-3 rounded-lg bg-[#111116] border border-[#2a2a38] text-[#e2e2ea] hover:bg-[#1a1a22] hover:border-[#444458] text-[10px] font-bold tracking-wide transition-colors disabled:opacity-50"
                      >
                        <Save size={12} />
                        <span>{isMemorySaving ? "Saving..." : "Save Memory"}</span>
                      </button>
                    </div>
                  )}

                  <div className="w-px h-3.5 bg-[#1e1e28] mx-0.5"></div>

                  {/* Pin Panel Toggle */}
                  <button
                    onClick={() => {
                      if (terminals.length <= 8) setTaskPanelPinned(!isTaskPanelPinned);
                    }}
                    className={`flex items-center justify-center w-[30px] h-[30px] rounded-lg border transition-colors ${terminals.length > 8 ? 'opacity-50 cursor-not-allowed border-[#2a2a38] text-[#555568]' : isTaskPanelPinned ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]' : 'bg-[#111116] border-[#2a2a38] text-[#888899] hover:text-[#e2e2ea] hover:border-[#444458]'}`}
                    title={terminals.length > 8 ? "Docking disabled (> 8 terminals)" : isTaskPanelPinned ? "Unpin Panel (Float)" : "Pin Panel (Dock)"}
                  >
                    {isTaskPanelPinned ? <Pin size={12} /> : <PinOff size={12} />}
                  </button>

                  {/* Hide Panel Toggle */}
                  <button
                    onClick={() => setTaskCenterVisible(false)}
                    className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg bg-[#111116] border border-[#2a2a38] text-[#888899] hover:text-[#e2e2ea] hover:border-[#444458] text-[10px] font-bold tracking-wider uppercase transition-colors"
                  >
                    <SidebarClose size={12} className="rotate-180" />
                    <span>Hide</span>
                  </button>
                </div>
              </header>

              {/* Tab Contents */}
              <div className="flex-1 overflow-hidden min-h-0">
                {activeRightTab === "tasks" ? (
                  <TaskCenter 
                    selectedProjectId={selectedProjectId}
                    setSelectedProjectId={setSelectedProjectId}
                    showAddForm={showAddForm}
                    setShowAddForm={setShowAddForm}
                  />
                ) : (
                  <ProjectMemory 
                    selectedProjectId={selectedProjectId}
                    setSelectedProjectId={setSelectedProjectId}
                    isMemorySaving={isMemorySaving}
                    setIsMemorySaving={setIsMemorySaving}
                    memorySaveStatus={memorySaveStatus}
                    setMemorySaveStatus={setMemorySaveStatus}
                    setMemorySaveError={setMemorySaveError}
                  />
                )}
              </div>
            </div>
          )}

          {/* Horizontal Resizer Gutter */}
          {activeWs && isTaskCenterVisible && (
            <div
              onMouseDown={startHeightResize}
              onDoubleClick={() => setTaskCenterVisible(false)}
              className={`${isTaskPanelPinned ? 'relative w-full' : 'absolute right-0 z-30'} h-2 bg-transparent cursor-row-resize flex items-center justify-center group select-none flex-shrink-0`}
              style={isTaskPanelPinned ? {} : { 
                top: 'var(--top-panel-height)',
                left: (isSidebarVisible && !isAgentPanelPinned) ? 'calc(var(--sidebar-width) + 8px)' : '0px'
              }}
              title="Drag to resize top panel, Double-click to collapse"
            >
              {/* Drag handle button */}
              <div className="absolute left-1/2 -translate-x-1/2 h-1.5 w-6 rounded glass-panel transition-all duration-150 flex justify-center items-center gap-[2px] px-1 shadow-md">
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
              </div>
            </div>
          )}

          {/* Swarm Execution Center Panel */}
          {isSwarmPanelVisible && (
            <>
              <div
                onMouseDown={(e) => { e.preventDefault(); setIsSwarmDragging(true); }}
                className="h-2 bg-transparent cursor-row-resize flex-shrink-0 flex items-center justify-center group relative select-none"
              >
                <div className="h-[1px] w-full bg-border-glass group-hover:bg-accent-primary/50 group-active:bg-accent-primary transition-colors duration-150" />
                <div className="absolute left-1/2 -translate-x-1/2 h-1.5 w-6 rounded glass-panel group-hover:border-accent-primary/50 transition-all duration-150 flex justify-center items-center gap-[2px] px-1">
                  <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                  <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                  <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                </div>
              </div>
              <div
                className="flex-shrink-0 overflow-hidden"
                style={{ height: `${swarmPanelHeight}px` }}
              >
                <SwarmView />
              </div>
            </>
          )}

          {/* Bottom Panel (Terminal Workspace / Web Browser split) */}
          <div className="flex-1 min-h-0 flex flex-row gap-1 relative overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col glass-panel px-2 pb-2 pt-1 overflow-hidden">
              <TerminalWorkspace />
            </div>

            {/* Backdrop overlay for unpinned browser panel */}
            {isBrowserPanelVisible && !isBrowserPanelPinned && (
              <div 
                className="absolute inset-0 z-20 bg-black/20 cursor-default"
                onClick={toggleBrowserPanel}
              />
            )}

            {/* Backdrop overlay for unpinned review center panel */}
            {isReviewCenterOpen && !isReviewPanelPinned && (
              <div 
                className="absolute inset-0 z-20 bg-black/20 cursor-default"
                onClick={() => setReviewCenterOpen(false)}
              />
            )}

            {isBrowserPanelVisible && isBrowserPanelPinned && (
              <>
                {/* Resizable Divider Handle (only when pinned) */}
                <div
                  onMouseDown={startBrowserResize}
                  onDoubleClick={toggleBrowserPanel}
                  className="w-1.5 hover:w-2 bg-transparent cursor-col-resize flex-shrink-0 h-full flex items-center justify-center group relative select-none z-10"
                  title="Drag to resize browser panel, Double-click to collapse"
                >
                  <div className="w-[1px] h-full bg-border-glass group-hover:bg-[#f59e0b]/50 group-active:bg-[#f59e0b] transition-colors duration-150" />
                  <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-[#f59e0b]/50 group-active:border-[#f59e0b]/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                  </div>
                </div>

                {/* Web Browser Panel (Pinned) */}
                <div
                  className={`flex-shrink-0 h-full overflow-hidden glass-panel ${
                    isBrowserDragging ? '' : 'transition-[width] duration-300 ease-out'
                  }`}
                  style={{ width: 'var(--browser-panel-width)' }}
                >
                  <BrowserPanel />
                </div>
              </>
            )}

            {isBrowserPanelVisible && !isBrowserPanelPinned && (
              <>
                {/* Floating Resizer Handle (only when unpinned) */}
                <div
                  onMouseDown={startBrowserResize}
                  className="absolute top-0 bottom-0 w-2 bg-transparent cursor-col-resize flex items-center justify-center group select-none z-40"
                  style={{ right: 'var(--browser-panel-width)' }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-[#f59e0b]/50 group-active:border-[#f59e0b]/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                  </div>
                </div>

                {/* Web Browser Panel (Unpinned/Popup) */}
                <div
                  className={`!absolute right-0 top-0 bottom-0 z-30 overflow-hidden glass-panel shadow-2xl bg-[#08080a] backdrop-blur-xl border border-border-glass rounded-lg ${
                    isBrowserDragging ? '' : 'transition-[width] duration-300 ease-out'
                  }`}
                  style={{ width: 'var(--browser-panel-width)' }}
                >
                  <BrowserPanel />
                </div>
              </>
            )}

            {/* Agent Review Center Panel (Pinned) */}
            {isReviewCenterOpen && isReviewPanelPinned && activeWs && (
              <>
                {/* Resizable Divider Handle */}
                <div
                  onMouseDown={startReviewResize}
                  onDoubleClick={() => setReviewCenterOpen(false)}
                  className="w-1.5 hover:w-2 bg-transparent cursor-col-resize flex-shrink-0 h-full flex items-center justify-center group relative select-none z-10"
                  title="Drag to resize review panel, Double-click to collapse"
                >
                  <div className="w-[1px] h-full bg-border-glass group-hover:bg-[#f59e0b]/50 group-active:bg-[#f59e0b] transition-colors duration-150" />
                  <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-[#f59e0b]/50 group-active:border-[#f59e0b]/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                  </div>
                </div>

                <div
                  className={`flex-shrink-0 h-full overflow-hidden glass-panel ${
                    isReviewDragging ? '' : 'transition-[width] duration-300 ease-out'
                  }`}
                  style={{ width: 'var(--review-panel-width)' }}
                >
                  <AgentReviewCenter
                    repoPath={projects.find(p => p.id === selectedProjectId)?.path || activeWs.rootPath}
                    onClose={() => setReviewCenterOpen(false)}
                  />
                </div>
              </>
            )}

            {/* Agent Review Center Panel (Unpinned/Popup) */}
            {isReviewCenterOpen && !isReviewPanelPinned && activeWs && (
              <>
                {/* Floating Resizer Handle */}
                <div
                  onMouseDown={startReviewResize}
                  className="absolute top-0 bottom-0 w-2 bg-transparent cursor-col-resize flex items-center justify-center group select-none z-45"
                  style={{ right: 'var(--review-panel-width)' }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-[#f59e0b]/50 group-active:border-[#f59e0b]/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-[#f59e0b]" />
                  </div>
                </div>

                <div
                  className={`!absolute right-0 top-0 bottom-0 z-30 overflow-hidden glass-panel shadow-2xl bg-[#08080a] backdrop-blur-xl border border-border-glass rounded-lg ${
                    isReviewDragging ? '' : 'transition-[width] duration-300 ease-out'
                  }`}
                  style={{ width: 'var(--review-panel-width)' }}
                >
                  <AgentReviewCenter
                    repoPath={projects.find(p => p.id === selectedProjectId)?.path || activeWs.rootPath}
                    onClose={() => setReviewCenterOpen(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Visual Status bar at the bottom */}
      <div className="h-6 glass-bottombar px-4 flex items-center justify-between text-[10px] text-zinc-400 font-mono select-none flex-shrink-0 border-t border-white/[0.04] bg-[#050508]/90 z-40">
        {/* Left section: Connection & Workspace info */}
        <div className="flex items-center gap-3">
          {/* Connection status badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            PTY SERVER
          </div>

          {activeWs && (
            <div className="flex items-center gap-1.5 text-zinc-300">
              <span className="text-zinc-650">|</span>
              <span className="flex items-center gap-1 text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                Workspace:
              </span>
              <span className="text-zinc-200 font-semibold">{activeWs.name}</span>
            </div>
          )}

          {activeWs && (
            <div className="flex items-center gap-1.5 text-zinc-400 max-w-sm truncate" title={activeWs.rootPath}>
              <span className="text-zinc-750">/</span>
              <span className="text-[9px] font-mono text-zinc-500 truncate">{activeWs.rootPath}</span>
            </div>
          )}
        </div>

        {/* Right section: Session state & Metrics */}
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-zinc-500">
            <BarChart2 size={10} className="text-zinc-500" />
            Snapshot Synced
          </span>

          <div className="h-3 w-[1px] bg-zinc-800" />

          {/* Metrics Gauges */}
          <div className="flex items-center gap-1.5">
            {/* CPU */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.04] text-zinc-400" title="Global CPU Load">
              <Cpu size={10} className="text-amber-500" />
              <span>CPU <span className="text-zinc-200 font-bold">{cpuLoad}%</span></span>
            </div>
            
            {/* RAM */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.04] text-zinc-400" title="Global Memory Used">
              <HardDrive size={10} className="text-amber-500" />
              <span>RAM <span className="text-zinc-200 font-bold">{ramLoad} GB</span></span>
            </div>

            {/* PTYs */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.04] text-zinc-400" title="Active PTY Processes">
              <Layers size={10} className="text-amber-500" />
              <span>PTYs <span className="text-zinc-200 font-bold">{terminals.length}</span></span>
            </div>
          </div>
        </div>
      </div>
      </div>
      <ContextMenu />
      <CustomDialog />
      <SettingsModal />
    </div>
  );
}

export default App;
