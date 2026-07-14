import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FolderPlus, FolderOpen, Plus, Trash2, Settings, Box, Zap, Globe, Bot, ClipboardList, LogOut, Edit2, GitPullRequest, Users } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";

import { useTeamStore } from "../stores/teamStore";
import { useBrowserStore } from "../stores/browserStore";
import { useChangesetStore } from "../stores/changesetStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const ActivityBar: React.FC = () => {
  const {
    workspaces,
    projects,
    activeWorkspaceId,
    createWorkspace,
    selectWorkspace,
    deleteWorkspace,
    addProject,
    deleteProject,
    renameProject,
    renameWorkspace,
    isSidebarVisible,
    isTaskCenterVisible,
    setSidebarVisible,
    setTaskCenterVisible,
    setSettingsModalOpen,
    showConfirmDialog
  } = useOrchestratorStore();



  const { isTeamPanelVisible, setTeamPanelVisible, nodes } = useTeamStore();
  const teamRunningCount = nodes.filter(n => n.status === "running").length;

  const [wsName, setWsName] = useState("");
  const [projName, setProjName] = useState("");
  const [showNewWsModal, setShowNewWsModal] = useState(false);
  const [showNewProjModal, setShowNewProjModal] = useState(false);
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [wsMenuPos, setWsMenuPos] = useState({ top: 0, left: 0 });

  const [showProjMenu, setShowProjMenu] = useState(false);
  const [projMenuPos, setProjMenuPos] = useState({ top: 0, left: 0 });
  const [showRenameProjModal, setShowRenameProjModal] = useState(false);
  const [renameProjId, setRenameProjId] = useState<string | null>(null);
  const [renameProjName, setRenameProjName] = useState("");

  const [showRenameWsModal, setShowRenameWsModal] = useState(false);
  const [renameWsId, setRenameWsId] = useState<string | null>(null);
  const [renameWsName, setRenameWsName] = useState("");

  const [droppedPath, setDroppedPath] = useState<string | null>(null);
  const [droppedName, setDroppedName] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);

  const wsMenuRef = useRef<HTMLDivElement>(null);
  const wsPopoverRef = useRef<HTMLDivElement>(null);
  const wsButtonRef = useRef<HTMLButtonElement>(null);
  const projPopoverRef = useRef<HTMLDivElement>(null);
  const projButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      const inWsButton = wsButtonRef.current?.contains(target);
      const inWsPopover = wsPopoverRef.current?.contains(target);
      if (!inWsButton && !inWsPopover) {
        setShowWsMenu(false);
      }

      const inProjButton = projButtonRef.current?.contains(target);
      const inProjPopover = projPopoverRef.current?.contains(target);
      if (!inProjButton && !inProjPopover) {
        setShowProjMenu(false);
      }
    };
    if (showWsMenu || showProjMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showWsMenu, showProjMenu]);

  // Drag and Drop folder import listener
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        const folderPath = paths[0];
        
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const isDir = await invoke<boolean>('is_directory', { path: folderPath });
          if (!isDir) return; // Ignore files, only allow directories
        } catch (err) {
          console.warn("Failed to check if dropped path is directory:", err);
          return;
        }

        // Extract folder name from the absolute path
        const lastSlash = Math.max(folderPath.lastIndexOf("/"), folderPath.lastIndexOf("\\"));
        const folderName = lastSlash !== -1 ? folderPath.substring(lastSlash + 1) : folderPath;
        
        if (folderName) {
          setDroppedPath(folderPath);
          setDroppedName(folderName);
          setShowImportModal(true);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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

  const handleRenameProj = async () => {
    if (!renameProjName.trim() || !renameProjId) return;
    try {
      await renameProject(renameProjId, renameProjName);
      setRenameProjId(null);
      setRenameProjName("");
      setShowRenameProjModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameWs = async () => {
    if (!renameWsName.trim() || !renameWsId) return;
    try {
      await renameWorkspace(renameWsId, renameWsName);
      setRenameWsId(null);
      setRenameWsName("");
      setShowRenameWsModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);

  return (
    <div className="w-[48px] glass-sidebar glass-sidebar--collapsed flex flex-col items-center py-4 flex-shrink-0 z-40 select-none">
      
      {/* Top Zone: Workspace Switcher */}
      <div className="flex flex-col items-center gap-4 w-full relative" ref={wsMenuRef}>
        {/* Workspace Switcher Button */}
        <button
          ref={wsButtonRef}
          onClick={() => {
            if (!showWsMenu && wsButtonRef.current) {
              const borderRect = wsButtonRef.current.getBoundingClientRect();
              setWsMenuPos({ top: borderRect.top, left: borderRect.right + 8 });
            }
            setShowWsMenu(!showWsMenu);
          }}
          className={`w-9 h-9 rounded-xl activity-bar-btn flex items-center justify-center transition-all group relative ${
            showWsMenu 
              ? 'bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.2)]' 
              : 'text-[var(--text-secondary)] hover:bg-[var(--border-glass)] hover:text-[var(--text-primary)]'
          }`}
          title="Workspaces"
        >
          {activeWorkspaceId ? <FolderOpen size={20} /> : <Box size={20} />}
          
          {/* Active indicator dot */}
          {activeWorkspaceId && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--accent-primary)] border-2 border-[var(--bg-secondary)]" />
          )}
        </button>

        {/* Workspace Popover Menu — portal to escape sidebar stacking context */}
        {showWsMenu && createPortal(
          <div
            ref={wsPopoverRef}
            className="w-64 glass-panel-elevated shadow-xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-200"
            style={{ position: 'fixed', top: wsMenuPos.top, left: wsMenuPos.left, zIndex: 200 }}
          >
            <div className="px-3 py-2 border-b border-[var(--border-glass)] bg-[var(--bg-glass-light)]">
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase font-bold tracking-wider">Switch Workspace</span>
            </div>
            <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
              {workspaces.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] p-2 text-center">No workspaces found</div>
              ) : (
                workspaces.map(ws => (
                  <div
                    key={ws.id}
                    className={`flex items-center justify-between group px-2 py-2 rounded-md cursor-pointer transition-colors ${
                      ws.id === activeWorkspaceId 
                        ? 'bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)]' 
                        : 'hover:bg-[var(--border-glass)] text-[var(--text-secondary)]'
                    }`}
                    onClick={() => {
                      selectWorkspace(ws.id);
                      setShowWsMenu(false);
                    }}
                  >
                    <span className="text-xs truncate max-w-[150px] font-medium" title={ws.name}>{ws.name}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameWsId(ws.id);
                          setRenameWsName(ws.name);
                          setShowRenameWsModal(true);
                          setShowWsMenu(false);
                        }}
                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--border-glass)] rounded transition-colors cursor-pointer"
                        title="Rename Workspace"
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          showConfirmDialog(
                            "Delete Workspace",
                            `Are you sure you want to delete workspace "${ws.name}"? This will close all active terminal sessions.`,
                            () => {
                              deleteWorkspace(ws.id);
                              setShowWsMenu(false);
                            }
                          );
                        }}
                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-error)] hover:bg-[rgba(var(--accent-error-rgb),0.1)] rounded transition-colors cursor-pointer"
                        title="Delete Workspace"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-1.5 border-t border-[var(--border-glass)] bg-[var(--bg-glass-light)] space-y-1">
              <button
                onClick={() => {
                  setShowNewWsModal(true);
                  setShowWsMenu(false);
                }}
                className="w-full flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass)] py-1.5 rounded-md transition-colors"
              >
                <Plus size={14} /> Create Workspace
              </button>
              <button
                onClick={() => {
                  useOrchestratorStore.setState({ activeWorkspaceId: null });
                  useOrchestratorStore.getState().saveSnapshot();
                  setShowWsMenu(false);
                }}
                className="w-full flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass)] py-1.5 rounded-md transition-colors"
              >
                <LogOut size={14} /> Exit Workspace
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* Middle Zone: Tools & Toggles */}
      <div className="flex-1 w-full flex flex-col items-center gap-2 mt-4">
        <div className="w-5 h-px bg-[var(--border-glass)] mb-2" />
        
        {activeWorkspaceId && (
          <>
            <button
              ref={projButtonRef}
              onClick={() => {
                if (!showProjMenu && projButtonRef.current) {
                  const borderRect = projButtonRef.current.getBoundingClientRect();
                  setProjMenuPos({ top: borderRect.top, left: borderRect.right + 8 });
                }
                setShowProjMenu(!showProjMenu);
              }}
              className={`w-9 h-9 rounded-xl activity-bar-btn flex items-center justify-center transition-all group relative hover:scale-105 ${
                showProjMenu 
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.2)]' 
                  : 'text-[var(--text-secondary)] hover:bg-[var(--border-glass)] hover:text-[var(--text-primary)]'
              }`}
              title="Project Repositories"
            >
              <FolderPlus size={20} />
              <div className="absolute -top-1 -right-1 px-1 min-w-4 h-4 rounded-full bg-[rgba(var(--accent-primary-rgb),0.2)] border border-[rgba(var(--accent-primary-rgb),0.3)] flex items-center justify-center text-[8px] font-bold text-[var(--accent-primary)]">
                {activeProjects.length}
              </div>
            </button>

            <button
              onClick={() => setSidebarVisible(!isSidebarVisible)}
              className={`relative w-9 h-9 rounded-xl activity-bar-btn flex items-center justify-center transition-all hover:scale-105 ${
                isSidebarVisible
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.2)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--border-glass)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
              title={isSidebarVisible ? "Hide Agent Sidebar" : "Show Agent Sidebar"}
            >
              <Bot size={20} />
            </button>

            <button
              onClick={() => setTaskCenterVisible(!isTaskCenterVisible)}
              className={`relative w-9 h-9 rounded-xl activity-bar-btn flex items-center justify-center transition-all hover:scale-105 ${
                isTaskCenterVisible
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.2)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--border-glass)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
              title={isTaskCenterVisible ? "Hide Task Board" : "Show Task Board"}
            >
              <ClipboardList size={20} />
            </button>



            {/* Nexora Team Toggle */}
            <button
              onClick={() => setTeamPanelVisible(!isTeamPanelVisible)}
              className={`relative w-9 h-9 rounded-xl activity-bar-btn flex items-center justify-center transition-all hover:scale-105 ${
                isTeamPanelVisible
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.2)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--border-glass)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
              title={isTeamPanelVisible ? "Hide Nexora Team" : "Show Nexora Team Panel"}
            >
              <Users size={20} />
              {teamRunningCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent-primary)] text-[8px] font-bold text-[var(--text-inverse)] flex items-center justify-center animate-pulse">
                  {teamRunningCount}
                </span>
              )}
            </button>

            {/* Web Browser Panel Toggle */}
            <button
              onClick={() => useBrowserStore.getState().toggleBrowserPanel()}
              onMouseEnter={async () => {
                const isConnected = useBrowserStore.getState().isElectronConnected;
                if (!isConnected) {
                  console.log("[Predictive] Pre-warming Web Browser connection...");
                  invoke("launch_electron_browser", { url: "--background" }).catch(() => {});
                }
              }}
              className={`relative w-9 h-9 rounded-xl activity-bar-btn flex items-center justify-center transition-all hover:scale-105 ${
                useBrowserStore((s) => s.isBrowserPanelVisible)
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.2)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--border-glass)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
              title={useBrowserStore((s) => s.isBrowserPanelVisible) ? "Close Web Browser" : "Open Web Browser"}
            >
              <Globe size={20} />
            </button>

            {/* File Explorer Toggle */}
            <button
              onClick={() => useChangesetStore.getState().setReviewCenterOpen(!useChangesetStore.getState().isReviewCenterOpen)}
              className={`relative w-9 h-9 rounded-xl activity-bar-btn flex items-center justify-center transition-all hover:scale-105 ${
                useChangesetStore((s) => s.isReviewCenterOpen)
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.1)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.2)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--border-glass)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
              title={useChangesetStore((s) => s.isReviewCenterOpen) ? "Hide File Explorer" : "Show File Explorer"}
            >
              <GitPullRequest size={20} />
            </button>

          </>
        )}
      </div>

      {/* Bottom Zone: Settings */}
      <div className="flex flex-col items-center gap-2 w-full mt-auto">
        {activeWorkspaceId && (
          <button
            onClick={() => setSettingsModalOpen(true)}
            onMouseEnter={() => {
              console.log("[Predictive] Preloading settings component configurations...");
            }}
            className="w-9 h-9 rounded-xl activity-bar-btn flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--border-glass)] hover:text-[var(--text-primary)] transition-all"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        )}
      </div>

      {/* Workspace Modal — rendered via portal to escape sidebar stacking context */}
      {showNewWsModal && createPortal(
        <div className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-md z-[200] flex items-center justify-center">
          <div className="glass-modal p-6 w-96 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <FolderPlus size={16} className="text-[var(--accent-primary)]" />
              Create Workspace Session
            </h3>
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase">Workspace Name</label>
              <input
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="e.g. My Backend Team"
                className="glass-input"
              />
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setShowNewWsModal(false)}
                className="glass-button glass-button--ghost text-[var(--text-secondary)] text-xs py-1.5 px-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWs}
                disabled={!wsName.trim()}
                className="glass-button glass-button--accent font-semibold text-xs py-1.5 px-4 rounded transition-colors"
              >
                Select Root Folder
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Project Modal — rendered via portal to escape sidebar stacking context */}
      {showNewProjModal && createPortal(
        <div className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-md z-[200] flex items-center justify-center">
          <div className="glass-modal p-6 w-96 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <FolderPlus size={16} className="text-[var(--accent-primary)]" />
              Add Project Repository
            </h3>
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase">Project Name</label>
              <input
                type="text"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                placeholder="e.g. frontend-core"
                className="glass-input"
              />
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => setShowNewProjModal(false)}
                className="glass-button glass-button--ghost text-[var(--text-secondary)] text-xs py-1.5 px-4 rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProj}
                disabled={!projName.trim()}
                className="glass-button glass-button--accent font-semibold text-xs py-1.5 px-4 rounded transition-colors cursor-pointer"
              >
                Select Folder Path
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Projects Switcher Popover Menu */}
      {showProjMenu && createPortal(
        <div
          ref={projPopoverRef}
          className="w-72 glass-panel-elevated shadow-xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-200"
          style={{ position: 'fixed', top: projMenuPos.top, left: projMenuPos.left, zIndex: 200 }}
        >
          <div className="px-3 py-2 border-b border-[var(--border-glass)] bg-[var(--bg-glass-light)]">
            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase font-bold tracking-wider">Manage Projects</span>
          </div>
          
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-1 scrollbar-none">
            {activeProjects.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] p-3 text-center italic">No projects found. Add one below!</div>
            ) : (
              activeProjects.map(proj => (
                <div
                  key={proj.id}
                  className="flex flex-col group p-2 rounded-md hover:bg-[var(--border-glass)] text-[var(--text-secondary)] transition-colors border border-transparent hover:border-[var(--border-glass-hover)] relative"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate font-semibold text-[var(--text-primary)]" title={proj.name}>{proj.name}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameProjId(proj.id);
                          setRenameProjName(proj.name);
                          setShowRenameProjModal(true);
                          setShowProjMenu(false);
                        }}
                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--border-glass)] rounded transition-colors cursor-pointer"
                        title="Rename Project"
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          showConfirmDialog(
                            "Delete Project Repository",
                            `Are you sure you want to delete project "${proj.name}"? This will close all active terminal sessions running in this project.`,
                            () => {
                              deleteProject(proj.id);
                              setShowProjMenu(false);
                            }
                          );
                        }}
                        className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-error)] hover:bg-[rgba(var(--accent-error-rgb),0.1)] rounded transition-colors cursor-pointer"
                        title="Delete Project"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-[var(--text-muted)] truncate mt-0.5" title={proj.path}>
                    {proj.path}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="p-1.5 border-t border-[var(--border-glass)] bg-[var(--bg-glass-light)]">
            <button
              onClick={() => {
                setShowNewProjModal(true);
                setShowProjMenu(false);
              }}
              className="w-full flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass)] py-1.5 rounded-md transition-colors cursor-pointer"
            >
              <Plus size={14} /> Add Project Repository
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Rename Project Modal */}
      {showRenameProjModal && createPortal(
        <div className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-md z-[200] flex items-center justify-center">
          <div className="glass-modal p-6 w-96 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Edit2 size={16} className="text-[var(--accent-primary)]" />
              Rename Project Repository
            </h3>
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase">New Project Name</label>
              <input
                type="text"
                value={renameProjName}
                onChange={(e) => setRenameProjName(e.target.value)}
                placeholder="e.g. frontend-core"
                className="glass-input"
              />
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => {
                  setShowRenameProjModal(false);
                  setRenameProjId(null);
                  setRenameProjName("");
                }}
                className="glass-button glass-button--ghost text-[var(--text-secondary)] text-xs py-1.5 px-4 rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameProj}
                disabled={!renameProjName.trim()}
                className="glass-button glass-button--accent font-semibold text-xs py-1.5 px-4 rounded transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Rename Workspace Modal */}
      {showRenameWsModal && createPortal(
        <div className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-md z-[200] flex items-center justify-center">
          <div className="glass-modal p-6 w-96 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Edit2 size={16} className="text-[var(--accent-primary)]" />
              Rename Workspace Session
            </h3>
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-[var(--text-muted)] uppercase">New Workspace Name</label>
              <input
                type="text"
                value={renameWsName}
                onChange={(e) => setRenameWsName(e.target.value)}
                placeholder="e.g. My Workspace"
                className="glass-input"
              />
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => {
                  setShowRenameWsModal(false);
                  setRenameWsId(null);
                  setRenameWsName("");
                }}
                className="glass-button glass-button--ghost text-[var(--text-secondary)] text-xs py-1.5 px-4 rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameWs}
                disabled={!renameWsName.trim()}
                className="glass-button glass-button--accent font-semibold text-xs py-1.5 px-4 rounded transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Drag & Drop Import Modal */}
      {showImportModal && createPortal(
        <div className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-md z-[200] flex items-center justify-center font-mono animate-in fade-in duration-200">
          <div className="glass-modal glass-noise-base p-6 w-[420px] shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <FolderPlus size={16} className="text-[var(--accent-primary)]" />
              Import Dropped Folder
            </h3>
            
            <div className="text-[10px] text-[var(--text-muted)] space-y-1">
              <div>
                <span className="font-bold uppercase tracking-wider text-[var(--text-muted)]">Path:</span>{' '}
                <span className="font-mono bg-[var(--border-glass)] px-1 py-0.5 rounded break-all select-all text-[var(--text-secondary)]">{droppedPath}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase font-bold tracking-wider">Import Name</label>
              <input
                type="text"
                value={droppedName}
                onChange={(e) => setDroppedName(e.target.value)}
                placeholder="e.g. my-awesome-project"
                className="glass-input text-xs py-1.5 px-3"
              />
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-[var(--border-glass)] select-none">
              <button
                onClick={() => setShowImportModal(false)}
                className="bg-transparent hover:bg-[var(--border-glass)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] font-bold text-[10px] uppercase py-1.5 px-4 rounded transition-all cursor-pointer"
              >
                Cancel
              </button>
              
              <button
                onClick={async () => {
                  if (!droppedName.trim() || !droppedPath) return;
                  try {
                    await createWorkspace(droppedName, droppedPath);
                    setShowImportModal(false);
                  } catch (err) {
                    console.error("Failed to import workspace from drop:", err);
                  }
                }}
                disabled={!droppedName.trim()}
                className="bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--text-inverse)] font-bold text-[10px] uppercase py-1.5 px-4 rounded shadow transition-all cursor-pointer disabled:opacity-50"
              >
                Import Workspace
              </button>

              {activeWorkspaceId && (
                <button
                  onClick={async () => {
                    if (!droppedName.trim() || !droppedPath) return;
                    try {
                      await addProject(droppedName, droppedPath);
                      setShowImportModal(false);
                    } catch (err) {
                      console.error("Failed to import project from drop:", err);
                    }
                  }}
                  disabled={!droppedName.trim()}
                  className="bg-[rgba(139,92,246,0.8)] hover:bg-[rgba(139,92,246,1)] text-[var(--text-primary)] font-bold text-[10px] uppercase py-1.5 px-4 rounded shadow transition-all cursor-pointer border border-[rgba(139,92,246,0.2)] disabled:opacity-50"
                >
                  Add as Project
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
