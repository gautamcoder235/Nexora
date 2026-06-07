import React, { useState, useRef, useEffect } from "react";
import { FolderPlus, FolderOpen, Plus, Layout, Layers, Trash2, Settings, Box } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { invoke } from "@tauri-apps/api/core";

export const ActivityBar: React.FC = () => {
  const {
    workspaces,
    projects,
    activeWorkspaceId,
    createWorkspace,
    selectWorkspace,
    deleteWorkspace,
    addProject,
    isSidebarVisible,
    isTaskCenterVisible,
    setSidebarVisible,
    setTaskCenterVisible,
    setSettingsModalOpen,
    showConfirmDialog
  } = useOrchestratorStore();

  const [wsName, setWsName] = useState("");
  const [projName, setProjName] = useState("");
  const [showNewWsModal, setShowNewWsModal] = useState(false);
  const [showNewProjModal, setShowNewProjModal] = useState(false);
  const [showWsMenu, setShowWsMenu] = useState(false);

  const wsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wsMenuRef.current && !wsMenuRef.current.contains(event.target as Node)) {
        setShowWsMenu(false);
      }
    };
    if (showWsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showWsMenu]);

  const handleCreateWs = async () => {
    if (!wsName.trim()) return;
    try {
      const selectedPath = await invoke<string | null>("select_folder");
      if (selectedPath) {
        await createWorkspace(wsName, selectedPath);
        setWsName("");
        setShowNewWsModal(false);
        setShowWsMenu(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddProj = async () => {
    if (!projName.trim() || !activeWorkspaceId) return;
    try {
      const selectedPath = await invoke<string | null>("select_folder");
      if (selectedPath) {
        await addProject(projName, selectedPath);
        setProjName("");
        setShowNewProjModal(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);

  return (
    <div className="w-[52px] bg-[#0c0c0e] border-r border-[#232329] flex flex-col items-center py-4 flex-shrink-0 z-40 select-none">
      
      {/* Top Zone: Branding & Workspace */}
      <div className="flex flex-col items-center gap-4 w-full relative" ref={wsMenuRef}>
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-xs shadow-inner mb-2 cursor-default">
          MV
        </div>

        {/* Workspace Switcher Button */}
        <button
          onClick={() => setShowWsMenu(!showWsMenu)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative ${
            showWsMenu ? 'bg-[#1a1a20] text-sky-400' : 'text-zinc-400 hover:bg-[#1a1a20] hover:text-zinc-200'
          }`}
          title="Workspaces"
        >
          {activeWorkspaceId ? <FolderOpen size={20} /> : <Box size={20} />}
          
          {/* Active indicator dot */}
          {activeWorkspaceId && (
            <div className="absolute top-2.5 right-2 w-2 h-2 rounded-full bg-sky-500 border-2 border-[#0c0c0e]" />
          )}
        </button>

        {/* Workspace Popover Menu */}
        {showWsMenu && (
          <div className="absolute left-14 top-10 w-64 bg-[#121214] border border-[#232329] rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-200 z-50">
            <div className="px-3 py-2 border-b border-[#232329] bg-[#0c0c0e]">
              <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold tracking-wider">Switch Workspace</span>
            </div>
            <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
              {workspaces.length === 0 ? (
                <div className="text-xs text-zinc-500 p-2 text-center">No workspaces found</div>
              ) : (
                workspaces.map(ws => (
                  <div
                    key={ws.id}
                    className={`flex items-center justify-between group px-2 py-2 rounded-md cursor-pointer transition-colors ${
                      ws.id === activeWorkspaceId ? 'bg-sky-500/10 text-sky-400' : 'hover:bg-[#1a1a20] text-zinc-300'
                    }`}
                    onClick={() => {
                      selectWorkspace(ws.id);
                      setShowWsMenu(false);
                    }}
                  >
                    <span className="text-xs truncate max-w-[180px]">{ws.name}</span>
                    {ws.id === activeWorkspaceId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          showConfirmDialog(
                            "Delete Current Workspace",
                            `Are you sure you want to delete workspace "${ws.name}"? This will close all active terminal sessions.`,
                            () => {
                              deleteWorkspace(activeWorkspaceId);
                              setShowWsMenu(false);
                            }
                          );
                        }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-all"
                        title="Delete Workspace"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="p-1.5 border-t border-[#232329] bg-[#0c0c0e]/50">
              <button
                onClick={() => {
                  setShowNewWsModal(true);
                  setShowWsMenu(false);
                }}
                className="w-full flex items-center justify-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a20] py-2 rounded-md transition-colors"
              >
                <Plus size={14} /> Create Workspace
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Middle Zone: Tools & Toggles */}
      <div className="flex-1 w-full flex flex-col items-center gap-2 mt-4">
        <div className="w-6 h-px bg-[#232329] mb-2" />
        
        {activeWorkspaceId && (
          <>
            <button
              onClick={() => setShowNewProjModal(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-[#1a1a20] hover:text-zinc-200 transition-all relative group"
              title="Add Project"
            >
              <FolderPlus size={20} />
              <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[8px] font-bold text-zinc-300">
                {activeProjects.length}
              </div>
            </button>

            <button
              onClick={() => setSidebarVisible(!isSidebarVisible)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isSidebarVisible
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'text-zinc-400 hover:bg-[#1a1a20] hover:text-zinc-200 border border-transparent'
              }`}
              title={isSidebarVisible ? "Hide Agent Sidebar" : "Show Agent Sidebar"}
            >
              <Layout size={20} />
            </button>

            <button
              onClick={() => setTaskCenterVisible(!isTaskCenterVisible)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isTaskCenterVisible
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'text-zinc-400 hover:bg-[#1a1a20] hover:text-zinc-200 border border-transparent'
              }`}
              title={isTaskCenterVisible ? "Hide Task Board" : "Show Task Board"}
            >
              <Layers size={20} />
            </button>
          </>
        )}
      </div>

      {/* Bottom Zone: Settings */}
      <div className="flex flex-col items-center gap-2 w-full mt-auto">
        {activeWorkspaceId && (
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-[#1a1a20] hover:text-zinc-200 transition-all"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        )}
      </div>

      {/* Workspace Modal */}
      {showNewWsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#121214] border border-[#232329] rounded-lg p-6 w-96 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <FolderPlus size={16} className="text-sky-400" />
              Create Workspace Session
            </h3>
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-zinc-500 uppercase">Workspace Name</label>
              <input
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="e.g. My Backend Swarm"
                className="w-full bg-[#0c0c0e] text-xs text-zinc-200 border border-[#232329] px-3 py-2 rounded outline-none focus:border-sky-500/50"
              />
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setShowNewWsModal(false)}
                className="bg-transparent hover:bg-[#1a1a20] text-zinc-400 text-xs py-1.5 px-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWs}
                disabled={!wsName.trim()}
                className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#0c0c0e] font-semibold text-xs py-1.5 px-4 rounded disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
              >
                Select Root Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Modal */}
      {showNewProjModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#121214] border border-[#232329] rounded-lg p-6 w-96 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <FolderPlus size={16} className="text-sky-400" />
              Add Project Repository
            </h3>
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-zinc-500 uppercase">Project Name</label>
              <input
                type="text"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                placeholder="e.g. frontend-core"
                className="w-full bg-[#0c0c0e] text-xs text-zinc-200 border border-[#232329] px-3 py-2 rounded outline-none focus:border-sky-500/50"
              />
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setShowNewProjModal(false)}
                className="bg-transparent hover:bg-[#1a1a20] text-zinc-400 text-xs py-1.5 px-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProj}
                disabled={!projName.trim()}
                className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#0c0c0e] font-semibold text-xs py-1.5 px-4 rounded disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
              >
                Select Folder Path
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
