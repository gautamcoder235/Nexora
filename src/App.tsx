import { useEffect, useState } from "react";
import { FolderOpen, BarChart2, Cpu, HardDrive, Layers, Trash2 } from "lucide-react";
import { ActivityBar } from "./components/ActivityBar";
import { AgentGrid } from "./components/AgentGrid";
import { TerminalWorkspace } from "./components/TerminalWorkspace";
import { ActivityFeed } from "./components/ActivityFeed";
import { TaskCenter } from "./components/TaskCenter";
import { ProjectMemory } from "./components/ProjectMemory";
import { useOrchestratorStore } from "./stores/orchestratorStore";
import { AnalyticsService } from "./services/analytics";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "./components/ContextMenu";
import { CustomDialog } from "./components/CustomDialog";
import { SettingsModal } from "./components/SettingsModal";
function App() {
  const initStore = useOrchestratorStore(s => s.initStore);
  const showConfirmDialog = useOrchestratorStore(s => s.showConfirmDialog);
  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const workspaces = useOrchestratorStore(s => s.workspaces);
  const createWorkspace = useOrchestratorStore(s => s.createWorkspace);
  const terminals = useOrchestratorStore(s => s.terminals);

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

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(300, Math.min(e.clientX - 24, 800));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsSidebarDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSidebarDragging, setSidebarWidth]);

  useEffect(() => {
    if (!isHeightDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = Math.max(150, Math.min(e.clientY - 80, 600));
      setTopPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsHeightDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isHeightDragging, setTopPanelHeight]);

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
      <div className="h-screen w-screen bg-[#070709] text-zinc-100 flex flex-col justify-center items-center font-sans p-6 select-none relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(255,255,255,0))] pointer-events-none" />
        
        <div className="w-full max-w-md bg-[#121214] border border-[#232329] rounded-xl p-8 shadow-2xl space-y-6 text-center z-10 relative">
          {/* Logo brand */}
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-lg mx-auto shadow-inner">
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
                        className="flex-1 bg-[#0c0c0e] hover:bg-zinc-800/40 border border-[#232329] px-4 py-2.5 rounded text-left text-xs font-medium text-zinc-300 transition-colors flex items-center justify-between min-w-0"
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
                        className="p-2 hover:bg-rose-500/10 rounded border border-[#232329] hover:border-rose-500/30 text-zinc-500 hover:text-rose-400 transition-colors flex-shrink-0 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="text-zinc-600 font-semibold text-[11px] font-mono select-none">
                  - OR -
                </div>
              </div>
            ) : null}

            <div className="space-y-3 border-t border-zinc-800/60 pt-4">
              <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-wider">
                Create New Session
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={initName}
                  onChange={(e) => setInitName(e.target.value)}
                  placeholder="Workspace Name (e.g. CLI Coding Team)"
                  className="w-full bg-[#0c0c0e] text-xs text-zinc-200 border border-[#232329] px-3 py-2.5 rounded outline-none focus:border-purple-500/40"
                />
                <button
                  onClick={handleInitWorkspace}
                  disabled={!initName.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold text-xs py-2.5 px-4 rounded shadow-md transition-colors"
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
    <div className="h-screen w-screen bg-[#070709] text-zinc-200 overflow-hidden flex flex-row font-sans relative">
      <ActivityBar />

      {/* Main content column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* 2. Main Dashboard Layout splits */}
        <div className="flex-1 flex overflow-hidden p-1 gap-0">
        {/* Left Side Dock columns (resizable) - Agents & Telemetry Feed */}
        {isSidebarVisible && (
          <>
            <div 
              className="flex flex-col gap-1 flex-shrink-0 h-full overflow-hidden"
              style={{ width: `${sidebarWidth}px` }}
            >
              {/* Active Agent Profiles list */}
              <div className="flex-grow flex flex-col bg-[#0c0c0e] border border-[#232329] rounded-lg p-2 shadow-sm min-h-[300px] overflow-hidden">
                <AgentGrid />
              </div>

              {/* Chronological logs feed */}
              <div className={`${isActivityFeedExpanded ? 'h-72' : 'h-11'} flex-shrink-0 transition-all duration-300`}>
                <ActivityFeed isExpanded={isActivityFeedExpanded} onToggle={() => setIsActivityFeedExpanded(!isActivityFeedExpanded)} />
              </div>
            </div>

            <div
              onMouseDown={startSidebarResize}
              onDoubleClick={() => setSidebarVisible(false)}
              className="w-2 bg-transparent cursor-col-resize flex-shrink-0 h-full flex items-center justify-center group relative select-none"
              title="Drag to resize sidebar, Double-click to collapse"
            >
              {/* Vertical line divider */}
              <div className="w-[1px] h-full bg-[#1b1b22] group-hover:bg-purple-500/50 group-active:bg-purple-500 transition-colors duration-150" />
              
              {/* Drag handle button */}
              <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded bg-[#121214] border border-[#232329] group-hover:bg-[#1a1a20] group-hover:border-purple-500/50 group-active:border-purple-500/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-purple-400" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-purple-400" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-purple-400" />
              </div>
            </div>
          </>
        )}

        {/* Right Side Dock viewport (split into top controls panel & bottom PTY workspace) */}
        <div className="flex-1 h-full min-w-0 flex flex-col gap-0 overflow-hidden">
          
          {/* Top Panel (Task Board & Project Memory tabs) */}
          {activeWs && (
            <div 
              className={`flex flex-col bg-[#0c0c0e] border-[#232329] rounded-lg shadow-sm overflow-hidden ${
                isHeightDragging ? '' : 'transition-all duration-300 ease-in-out'
              } ${isTaskCenterVisible ? 'border p-2' : 'border-0 p-0'}`}
              style={{ height: isTaskCenterVisible ? `${topPanelHeight}px` : '0px' }}
            >
              {/* Header Tabs */}
              <div className="flex items-center justify-between select-none border-b border-[#232329]/60 pb-2 mb-3 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveRightTab("tasks")}
                    className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded transition-all ${
                      activeRightTab === "tasks"
                        ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        : "text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    }`}
                  >
                    <Layers size={11} />
                    Task Center
                  </button>
                  <button
                    onClick={() => setActiveRightTab("memory")}
                    className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded transition-all ${
                      activeRightTab === "memory"
                        ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        : "text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    }`}
                  >
                    <HardDrive size={11} />
                    Project Memory
                  </button>
                </div>

                <button
                  onClick={() => setTaskCenterVisible(false)}
                  className="text-zinc-500 hover:text-rose-400 p-1 hover:bg-[#1a1a20] rounded transition-colors text-[9px] font-bold uppercase flex items-center gap-1 font-mono cursor-pointer"
                  title="Collapse Panel"
                >
                  Hide Panel
                </button>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 overflow-hidden min-h-0">
                {activeRightTab === "tasks" ? <TaskCenter /> : <ProjectMemory />}
              </div>
            </div>
          )}

          {/* Horizontal Resizer Gutter */}
          {activeWs && isTaskCenterVisible && (
            <div
              onMouseDown={startHeightResize}
              onDoubleClick={() => setTaskCenterVisible(false)}
              className="h-2 bg-transparent cursor-row-resize flex-shrink-0 flex items-center justify-center group relative select-none"
              title="Drag to resize top panel, Double-click to collapse"
            >
              {/* Horizontal line divider */}
              <div className="h-[1px] w-full bg-[#1b1b22] group-hover:bg-purple-500/50 group-active:bg-purple-500 transition-colors duration-150" />
              
              {/* Drag handle button */}
              <div className="absolute left-1/2 -translate-x-1/2 h-1.5 w-6 rounded bg-[#121214] border border-[#232329] group-hover:bg-[#1a1a20] group-hover:border-purple-500/50 group-active:border-purple-500/80 transition-all duration-150 flex justify-center items-center gap-[2px] px-1 shadow-md">
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-purple-400" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-purple-400" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-purple-400" />
              </div>
            </div>
          )}

          {/* Bottom Panel (Terminal Workspace) */}
          <div className="flex-1 h-full min-h-0 flex flex-col bg-[#0c0c0e] border border-[#232329] rounded-lg p-2 shadow-sm overflow-hidden">
            <TerminalWorkspace />
          </div>
        </div>
      </div>

      {/* Visual Status bar at the bottom */}
      <div className="h-5 bg-[#08080a] border-t border-[#1b1b22] px-4 flex items-center justify-between text-[10px] text-zinc-500 font-mono select-none flex-shrink-0">
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
              <Cpu size={10} className="text-purple-400" />
              CPU: <span className="text-zinc-300 font-semibold">{cpuLoad}%</span>
            </span>
            <span className="flex items-center gap-1 text-[9px] text-zinc-500 font-mono" title="Global Memory Used">
              <HardDrive size={10} className="text-purple-400" />
              RAM: <span className="text-zinc-300 font-semibold">{ramLoad} GB</span>
            </span>
            <span className="flex items-center gap-1 text-[9px] text-zinc-500 font-mono" title="OS PTY processes count">
              <Layers size={10} className="text-purple-400" />
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
