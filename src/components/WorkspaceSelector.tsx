import React, { useState } from "react";
import { FolderPlus, FolderOpen, Plus, Layout, Layers, Trash2, Settings } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { invoke } from "@tauri-apps/api/core";

export const WorkspaceSelector: React.FC = () => {
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

  const handleCreateWs = async () => {
    if (!wsName.trim()) return;
    try {
      const selectedPath = await invoke<string | null>("select_folder");
      if (selectedPath) {
        await createWorkspace(wsName, selectedPath);
        setWsName("");
        setShowNewWsModal(false);
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
    <div className="bg-[#0c0c0e] border-b border-[#232329] px-4 py-2 flex items-center justify-between h-11 select-none">
      {/* Workspace Picker */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-sky-400" />
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-500 font-mono">Workspace:</span>
        </div>
        
        {workspaces.length === 0 ? (
          <button
            onClick={() => setShowNewWsModal(true)}
            className="flex items-center gap-1.5 bg-[#38bdf8]/10 text-sky-400 border border-[#38bdf8]/20 hover:bg-[#38bdf8]/20 text-xs py-1 px-3 rounded transition-all"
          >
            <FolderPlus size={13} />
            Create Workspace
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <select
              value={activeWorkspaceId || ""}
              onChange={(e) => selectWorkspace(e.target.value)}
              className="bg-[#121214] text-xs text-zinc-200 border border-[#232329] px-2.5 py-1 rounded outline-none cursor-pointer focus:border-sky-500/50"
            >
              <option value="" disabled>-- Select Workspace --</option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
            
            <button
              onClick={() => setShowNewWsModal(true)}
              title="Create New Workspace"
              className="p-1 hover:bg-[#1a1a20] rounded border border-[#232329] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <Plus size={14} />
            </button>

            {activeWorkspaceId && (
              <button
                onClick={() => {
                  const ws = workspaces.find(w => w.id === activeWorkspaceId);
                  showConfirmDialog(
                    "Delete Current Workspace",
                    `Are you sure you want to delete workspace "${ws?.name}"? This will close all active terminal PTY sessions.`,
                    () => {
                      deleteWorkspace(activeWorkspaceId);
                    }
                  );
                }}
                title="Delete Current Workspace"
                className="p-1 hover:bg-rose-500/10 rounded border border-[#232329] hover:border-rose-500/35 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Projects List metadata / Add Project buttons */}
      {activeWorkspaceId && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono">
            <span>Projects:</span>
            <span className="bg-[#1a1a20] px-1.5 py-0.5 rounded text-zinc-300 text-[10px] font-bold border border-[#232329]">
              {activeProjects.length}
            </span>
          </div>

          <button
            onClick={() => setShowNewProjModal(true)}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs py-1 px-3.5 rounded border border-zinc-700 transition-colors"
          >
            <Plus size={13} />
            Add Project
          </button>

          <button
            onClick={() => setSidebarVisible(!isSidebarVisible)}
            className={`flex items-center gap-1.5 text-xs py-1 px-3 rounded border transition-all ${
              isSidebarVisible
                ? "bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border-zinc-700"
                : "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
            }`}
            title={isSidebarVisible ? "Collapse Left Sidebar" : "Expand Left Sidebar"}
          >
            <Layout size={13} />
            Toggle Sidebar
          </button>

          <button
            onClick={() => setTaskCenterVisible(!isTaskCenterVisible)}
            className={`flex items-center gap-1.5 text-xs py-1 px-3 rounded border transition-all ${
              isTaskCenterVisible
                ? "bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border-zinc-700"
                : "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
            }`}
            title={isTaskCenterVisible ? "Collapse Task Board & Project Memory" : "Expand Task Board & Project Memory"}
          >
            <Layers size={13} />
            Toggle Task Board
          </button>

          <button
            onClick={() => setSettingsModalOpen(true)}
            className="flex items-center gap-1.5 text-xs py-1 px-3 rounded border transition-all bg-zinc-800/50 hover:bg-zinc-700/80 text-zinc-300 border-zinc-700 hover:text-white"
            title="Open App Settings"
          >
            <Settings size={13} />
            Settings
          </button>
        </div>
      )}

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
