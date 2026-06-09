import { useEffect, useState } from "react";
import { FolderOpen, BarChart2, Cpu, HardDrive, Layers, Trash2, Plus, Save } from "lucide-react";
import { ActivityBar } from "./components/ActivityBar";
import { AgentGrid } from "./components/AgentGrid";
import { TerminalWorkspace } from "./components/TerminalWorkspace";
import { ActivityFeed } from "./components/ActivityFeed";
import { TaskCenter } from "./components/TaskCenter";
import { ProjectMemory } from "./components/ProjectMemory";
import { SwarmView } from "./components/SwarmView/SwarmView";
import { useOrchestratorStore } from "./stores/orchestratorStore";
import { useSwarmStore } from "./stores/swarmStore";
import { AnalyticsService } from "./services/analytics";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "./components/ContextMenu";
import { CustomDialog } from "./components/CustomDialog";
import { SettingsModal } from "./components/SettingsModal";
import { EventBus } from "./core/events";
import { DEFAULT_APP_SETTINGS } from "./types";
function App() {
  const initStore = useOrchestratorStore(s => s.initStore);
  const showConfirmDialog = useOrchestratorStore(s => s.showConfirmDialog);
  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const workspaces = useOrchestratorStore(s => s.workspaces);
  const createWorkspace = useOrchestratorStore(s => s.createWorkspace);
  const terminals = useOrchestratorStore(s => s.terminals);
  const projects = useOrchestratorStore(s => s.projects);

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
  const sidebarWidth = useOrchestratorStore(s => s.sidebarWidth);
  const topPanelHeight = useOrchestratorStore(s => s.topPanelHeight);

  const setSidebarVisible = useOrchestratorStore(s => s.setSidebarVisible);
  const setTaskCenterVisible = useOrchestratorStore(s => s.setTaskCenterVisible);
  const setSidebarWidth = useOrchestratorStore(s => s.setSidebarWidth);
  const setTopPanelHeight = useOrchestratorStore(s => s.setTopPanelHeight);

  const [initName, setInitName] = useState("");
  const [isActivityFeedExpanded, setIsActivityFeedExpanded] = useState(false);
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  const [isHeightDragging, setIsHeightDragging] = useState(false);
  const [isSwarmDragging, setIsSwarmDragging] = useState(false);

  const { isSwarmPanelVisible, swarmPanelHeight, setSwarmPanelHeight } = useSwarmStore();

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

  const startHeightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsHeightDragging(true);
  };

  useEffect(() => {
    if (!isSidebarDragging) return;

    let frameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const newWidth = Math.max(420, Math.min(e.clientX - 56, 800));
        setSidebarWidth(newWidth);
      });
    };

    const handleMouseUp = () => {
      if (frameId) cancelAnimationFrame(frameId);
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
        const newHeight = Math.max(150, Math.min(e.clientY - 80, 600));
        setTopPanelHeight(newHeight);
      });
    };

    const handleMouseUp = () => {
      if (frameId) cancelAnimationFrame(frameId);
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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return;
      }

      const state = useOrchestratorStore.getState();
      const shortcuts = { ...DEFAULT_APP_SETTINGS.shortcuts, ...(state.settings?.shortcuts || {}) };
      
      const checkShortcut = (shortcutString: string | undefined) => {
        if (!shortcutString) return false;
        const parts = shortcutString.toLowerCase().split('+').map(s => s.trim());
        const key = parts[parts.length - 1];
        const needsCtrl = parts.includes('ctrl') || parts.includes('cmd');
        const needsShift = parts.includes('shift');
        const needsAlt = parts.includes('alt');
        
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
      <div className="h-screen w-screen text-zinc-100 flex flex-col justify-center items-center font-sans p-6 select-none relative">
        
        <div className="w-full max-w-md glass-panel-elevated p-8 space-y-6 text-center z-10 relative">
          {/* Logo brand */}
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/20 border border-zinc-700/30 flex items-center justify-center text-accent-primary font-bold text-lg mx-auto shadow-inner">
            MV
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-200">
              Multiple Vibe AI Orchestrator
            </h1>
            <p className="text-zinc-500 text-xs max-w-sm mx-auto leading-relaxed">
              A command-center dashboard designed to coordinate and monitor arbitrary CLI coding agents across multiple project folders.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {workspaces.length > 0 ? (
              <div className="space-y-3">
                <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-wider">
                  Resume Workspace Session
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                  {workspaces.map(ws => (
                    <div key={ws.id} className="flex items-center gap-2 w-full">
                      <button
                        onClick={() => useOrchestratorStore.getState().selectWorkspace(ws.id)}
                        className="flex-1 glass-button hover:bg-white/5 px-4 py-2.5 rounded text-left text-xs font-medium text-zinc-300 transition-colors flex items-center justify-between min-w-0"
                      >
                        <span className="truncate font-semibold mr-2">{ws.name}</span>
                        <span className="text-[9px] font-mono text-zinc-500 truncate max-w-[150px]" title={ws.rootPath}>{ws.rootPath}</span>
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
                        className="glass-button glass-button--danger glass-button--sm flex-shrink-0 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="text-zinc-650 font-semibold text-[11px] font-mono select-none">
                  - OR -
                </div>
              </div>
            ) : null}

            <div className="space-y-3 border-t border-zinc-800/40 pt-4">
              <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-wider">
                Create New Session
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={initName}
                  onChange={(e) => setInitName(e.target.value)}
                  placeholder="Workspace Name (e.g. CLI Coding Team)"
                  className="glass-input"
                />
                <button
                  onClick={handleInitWorkspace}
                  disabled={!initName.trim()}
                  className="glass-button glass-button--accent w-full flex items-center justify-center gap-2 font-semibold text-xs py-2.5 px-4 rounded shadow-md transition-colors"
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
    <div className={`h-screen w-screen text-zinc-200 overflow-hidden flex flex-row font-sans relative ${(isSidebarDragging || isHeightDragging || isSwarmDragging) ? "is-dragging" : ""}`}>
      <ActivityBar />

      {/* Main content column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* 2. Main Dashboard Layout splits */}
        <div className="flex-1 flex overflow-hidden p-1 gap-0">
        {/* Left Side Dock columns (resizable) - Agents & Telemetry Feed */}
        <div 
          className={`flex flex-col gap-1 flex-shrink-0 h-full overflow-hidden ${
            isSidebarDragging ? '' : 'transition-[width,opacity,margin] duration-300 ease-out'
          } ${isSidebarVisible ? 'opacity-100 mr-1' : 'opacity-0 pointer-events-none'}`}
          style={{ width: isSidebarVisible ? `${sidebarWidth}px` : '0px' }}
        >
          {/* Inner container to prevent text reflow while width animates */}
          <div className="flex-1 flex flex-col h-full gap-1" style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}>
            {/* Active Agent Profiles list */}
            <div className="flex-grow flex flex-col glass-panel px-1.5 pt-1.5 pb-0 min-h-[300px] overflow-hidden">
              <AgentGrid />
            </div>

            {/* Chronological logs feed */}
            <div className={`${isActivityFeedExpanded ? 'h-72' : 'h-7'} flex-shrink-0 transition-[height] duration-300 ease-out`}>
              <ActivityFeed isExpanded={isActivityFeedExpanded} onToggle={() => setIsActivityFeedExpanded(!isActivityFeedExpanded)} />
            </div>
          </div>
        </div>

        {isSidebarVisible && (
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

        {/* Right Side Dock viewport (split into top controls panel & bottom PTY workspace) */}
        <div className="flex-1 h-full min-w-0 flex flex-col gap-0 overflow-hidden relative">
          
          {/* Top Panel (Task Board & Project Memory tabs) */}
          {activeWs && (
            <div 
              className={`!absolute top-0 left-0 right-0 z-20 flex flex-col glass-panel shadow-2xl bg-[#0a0a0f]/95 backdrop-blur-xl overflow-hidden ${
                isHeightDragging ? '' : 'transition-[transform,opacity] duration-300 ease-out'
              } p-2 border-b border-border-glass`}
              style={{ 
                height: `${topPanelHeight}px`,
                transform: isTaskCenterVisible ? 'translateY(0)' : `translateY(-${topPanelHeight}px)`,
                opacity: isTaskCenterVisible ? 1 : 0,
                pointerEvents: isTaskCenterVisible ? 'auto' : 'none'
              }}
            >
              {/* Header Tabs */}
              <div className="flex items-center justify-between select-none border-b border-border-glass pb-1.5 mb-2.5 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveRightTab("tasks")}
                    className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded transition-all transform active:scale-95 whitespace-nowrap flex-shrink-0 ${
                      activeRightTab === "tasks"
                        ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                        : "text-zinc-550 hover:text-zinc-300 hover:bg-white/5 border border-transparent cursor-pointer"
                    }`}
                  >
                    <Layers size={10} />
                    Task Center
                  </button>
                  <button
                    onClick={() => setActiveRightTab("memory")}
                    className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded transition-all transform active:scale-95 whitespace-nowrap flex-shrink-0 ${
                      activeRightTab === "memory"
                        ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                        : "text-zinc-550 hover:text-zinc-300 hover:bg-white/5 border border-transparent cursor-pointer"
                    }`}
                  >
                    <HardDrive size={10} />
                    Project Memory
                  </button>

                  <div className="h-3 w-px bg-border-glass/40 mx-1"></div>

                  {activeProjects.length > 0 && (
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="glass-input text-[9.5px] text-zinc-300 font-semibold font-mono cursor-pointer w-auto !py-0 !pl-2 !pr-6 h-[24px] border-border-glass/30 rounded leading-none"
                    >
                      {activeProjects.map(p => (
                        <option key={p.id} value={p.id} className="bg-[#0f0f15]">{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {activeRightTab === "tasks" && selectedProjectId && (
                    <button
                      onClick={() => setShowAddForm(!showAddForm)}
                      className="flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black text-[9px] font-bold py-1 px-3 rounded transition-all transform active:scale-95 shadow-[0_0_10px_rgba(245,158,11,0.15)] hover:shadow-[0_0_16px_rgba(245,158,11,0.3)] cursor-pointer h-[24px]"
                    >
                      <Plus size={10} />
                      {showAddForm ? "Hide Form" : "Create Task"}
                    </button>
                  )}

                  {activeRightTab === "memory" && selectedProjectId && (
                    <div className="flex items-center gap-2">
                      {memorySaveStatus === "success" && (
                        <span className="text-[8.5px] text-emerald-455 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Saved</span>
                      )}
                      {memorySaveStatus === "error" && (
                        <span className="text-[8.5px] text-rose-455 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20" title={memorySaveError}>Error</span>
                      )}
                      <button
                        onClick={() => EventBus.publish("project-memory:save", undefined)}
                        disabled={isMemorySaving}
                        className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 border border-zinc-700/50 text-zinc-200 font-bold text-[9px] py-1 px-3 rounded transition-all uppercase cursor-pointer h-[24px]"
                      >
                        <Save size={10} />
                        {isMemorySaving ? "Saving..." : "Save Memory"}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setTaskCenterVisible(false)}
                    className="text-zinc-550 hover:text-rose-450 px-2 py-1 hover:bg-white/5 border border-transparent hover:border-border-glass/40 rounded transition-all text-[9.5px] font-bold uppercase flex items-center gap-1 font-mono cursor-pointer h-[24px]"
                    title="Collapse Panel"
                  >
                    Hide Panel
                  </button>
                </div>
              </div>

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
              className="absolute left-0 right-0 z-30 h-2 bg-transparent cursor-row-resize flex items-center justify-center group select-none"
              style={{ top: `${topPanelHeight}px` }}
              title="Drag to resize top panel, Double-click to collapse"
            >
              {/* Horizontal line divider */}
              <div className="h-[1px] w-full bg-border-glass group-hover:bg-accent-primary/50 group-active:bg-accent-primary transition-colors duration-150" />
              
              {/* Drag handle button */}
              <div className="absolute left-1/2 -translate-x-1/2 h-1.5 w-6 rounded glass-panel group-hover:border-accent-primary/50 group-active:border-accent-primary/80 transition-all duration-150 flex justify-center items-center gap-[2px] px-1 shadow-md">
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
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

          {/* Bottom Panel (Terminal Workspace) */}
          <div className="flex-1 h-full min-h-0 flex flex-col glass-panel p-2 overflow-hidden">
            <TerminalWorkspace />
          </div>
        </div>
      </div>

      {/* Visual Status bar at the bottom */}
      <div className="h-[18px] glass-bottombar px-4 flex items-center justify-between text-[9px] text-zinc-500 font-mono select-none flex-shrink-0 border-t border-border-glass/30">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            PTY Server Connected
          </span>
          {activeWs && (
            <span>
              Root: {activeWs.rootPath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>Active Workspace: {activeWs?.name}</span>
          <span className="flex items-center gap-1 border-r border-zinc-800/80 pr-3">
            <BarChart2 size={10} className="text-zinc-600" />
            Session Snapshot Saved
          </span>
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-1 text-[9px] text-zinc-500 font-mono" title="Global CPU Load">
              <Cpu size={10} className="text-accent-primary" />
              CPU: <span className="text-zinc-300 font-semibold">{cpuLoad}%</span>
            </span>
            <span className="flex items-center gap-1 text-[9px] text-zinc-500 font-mono" title="Global Memory Used">
              <HardDrive size={10} className="text-accent-primary" />
              RAM: <span className="text-zinc-300 font-semibold">{ramLoad} GB</span>
            </span>
            <span className="flex items-center gap-1 text-[9px] text-zinc-500 font-mono" title="OS PTY processes count">
              <Layers size={10} className="text-accent-primary" />
              PTYs: <span className="text-zinc-300 font-semibold">{terminals.length}</span>
            </span>
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
