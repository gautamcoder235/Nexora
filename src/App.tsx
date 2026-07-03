import React, { useEffect, useState, useRef } from "react";
import { FolderOpen, BarChart2, Cpu, HardDrive, Layers, Trash2, Plus, Save, Pin, PinOff, LayoutGrid, FileText, ChevronDown, Keyboard, SidebarClose, Edit2, ChevronRight, Power, Settings, Import, Sparkles, Folder, Search, X, Terminal, GitBranch } from "lucide-react";
import { ActivityBar } from "./components/ActivityBar";
import { TitleBar } from "./components/TitleBar";
import { AgentGrid } from "./components/AgentGrid";
import { ActivityFeed } from "./components/ActivityFeed";
import { TaskCenter } from "./components/TaskCenter";
import { ProjectMemory } from "./components/ProjectMemory";
const TerminalWorkspace = React.lazy(() => import("./components/TerminalWorkspace").then(m => ({ default: m.TerminalWorkspace })));

const TeamDashboard = React.lazy(() => import("./components/NexoraTeam/TeamDashboard").then(m => ({ default: m.TeamDashboard })));
const AgentReviewCenter = React.lazy(() => import("./components/ExecutionReview/AgentReviewCenter").then(m => ({ default: m.AgentReviewCenter })));
import { AgentInspector } from "./components/AgentInspector";
import { useOrchestratorStore } from "./stores/orchestratorStore";

import { useTeamStore } from "./stores/teamStore";
import { useBrowserStore } from "./stores/browserStore";
import { useChangesetStore } from "./stores/changesetStore";
import { BrowserPanel } from "./components/browser/BrowserPanel";
import { PerformanceOverlay } from "./components/PerformanceOverlay";
import { AnalyticsService } from "./services/analytics";
import { invoke } from "@tauri-apps/api/core";
import { ContextMenu } from "./components/ContextMenu";
import { CustomDialog } from "./components/CustomDialog";
import { SettingsModal } from "./components/SettingsModal";
import { EventBus } from "./core/events";
import { DEFAULT_APP_SETTINGS } from "./types";
import { useShallow } from 'zustand/react/shallow';

// Localized error boundary for settings modal — prevents settings crash from killing entire UI
class SettingsModalBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e?.toString() || 'Unknown error' };
  }
  componentDidCatch(e: Error, info: React.ErrorInfo) {
    console.error('[SettingsModal crash]', e, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: '32px', fontFamily: 'monospace', color: '#f4f4f5', gap: '16px'
        }}>
          <div style={{ color: '#ef4444', fontSize: '16px', fontWeight: 700 }}>Settings Error</div>
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '16px', maxWidth: '560px', fontSize: '11px', color: '#fca5a5', whiteSpace: 'pre-wrap' }}>
            {this.state.error}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: '' }); useOrchestratorStore.getState().setSettingsModalOpen(false); }}
            style={{ padding: '8px 20px', background: 'rgba(var(--accent-primary-rgb, 245, 158, 11), 0.15)', border: '1px solid rgba(var(--accent-primary-rgb, 245, 158, 11), 0.35)', borderRadius: '6px', color: 'var(--accent-primary, #f59e0b)', fontSize: '12px', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setSplashFade(true);
    }, 3800);

    const finishTimer = setTimeout(() => {
      setShowSplash(false);
    }, 4300);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, []);

  const initStore = useOrchestratorStore(s => s.initStore);
  const showConfirmDialog = useOrchestratorStore(s => s.showConfirmDialog);
  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const workspaces = useOrchestratorStore(useShallow(s => s.workspaces));
  const settings = useOrchestratorStore(useShallow(s => s.settings));
  const settingsShortcut = settings?.shortcuts?.openSettings || "Ctrl+,";

  const [gitBranch, setGitBranch] = useState<string>("");
  const activeWs = workspaces.find(w => w.id === activeWorkspaceId);

  useEffect(() => {
    if (!activeWs?.rootPath) {
      setGitBranch("");
      return;
    }
    let isMounted = true;
    const fetchGitBranch = async () => {
      try {
        const branch = await invoke<string>("get_git_branch", { workspacePath: activeWs.rootPath });
        if (isMounted) {
          setGitBranch(branch);
        }
      } catch (err) {
        if (isMounted) {
          setGitBranch("");
        }
      }
    };
    fetchGitBranch();
    const interval = setInterval(fetchGitBranch, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeWs?.rootPath]);

  const activityBarWidth = settings?.appearance?.workspace?.showActivityBar !== false ? 48 : 0;
  const paneSpacing = settings?.appearance?.workspace?.paneSpacing ?? 8;
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
    reviewPanelWidth, 
    setReviewPanelWidth
  } = useChangesetStore();

  // Enforce Max 8 Terminals Docking Rule
  useEffect(() => {
    if (terminals.length > 8) {
      if (isAgentPanelPinned) setAgentPanelPinned(false);
      if (isTaskPanelPinned) setTaskPanelPinned(false);
    }
  }, [terminals.length, isAgentPanelPinned, isTaskPanelPinned, setAgentPanelPinned, setTaskPanelPinned]);

  // Handle Glassmorphism accessibility setting and resize-performance class bindings
  useEffect(() => {
    if (settings?.appearance?.accessibility?.disableGlassmorphism) {
      document.body.classList.add('disable-glassmorphism');
    } else {
      document.body.classList.remove('disable-glassmorphism');
    }
  }, [settings?.appearance?.accessibility?.disableGlassmorphism]);

  useEffect(() => {
    let resizeTimer: any = null;
    const handleResize = () => {
      document.body.classList.add('resizing');
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        document.body.classList.remove('resizing');
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, []);

  const [initName, setInitName] = useState("");
  const [showRenameWsModal, setShowRenameWsModal] = useState(false);
  const [renameWsId, setRenameWsId] = useState<string | null>(null);
  const [renameWsName, setRenameWsName] = useState("");

  const workspaceInputRef = useRef<HTMLInputElement>(null);
  const [showBrowseAllModal, setShowBrowseAllModal] = useState(false);
  const [browseSearchQuery, setBrowseSearchQuery] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");

  const formatWorkspaceTime = (timestamp: number | undefined): string => {
    if (!timestamp) return "Today";
    const now = new Date();
    const date = new Date(timestamp);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = today.getTime() - targetDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 30) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const formatLastOpenedTime = (timestamp: number | undefined): string => {
    if (!timestamp) return "Last opened recently";
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Last opened ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Last opened ${diffHours}h ago`;
    return `Last opened ${formatWorkspaceTime(timestamp).toLowerCase()}`;
  };


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
  const [isTeamDragging, setIsTeamDragging] = useState(false);
  const [isBrowserDragging, setIsBrowserDragging] = useState(false);
  const [isReviewDragging, setIsReviewDragging] = useState(false);

  const { isTeamPanelVisible, teamPanelHeight, setTeamPanelHeight } = useTeamStore();
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

  // Electron browser connection status poller
  useEffect(() => {
    let isMounted = true;
    let timeoutId: any = null;
    
    const checkConnection = async () => {
      let isConnected = false;
      try {
        const connected = await invoke<boolean>("check_electron_ping");
        isConnected = connected;
        if (isMounted) {
          const current = useBrowserStore.getState().isElectronConnected;
          if (connected !== current) {
            useBrowserStore.getState().setElectronConnected(connected);
          }
        }
      } catch (err) {
        if (isMounted) {
          const current = useBrowserStore.getState().isElectronConnected;
          if (current) {
            useBrowserStore.getState().setElectronConnected(false);
          }
        }
      }
      
      if (isMounted) {
        // Poll faster (1s) when connected to catch external window close events quickly.
        // Poll slower (5s) when disconnected to reduce CPU/IPC overhead.
        const nextDelay = isConnected ? 1000 : 5000;
        timeoutId = setTimeout(checkConnection, nextDelay);
      }
    };

    checkConnection();
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) return;

    const handleLandingKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N -> Focus workspace name input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        workspaceInputRef.current?.focus();
      }
      // Ctrl+D / Ctrl+O -> Open Browse All Modal
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'o')) {
        e.preventDefault();
        setShowBrowseAllModal(true);
      }
      // Ctrl+I -> Open Import Profile Modal
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setShowImportModal(true);
      }
      // Enter -> Enter recent workspace
      if (e.key === 'Enter') {
        const activeEl = document.activeElement;
        const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (!isTyping) {
          const sorted = [...workspaces].sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
          const latest = sorted[0];
          if (latest) {
            e.preventDefault();
            useOrchestratorStore.getState().selectWorkspace(latest.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleLandingKeyDown);
    return () => window.removeEventListener('keydown', handleLandingKeyDown);
  }, [activeWorkspaceId, workspaces]);

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
        const isLeftSidebar = settings?.appearance?.workspace?.sidebarPosition !== 'right';
        const newWidth = isLeftSidebar 
          ? Math.max(420, Math.min(e.clientX - activityBarWidth, maxWidth))
          : Math.max(420, Math.min(window.innerWidth - e.clientX, maxWidth));
        document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
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
        document.documentElement.style.setProperty('--top-panel-height', `${newHeight}px`);
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
    if (!isTeamDragging) return;

    let frameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        setTeamPanelHeight(Math.max(200, Math.min(window.innerHeight - e.clientY - 48, window.innerHeight - 100)));
      });
    };
    
    const handleMouseUp = () => {
      if (frameId) cancelAnimationFrame(frameId);
      setIsTeamDragging(false);
      useOrchestratorStore.getState().saveSnapshot();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isTeamDragging, setTeamPanelHeight]);

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
        const isLeftSidebar = settings?.appearance?.workspace?.sidebarPosition !== 'right';
        const leftBoundary = activityBarWidth + (isSidebarVisible && isAgentPanelPinned && isLeftSidebar ? sidebarWidth : 0) + 300;
        const rightEdge = window.innerWidth - (isSidebarVisible && isAgentPanelPinned && !isLeftSidebar ? sidebarWidth : 0);
        const rightBoundary = Math.min(
          rightEdge - 300,
          rightEdge - 320 - 8
        );
        const currentX = Math.max(leftBoundary, Math.min(e.clientX, rightBoundary));
        const newWidth = Math.max(320, rightEdge - currentX - 8);
        document.documentElement.style.setProperty('--browser-panel-width', `${newWidth}px`);
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
  }, [isBrowserDragging, isSidebarVisible, sidebarWidth, setBrowserPanelWidth, isReviewCenterOpen]);

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
        const isLeftSidebar = settings?.appearance?.workspace?.sidebarPosition !== 'right';
        const leftBoundary = 
          activityBarWidth + 
          (isSidebarVisible && isAgentPanelPinned && isLeftSidebar ? sidebarWidth : 0) + 
          (isBrowserPanelVisible && isBrowserPanelPinned ? browserPanelWidth : 0) + 
          300;
        
        const rightEdge = window.innerWidth - (isSidebarVisible && isAgentPanelPinned && !isLeftSidebar ? sidebarWidth : 0);
        const rightBoundary = rightEdge - 300;
        const currentX = Math.max(leftBoundary, Math.min(e.clientX, rightBoundary));
        const newWidth = rightEdge - currentX - 8;
        document.documentElement.style.setProperty('--review-panel-width', `${newWidth}px`);
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
        if (!shortcutString || shortcutString.toLowerCase() === 'none') return false;
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
        return e.key.toLowerCase() === key || (e.code || '').toLowerCase() === 'key' + key;
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

  // Native desktop app transformations and event blockers
  useEffect(() => {
    // 1. Context Menu blocker (Disable standard Chromium right-click menu)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', handleContextMenu);

    // 2. Drag & Drop window blocker (prevent browser navigation on dropping local files)
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    // 3. Mouse Wheel zoom blocker (prevent Ctrl + mousewheel zooming)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });

    // 4. Middle click auto-scroll blocker
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) { // Middle click
        const target = e.target as HTMLElement;
        // Don't block middle click scroll inside terminal or custom scroll areas if they rely on it
        if (!target.closest('.xterm') && !target.closest('.terminal-pane')) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('mousedown', handleMouseDown);

    // 5. Native Browser Shortcut blocker
    const handleBrowserKeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      
      const key = e.key.toLowerCase();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // Block F5, Ctrl+R, Cmd+R, Ctrl+Shift+R (Reloads)
      if (key === 'f5' || (ctrlOrCmd && key === 'r')) {
        e.preventDefault();
      }

      // Block Ctrl+P (Print)
      if (ctrlOrCmd && key === 'p') {
        e.preventDefault();
      }

      // Block Ctrl+S (Save Page)
      if (ctrlOrCmd && key === 's' && !isInput) {
        e.preventDefault();
      }

      // Block Ctrl+U (View Source)
      if (ctrlOrCmd && key === 'u') {
        e.preventDefault();
      }

      // Block Ctrl+H (History)
      if (ctrlOrCmd && key === 'h') {
        e.preventDefault();
      }

      // Block Ctrl+D (Bookmark)
      if (ctrlOrCmd && key === 'd') {
        e.preventDefault();
      }

      // Block Ctrl+Plus, Ctrl+Minus, Ctrl+=, Ctrl+0 (UI Zooming)
      if (ctrlOrCmd && (key === '+' || key === '-' || key === '=' || key === '0')) {
        e.preventDefault();
      }

      // Block Backspace navigation outside of input fields
      if (key === 'backspace' && !isInput) {
        e.preventDefault();
      }

      // Block DevTools shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C) strictly in production mode
      const isDev = import.meta.env.DEV;
      if (!isDev) {
        if (key === 'f12' || (ctrlOrCmd && e.shiftKey && (key === 'i' || key === 'j' || key === 'c'))) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleBrowserKeys);

    // 6. Global Input spellcheck and autocomplete overrides
    const handleInputFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        // Enforce native clean developer styling globally
        target.setAttribute('spellcheck', 'false');
        if (!target.hasAttribute('autocomplete')) {
          target.setAttribute('autocomplete', 'off');
        }
      }
    };
    window.addEventListener('focusin', handleInputFocus);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleBrowserKeys);
      window.removeEventListener('focusin', handleInputFocus);
    };
  }, []);

  useEffect(() => {
    // 1. Initialize local telemetry analytics listeners
    AnalyticsService.init();

    // 2. Load configurations database & active workspace snap
    initStore();

    // 3. Start execution events polling globally
    const unsubscribeSwarm = useTeamStore.getState().startExecutionPolling();
    const unsubscribeTeam = useTeamStore.getState().initializeListeners();

    return () => {
      if (unsubscribeSwarm) {
        unsubscribeSwarm();
      }
      if (unsubscribeTeam) {
        unsubscribeTeam();
      }
    };
  }, [initStore]);

  React.useLayoutEffect(() => {
    if (!isSidebarDragging) document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    if (!isHeightDragging) document.documentElement.style.setProperty('--top-panel-height', `${topPanelHeight}px`);
    if (!isBrowserDragging) document.documentElement.style.setProperty('--browser-panel-width', `${browserPanelWidth}px`);
    if (!isReviewDragging) document.documentElement.style.setProperty('--review-panel-width', `${reviewPanelWidth}px`);
    document.documentElement.style.setProperty('--pane-spacing', `${paneSpacing}px`);
  }, [activeWorkspaceId, sidebarWidth, topPanelHeight, browserPanelWidth, reviewPanelWidth, paneSpacing, isSidebarDragging, isHeightDragging, isBrowserDragging, isReviewDragging, isTaskCenterVisible, isTaskPanelPinned]);

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
  if (showSplash) {
    return (
      <div 
        className={`h-screen w-screen bg-[#0a0d16] flex flex-col justify-center items-center font-sans overflow-hidden select-none relative transition-opacity duration-500 ease-out z-[9999] ${
          splashFade ? "opacity-0" : "opacity-100"
        }`}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes splashLogoBounce {
            0% { transform: scale(0.3); opacity: 0; filter: blur(10px); }
            70% { transform: scale(1.1); opacity: 0.9; filter: blur(0px); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes splashLogoGlow {
            0%, 100% { filter: drop-shadow(0 0 10px rgba(37, 99, 235, 0.35)) drop-shadow(0 8px 24px rgba(10, 13, 22, 0.45)); }
            50% { filter: drop-shadow(0 0 20px rgba(37, 99, 235, 0.65)) drop-shadow(0 8px 24px rgba(10, 13, 22, 0.45)); }
          }
          @keyframes splashProgress {
            0% { width: 0%; }
            40% { width: 45%; }
            70% { width: 85%; }
            100% { width: 100%; }
          }
          @keyframes splashTextTracking {
            0% { letter-spacing: -0.15em; opacity: 0; filter: blur(4px); transform: translateY(-4px); }
            100% { letter-spacing: 0.25em; opacity: 1; filter: blur(0px); transform: translateY(0); }
          }
          @keyframes splashSubtextFade {
            0% { opacity: 0; filter: blur(2px); transform: translateY(12px); }
            100% { opacity: 0.7; filter: blur(0px); transform: translateY(0); }
          }
          @keyframes splashOrbit {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes splashParticleFloat {
            0%, 100% { transform: translateY(0px) translateX(0px); }
            50% { transform: translateY(-12px) translateX(8px); }
          }
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          
          .splash-logo-container {
            animation: splashLogoBounce 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          }
          .splash-logo-card {
            animation: splashLogoGlow 3s ease-in-out infinite;
          }
          .splash-text-brand {
            animation: splashTextTracking 1.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both;
          }
          .splash-subtext {
            animation: splashSubtextFade 1.5s ease-out 1.2s both;
          }
          .splash-progress-fill {
            background-color: #ffffff !important;
            box-shadow: 0 0 12px rgba(255, 255, 255, 0.95), 0 0 4px rgba(255, 255, 255, 0.5);
            animation: splashProgress 3.8s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .splash-orbiting-ring {
            animation: splashOrbit 16s linear infinite;
          }
          .splash-particle-float {
            animation: splashParticleFloat 9s ease-in-out infinite;
          }
        `}} />

        {/* Ambient Glowing Background (Refined Spacing) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-5%] left-[-5%] w-[65vw] h-[65vw] rounded-full bg-gradient-to-tr from-blue-600/12 to-indigo-600/8 opacity-40 blur-[130px]" />
          <div className="absolute bottom-[-15%] right-[-15%] w-[65vw] h-[65vw] rounded-full bg-gradient-to-br from-cyan-600/12 to-blue-600/8 opacity-40 blur-[130px]" />
          
          {/* Subtle Grid Overlay */}
          <div 
            className="absolute inset-0 opacity-[0.012]" 
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: '32px 32px',
              maskImage: 'radial-gradient(circle at center, black 10%, transparent 85%)',
              WebkitMaskImage: 'radial-gradient(circle at center, black 10%, transparent 85%)',
            }}
          />
          
          {/* Floating splash particles */}
          <div className="absolute top-[25%] left-[30%] w-2 h-2 rounded-full bg-cyan-400/25 blur-[1px] splash-particle-float" style={{ animationDelay: '0s', animationDuration: '8s' }} />
          <div className="absolute top-[60%] right-[35%] w-1.5 h-1.5 rounded-full bg-indigo-400/25 blur-[1px] splash-particle-float" style={{ animationDelay: '1s', animationDuration: '9s' }} />
          <div className="absolute bottom-[20%] left-[45%] w-1.5 h-1.5 rounded-full bg-blue-400/25 blur-[1px] splash-particle-float" style={{ animationDelay: '2s', animationDuration: '10s' }} />
        </div>

        {/* Splash Content Container */}
        <div className="flex flex-col items-center justify-center z-10 space-y-10 -translate-y-12">
          
          {/* Outer Rotating Dotted Rings (CENTERED) */}
          <div className="relative w-48 h-48">
            <div className="absolute left-0 top-0 w-full h-full rounded-full border border-dashed border-blue-500/10 splash-orbiting-ring" />
            <div className="absolute left-[12px] top-[12px] w-[168px] h-[168px] rounded-full border border-dashed border-cyan-500/5 splash-orbiting-ring" style={{ animationDirection: 'reverse', animationDuration: '24s' }} />
            
            <div className="splash-logo-container absolute left-12 top-12 w-24 h-24">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-700 opacity-45 blur-xl" />
              
              <img 
                src="/logo.png" 
                className="splash-logo-card w-full h-full absolute inset-0 z-10 object-contain" 
                alt="Nexora Logo" 
              />
            </div>
          </div>

          {/* Brand Name & Quote Stack */}
          <div className="flex flex-col items-center justify-center space-y-3.5">
            <h1 className="splash-text-brand text-5xl md:text-6xl font-black tracking-[0.25em] text-white uppercase select-none filter drop-shadow-[0_0_20px_rgba(37,99,235,0.25)] pl-[0.25em]">
              Nexora
            </h1>

            <p className="splash-subtext text-xs md:text-sm font-bold tracking-[0.45em] text-blue-400/60 uppercase pl-[0.45em]">
              Orchestrating the Future of Software
            </p>
          </div>

          {/* Progress loader bar */}
          <div className="flex flex-col items-center justify-center space-y-6 pt-4">
            <div className="w-60 h-[4px] bg-white/5 rounded-full overflow-hidden relative shadow-inner">
              <div className="splash-progress-fill h-full rounded-full" />
            </div>

            {/* Initializing label */}
            <span className="splash-subtext text-[11px] font-mono tracking-[0.2em] text-blue-400/50 uppercase">
              Initializing System...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // If no workspace is active/defined, prompt to create a Workspace Session
  if (!activeWorkspaceId) {
    // Sort workspaces by lastOpened (descending)
    const sortedWorkspaces = [...workspaces].sort((a, b) => {
      return (b.lastOpened || 0) - (a.lastOpened || 0);
    });

    const latestWorkspace = sortedWorkspaces[0];
    const recentWorkspaces = sortedWorkspaces.slice(1, 4); // next 3 workspaces

    const handleExitApp = async () => {
      try {
        await invoke("exit_app");
      } catch (e) {
        console.warn("Tauri close command failed, falling back to window.close():", e);
        window.close();
      }
    };

    return (
      <div className="relative h-screen w-screen bg-bg-primary overflow-hidden text-zinc-100">
        <TitleBar />
        <div className="h-full w-full text-zinc-100 flex flex-col justify-between items-center font-sans pt-[42px] px-8 pb-8 select-none workspace-setup-bg overflow-hidden">
        {/* Glow ambient background circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div 
            className="absolute top-[-15%] left-[-15%] w-[65vw] h-[65vw] rounded-full opacity-45 blur-[120px] animate-pulse" 
            style={{ 
              animationDuration: '9s',
              background: 'radial-gradient(circle, rgba(var(--accent-primary-rgb, 56, 189, 248), 0.22) 0%, transparent 70%)'
            }}
          ></div>
          <div 
            className="absolute bottom-[-15%] right-[-15%] w-[65vw] h-[65vw] rounded-full opacity-45 blur-[120px] animate-pulse" 
            style={{ 
              animationDuration: '13s',
              background: 'radial-gradient(circle, rgba(var(--accent-secondary-rgb, 37, 99, 235), 0.18) 0%, transparent 70%)'
            }}
          ></div>
          
          {/* Abstract Grid Overlay */}
          <div 
            className="absolute inset-0 opacity-[0.03]" 
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
              `,
              backgroundSize: '32px 32px',
              maskImage: 'radial-gradient(circle at center, black, transparent 85%)',
              WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 85%)',
            }}
          ></div>

          {/* Orbiting / Floating Particles */}
          <div className="absolute top-[25%] left-[20%] w-2.5 h-2.5 rounded-full blur-[1px] animate-float" style={{ animationDelay: '0s', animationDuration: '8s', backgroundColor: 'rgba(var(--accent-primary-rgb, 56, 189, 248), 0.35)' }}></div>
          <div className="absolute top-[65%] left-[15%] w-3.5 h-3.5 rounded-full blur-[1px] animate-float" style={{ animationDelay: '2s', animationDuration: '12s', backgroundColor: 'rgba(var(--accent-secondary-rgb, 37, 99, 235), 0.25)' }}></div>
          <div className="absolute top-[35%] right-[25%] w-2 h-2 rounded-full blur-[1px] animate-float" style={{ animationDelay: '4s', animationDuration: '10s', backgroundColor: 'rgba(var(--accent-primary-rgb, 56, 189, 248), 0.35)' }}></div>
          <div className="absolute top-[75%] right-[20%] w-2.5 h-2.5 rounded-full blur-[1px] animate-float" style={{ animationDelay: '1s', animationDuration: '14s', backgroundColor: 'rgba(var(--accent-secondary-rgb, 37, 99, 235), 0.25)' }}></div>
        </div>

        {/* Top Spacer / Flex item */}
        <div className="flex-1 flex flex-col justify-center items-center w-full max-w-4xl z-10 relative">
          
          {/* Header section */}
          <div className="text-center space-y-4 mb-12 select-none">
            {/* Logo brand with theme glow */}
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center group mb-4">
              <div 
                className="absolute inset-0 rounded-2xl opacity-35 blur-lg group-hover:opacity-55 transition-opacity duration-500 animate-pulse"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary, #38bdf8), var(--accent-secondary, #2563eb))'
                }}
              ></div>
              <div 
                className="relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300"
                style={{
                  background: 'linear-gradient(135deg, var(--bg-secondary, #080a10), var(--bg-tertiary, #040406))',
                  border: '1px solid rgba(var(--accent-primary-rgb, 56, 189, 248), 0.25)',
                }}
              >
                <svg viewBox="0 0 100 100" className="w-9 h-9 relative z-10">
                  <defs>
                    <linearGradient id="headerBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--accent-primary, #38bdf8)" />
                      <stop offset="100%" stopColor="var(--accent-secondary, #2563eb)" />
                    </linearGradient>
                  </defs>
                  <path d="M49,23 L44,23 C38.5,23 34,27.5 34,33 L34,42 C34,46.4 26,46.4 26,50 C26,53.6 34,53.6 34,58 L34,67 C34,72.5 38.5,77 44,77 L49,77" fill="none" stroke="url(#headerBlueGrad)" strokeWidth="12" strokeLinecap="butt" strokeLinejoin="round" />
                  <path d="M80,29 L50,39 L56,45 L42,59 L50,67 L64,53 L70,59 Z" fill="url(#headerBlueGrad)" />
                </svg>
              </div>
            </div>

            <div className="space-y-3">
              <h1 
                className="text-5xl md:text-6xl font-black tracking-tight text-white select-none filter"
                style={{
                  backgroundImage: 'linear-gradient(to right, #ffffff, #e4e4e7, var(--accent-primary, #38bdf8))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 0 30px rgba(var(--accent-secondary-rgb, 37, 99, 235), 0.35))'
                }}
              >
                Nexora
              </h1>
              <div className="flex justify-center">
                <span 
                  className="px-3.5 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase font-mono select-none"
                  style={{
                    backgroundColor: 'rgba(var(--accent-primary-rgb, 56, 189, 248), 0.1)',
                    color: 'var(--accent-primary, #38bdf8)',
                    border: '1px solid rgba(var(--accent-primary-rgb, 56, 189, 248), 0.25)',
                    boxShadow: '0 0 15px rgba(var(--accent-secondary-rgb, 37, 99, 235), 0.12)'
                  }}
                >
                  Nexora Team
                </span>
              </div>
            </div>
          </div>

          {/* Middle Layout */}          {workspaces.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full max-w-4xl relative items-stretch">
              
              {/* Vertical line with OR badge */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/[0.04] -translate-x-1/2 hidden md:block"></div>
              <div 
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border flex items-center justify-center text-[10px] text-zinc-500 font-bold uppercase font-mono hidden md:flex select-none"
                style={{
                  backgroundColor: 'var(--bg-primary, #000000)',
                  borderColor: 'rgba(255, 255, 255, 0.08)'
                }}
              >
                OR
              </div>

              {/* Left Column: Resume Workspace */}
              <div className="flex flex-col text-left">
                <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-widest mb-3 pl-1">
                  Resume Workspace
                </div>
                <div 
                  onClick={() => useOrchestratorStore.getState().selectWorkspace(latestWorkspace.id)}
                  className="workspace-setup-card-interactive group flex items-center justify-between p-6 cursor-pointer h-[130px] select-none"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="workspace-icon-wrapper w-12 h-12 rounded-xl flex items-center justify-center text-blue-500 flex-shrink-0">
                      <FolderOpen size={20} style={{ color: 'var(--accent-primary, #38bdf8)' }} />
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="workspace-title text-sm font-bold truncate">{latestWorkspace.name}</span>
                      <span className="text-[10.5px] font-mono text-zinc-400 truncate mt-1" title={latestWorkspace.rootPath}>{latestWorkspace.rootPath}</span>
                      <span className="text-[10px] text-zinc-500 mt-2">{formatLastOpenedTime(latestWorkspace.lastOpened)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <span className="workspace-enter-badge text-[9px] font-mono px-1.5 py-0.5 rounded">Enter</span>
                    <ChevronRight size={18} className="workspace-arrow transition-all" />
                  </div>
                </div>
              </div>

              {/* Right Column: Create New Session */}
              <div className="flex flex-col text-left">
                <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-widest mb-3 pl-1">
                  Create New Session
                </div>
                <div className="workspace-setup-card flex flex-col justify-between p-6 h-[130px] space-y-3">
                  <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 group-focus-within/input:text-[var(--accent-primary)] transition-colors duration-300">
                      <Folder size={14} />
                    </div>
                    <input
                      ref={workspaceInputRef}
                      type="text"
                      value={initName}
                      onChange={(e) => setInitName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && initName.trim()) {
                          handleInitWorkspace();
                        }
                      }}
                      placeholder="Workspace name (e.g. CLI Coding Team)"
                      className="workspace-setup-input w-full rounded-xl pl-9 pr-4 py-2.5 text-xs outline-none transition-all duration-300"
                    />
                  </div>
                  <button
                    onClick={handleInitWorkspace}
                    disabled={!initName.trim()}
                    className={`w-full flex items-center justify-center gap-2 font-bold text-xs py-2.5 px-4 rounded-xl transition-all duration-300 ${
                      initName.trim()
                        ? "workspace-setup-btn-primary cursor-pointer"
                        : "workspace-setup-btn-disabled"
                    }`}
                  >
                    <FolderOpen size={14} />
                    Choose Workspace Directory
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 text-left pl-1 mt-1.5 flex items-center gap-1.5 select-none">
                  <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent-primary, #38bdf8)', boxShadow: '0 0 8px rgba(var(--accent-primary-rgb, 56, 189, 248), 0.8)' }}></span>
                  Enter workspace name, then choose a directory to initialize
                </p>
              </div>

            </div>
          ) : (
            /* Empty state - only show Create Session card centered */
            <div className="workspace-setup-card w-full max-w-md p-6 space-y-4">
              <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-widest text-center select-none">
                Create New Session
              </div>
              <div className="relative group/input">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 group-focus-within/input:text-[var(--accent-primary)] transition-colors duration-300">
                  <Folder size={14} />
                </div>
                <input
                  ref={workspaceInputRef}
                  type="text"
                  value={initName}
                  onChange={(e) => setInitName(e.target.value)}
                  placeholder="Workspace name (e.g. CLI Coding Team)"
                  className="workspace-setup-input w-full rounded-xl pl-9 pr-4 py-2.5 text-xs outline-none transition-all duration-300"
                />
              </div>
              <button
                onClick={handleInitWorkspace}
                disabled={!initName.trim()}
                className={`w-full flex items-center justify-center gap-2 font-bold text-xs py-2.5 px-4 rounded-xl transition-all duration-300 ${
                  initName.trim()
                    ? "workspace-setup-btn-primary cursor-pointer"
                    : "workspace-setup-btn-disabled"
                }`}
              >
                <FolderOpen size={14} />
                Choose Workspace Directory
              </button>
              <p className="text-[10px] text-zinc-500 text-center pl-1 mt-1.5 flex items-center justify-center gap-1.5 select-none">
                <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent-primary, #38bdf8)', boxShadow: '0 0 8px rgba(var(--accent-primary-rgb, 56, 189, 248), 0.8)' }}></span>
                Enter workspace name, then choose a directory to initialize
              </p>
            </div>
          )}

          {/* Recent Workspaces Section */}
          {workspaces.length > 1 && (
            <div className="w-full max-w-4xl mt-16 text-left">
              <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-widest mb-3 pl-1">
                Recent Workspaces
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
                                {/* Workspace cards */}
                {recentWorkspaces.map(ws => (
                  <div
                    key={ws.id}
                    onClick={() => useOrchestratorStore.getState().selectWorkspace(ws.id)}
                    className="workspace-setup-card-interactive group/card flex items-center gap-3 p-3.5 cursor-pointer min-w-0 min-h-[72px] active:scale-[0.985]"
                  >
                    <div className="workspace-icon-wrapper w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Folder size={14} style={{ color: 'var(--accent-primary, #38bdf8)' }} />
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="workspace-title text-xs font-bold transition-colors truncate">{ws.name}</span>
                      <span className="text-[9.5px] font-mono text-zinc-500 truncate mt-0.5" title={ws.rootPath}>{ws.rootPath}</span>
                      <span className="text-[9px] text-zinc-500 mt-1">{formatWorkspaceTime(ws.lastOpened)}</span>
                    </div>
                  </div>
                ))}

                {/* Browse All Link Card */}
                <div
                  onClick={() => setShowBrowseAllModal(true)}
                  className="workspace-setup-card-dashed group/card flex items-center justify-between p-3.5 cursor-pointer min-h-[72px] active:scale-[0.985]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="workspace-icon-wrapper w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FolderOpen size={14} style={{ color: 'var(--accent-primary, #38bdf8)' }} />
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="workspace-title text-xs font-bold transition-colors">Browse All</span>
                      <span className="text-[9.5px] text-zinc-500 mt-0.5">View all workspaces</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <span className="workspace-enter-badge text-[8px] font-mono px-1 py-0.5 rounded transition-all">Ctrl+D</span>
                    <ChevronRight size={14} className="workspace-arrow transition-all" />
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Footer Status Bar */}
        <div className="w-full max-w-4xl flex justify-between items-center py-4 border-t border-white/[0.04] text-xs text-zinc-500 z-10 mt-6 select-none">
          <div className="flex items-center gap-6">
            <button
              onClick={() => { if (workspaceInputRef.current) { workspaceInputRef.current.focus(); workspaceInputRef.current.select(); } }}
              className="workspace-footer-btn"
            >
              <Sparkles size={13} className="plus-icon" />
              <span>New Session</span>
              <span className="workspace-footer-kbd">Ctrl+N</span>
            </button>
            <button
              onClick={() => {
                setImportJsonText("");
                setShowImportModal(true);
              }}
              className="workspace-footer-btn"
            >
              <Import size={13} />
              <span>Import Profile</span>
              <span className="workspace-footer-kbd">Ctrl+I</span>
            </button>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => useOrchestratorStore.getState().setSettingsModalOpen(true)}
              className="workspace-footer-btn"
            >
              <Settings size={13} className="settings-icon" />
              <span>Settings</span>
              <span className="workspace-footer-kbd">{settingsShortcut}</span>
            </button>
            <button
              onClick={handleExitApp}
              className="workspace-footer-btn-exit"
            >
              <Power size={13} />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {/* Browse All Workspaces Modal */}
        {showBrowseAllModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[99999] flex items-center justify-center animate-in fade-in duration-200">
            <div className="glass-modal glass-noise-base w-[480px] max-h-[80vh] p-6 flex flex-col relative animate-in zoom-in-95 duration-200">
              {/* Close Button */}
              <button
                onClick={() => setShowBrowseAllModal(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 p-1 rounded-full hover:bg-zinc-800/30 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
              
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 border-b border-white/10 pb-3 mb-4 flex items-center gap-2 select-none">
                <FolderOpen size={16} className="text-blue-500" />
                Browse All Workspaces ({workspaces.length})
              </h2>

              {/* Search Input */}
              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={browseSearchQuery}
                  onChange={(e) => setBrowseSearchQuery(e.target.value)}
                  placeholder="Search workspaces..."
                  className="w-full bg-black/40 border border-white/[0.08] focus:border-blue-500/50 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none"
                />
              </div>

              {/* Scrollable list of all workspaces */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
                {workspaces
                  .filter(ws => ws.name.toLowerCase().includes(browseSearchQuery.toLowerCase()) || ws.rootPath.toLowerCase().includes(browseSearchQuery.toLowerCase()))
                  .map(ws => (
                    <div key={ws.id} className="group/item flex items-center justify-between p-2 rounded-xl bg-white/[0.01] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all">
                      <button
                        onClick={() => {
                          setShowBrowseAllModal(false);
                          useOrchestratorStore.getState().selectWorkspace(ws.id);
                        }}
                        className="flex-1 flex items-center gap-3 px-3 py-2 text-left rounded-lg text-zinc-300 transition-colors min-w-0 bg-transparent border-0 outline-none cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 flex-shrink-0 group-hover/item:bg-blue-500/20 transition-all">
                          <Folder size={14} className="text-[#38bdf8]" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-zinc-200 group-hover/item:text-white truncate">{ws.name}</span>
                          <span className="text-[10px] font-mono text-zinc-500 truncate mt-0.5" title={ws.rootPath}>{ws.rootPath}</span>
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
            </div>
          </div>
        )}

        {/* Import Settings Profile Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[99999] flex items-center justify-center animate-in fade-in duration-200">
            <div className="glass-modal glass-noise-base w-[460px] p-6 flex flex-col relative animate-in zoom-in-95 duration-200">
              {/* Close Button */}
              <button
                onClick={() => setShowImportModal(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 p-1 rounded-full hover:bg-zinc-800/30 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
                         <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200 border-b border-white/10 pb-3 mb-3 flex items-center gap-2 select-none">
                <Import size={16} className="text-blue-500" />
                Import Settings Profile
              </h2>
              
              <p className="text-[10px] text-zinc-400 mb-4 select-none leading-relaxed">
                Paste a settings profile JSON configuration below. This will overwrite appearance, typography, layout, terminal, or hotkey preferences with the imported values.
              </p>

              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder={`{\n  "appearance": {\n    "theme": "dark-glass",\n    "accentColor": "blue"\n  }\n}`}
                className="w-full h-40 bg-black/40 border border-white/[0.08] focus:border-blue-500/50 rounded-xl p-3 text-[11px] font-mono text-zinc-200 placeholder-zinc-650 outline-none resize-none"
              />

              <div className="flex gap-2 justify-end mt-4">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="bg-transparent hover:bg-[#07070b] text-zinc-400 hover:text-zinc-200 border border-border-glass hover:border-border-glass-hover font-bold text-[10px] uppercase py-2 px-4 rounded-lg transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    try {
                      if (!importJsonText.trim()) throw new Error("JSON configuration cannot be empty.");
                      const parsed = JSON.parse(importJsonText);
                      if (typeof parsed !== 'object' || parsed === null) {
                        throw new Error("Parsed JSON is not a valid configuration object.");
                      }
                      useOrchestratorStore.getState().updateSettings(parsed);
                      setShowImportModal(false);
                      setImportJsonText("");
                      // Trigger alert via store
                      useOrchestratorStore.getState().showAlertDialog("Profile Imported", "The settings profile has been successfully parsed and applied.");
                    } catch (err: any) {
                      useOrchestratorStore.getState().showAlertDialog("Import Error", "Import error: " + err.message);
                    }
                  }}
                  className="bg-accent-primary hover:bg-accent-secondary text-black font-bold text-[10px] uppercase py-2 px-4 rounded-lg shadow transition-all cursor-pointer"
                >
                  Apply Profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Dialogs & Modals */}
        <CustomDialog />
        <SettingsModalBoundary>
          <SettingsModal />
        </SettingsModalBoundary>
        </div>
      </div>
    );
  }


  return (
    <div className="relative h-screen w-screen bg-bg-primary overflow-hidden">
      <TitleBar />
      <div 
        ref={appRef}
        style={{} as React.CSSProperties}
        className={`h-full w-full pt-[34px] text-zinc-200 overflow-hidden flex flex-row font-sans relative bg-bg-primary ${(isSidebarDragging || isHeightDragging || isTeamDragging || isBrowserDragging || isReviewDragging) ? "is-dragging" : ""}`}
      >
      {settings?.appearance?.workspace?.showActivityBar !== false && <ActivityBar />}

        {/* Main content column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* 2. Main Dashboard Layout splits */}
          <div 
            className="flex-1 flex overflow-hidden p-0 relative"
          style={{ 
            gap: 'var(--pane-spacing)',
            flexDirection: settings?.appearance?.workspace?.sidebarPosition === 'right' ? 'row-reverse' : 'row'
          }}
        >
        {/* Left Side Dock columns (resizable) - Agents & Telemetry Feed */}
        {isSidebarVisible && !isAgentPanelPinned && (
          <div 
            className="fixed inset-0 z-20"
            style={{ left: `${activityBarWidth}px` }} 
            onClick={() => setSidebarVisible(false)}
          />
        )}
        <div 
          className={`flex flex-col gap-1 overflow-hidden ${
            isAgentPanelPinned 
              ? 'flex-shrink-0 relative' 
              : `absolute top-0 bottom-0 z-30 shadow-2xl bg-black backdrop-blur-xl border border-border-glass rounded-lg ${settings?.appearance?.workspace?.sidebarPosition === 'right' ? 'right-2' : 'left-2'}`
          } ${
            isSidebarDragging ? '' : 'transition-[width,opacity,margin,transform] duration-300 ease-out'
          } ${
            isSidebarVisible 
              ? `opacity-100 ${isAgentPanelPinned ? '' : 'translate-x-0'}` 
              : `opacity-0 pointer-events-none ${isAgentPanelPinned ? '' : (settings?.appearance?.workspace?.sidebarPosition === 'right' ? 'translate-x-4' : '-translate-x-4')}`
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

        {/* Floating Resizer (used for both pinned and unpinned to avoid flex gaps) */}
        {isSidebarVisible && (
          <div
            onMouseDown={startSidebarResize}
            onDoubleClick={() => isAgentPanelPinned ? setSidebarVisible(false) : null}
            className="absolute top-0 bottom-0 w-2 bg-transparent cursor-col-resize flex items-center justify-center group select-none z-40"
            style={
              settings?.appearance?.workspace?.sidebarPosition === 'right' 
                ? { 
                    right: isAgentPanelPinned 
                      ? `calc(var(--sidebar-width) + (var(--pane-spacing) / 2) - 4px)` 
                      : `calc(var(--sidebar-width) + 8px)`
                  } 
                : { 
                    left: isAgentPanelPinned 
                      ? `calc(var(--sidebar-width) + (var(--pane-spacing) / 2) - 4px)` 
                      : `calc(var(--sidebar-width) + 8px)`
                  }
            }
            title={isAgentPanelPinned ? "Drag to resize sidebar, Double-click to collapse" : "Drag to resize sidebar"}
          >
            {/* Vertical line divider (only visible in pinned mode usually, or on hover) */}
            {isAgentPanelPinned && (
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] h-full bg-border-glass group-hover:bg-accent-primary/50 group-active:bg-accent-primary transition-colors duration-150" />
            )}
            
            {/* Drag handle button */}
            <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-accent-primary/50 group-active:border-accent-primary/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
              <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
            </div>
          </div>
        )}

        {/* Right Side Dock viewport (split into top controls panel & bottom PTY workspace) */}
        <div 
          className="flex-1 min-w-0 flex flex-col overflow-hidden relative"
          style={{ gap: 'var(--pane-spacing)' }}
        >
          
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
              className={`flex flex-col glass-panel shadow-2xl bg-bg-glass backdrop-blur-xl overflow-hidden ${
                isTaskPanelPinned ? 'relative z-10 flex-shrink-0' : '!absolute top-0 left-0 right-0 z-20'
              } ${isHeightDragging ? '' : 'transition-all duration-300 ease-out'} p-2 border-b border-border-glass`}
              style={
                isTaskPanelPinned 
                  ? { 
                      height: isTaskCenterVisible ? 'var(--top-panel-height)' : '0px', 
                      opacity: isTaskCenterVisible ? 1 : 0,
                      padding: isTaskCenterVisible ? undefined : '0px',
                      borderWidth: isTaskCenterVisible ? undefined : '0px',
                      transform: isTaskCenterVisible ? 'translateY(0)' : 'translateY(-100%)'
                    }
                  : { 
                      height: 'var(--top-panel-height)',
                      left: (isSidebarVisible && !isAgentPanelPinned && settings?.appearance?.workspace?.sidebarPosition !== 'right') ? 'calc(var(--sidebar-width) + 8px)' : '0px',
                      right: (isSidebarVisible && !isAgentPanelPinned && settings?.appearance?.workspace?.sidebarPosition === 'right') ? 'calc(var(--sidebar-width) + 8px)' : '0px',
                      transform: isTaskCenterVisible ? 'translateY(0)' : 'translateY(-100%)',
                      opacity: isTaskCenterVisible ? 1 : 0,
                      pointerEvents: isTaskCenterVisible ? 'auto' : 'none'
                    }
              }
            >
              {/* Header Tabs */}
              <header className="h-[46px] bg-bg-glass border-b border-border-glass px-4 flex items-center justify-between select-none flex-shrink-0">
                {/* Left Section: Navigation Tabs & Project Selector */}
                <div className="flex items-center gap-2">
                  {/* Task Center Tab */}
                  <button
                    onClick={() => setActiveRightTab('tasks')}
                    className={`flex items-center gap-1.5 h-[30px] px-2.5 rounded text-[10px] font-bold tracking-wider uppercase border transition-all ${
                      activeRightTab === 'tasks'
                        ? 'border-accent-primary text-accent-primary bg-accent-primary/5'
                        : 'border-border-glass text-text-muted hover:text-text-primary hover:border-border-glass-hover'
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
                        ? 'border-accent-primary text-accent-primary bg-accent-primary/5'
                        : 'border-transparent text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <FileText size={12} />
                    <span>Project Memory</span>
                  </button>

                  <div className="w-px h-3.5 bg-border-glass mx-1"></div>

                  {/* Project Dropdown Selector */}
                  <div className="relative">
                    {activeProjects.length > 0 && (
                      <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="appearance-none flex items-center gap-1.5 h-[30px] px-2.5 pr-7 rounded bg-bg-secondary/60 border border-border-glass text-[11px] font-medium text-text-primary hover:border-border-glass-hover transition-colors outline-none cursor-pointer"
                      >
                        {activeProjects.map(p => (
                          <option key={p.id} value={p.id} className="bg-bg-secondary text-text-primary">{p.name}</option>
                        ))}
                      </select>
                    )}
                    {/* Custom Chevron since appearance is none */}
                    {activeProjects.length > 0 && (
                      <ChevronDown size={10} className="text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                  </div>
                </div>

                {/* Right Section: Action Buttons */}
                <div className="flex items-center gap-2">
                  {/* Create Task Button */}
                  {activeRightTab === "tasks" && selectedProjectId && (
                    <button
                      onClick={() => setShowAddForm(!showAddForm)}
                      className="flex items-center gap-1.5 h-[30px] px-3.5 rounded-lg bg-accent-primary hover:bg-accent-secondary text-zinc-950 text-[10px] font-bold tracking-wide transition-colors shadow-lg shadow-accent-primary/5"
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
                        className="flex items-center gap-1 h-[30px] px-3 rounded-lg bg-bg-secondary/60 border border-border-glass text-text-primary hover:bg-bg-secondary hover:border-border-glass-hover text-[10px] font-bold tracking-wide transition-colors disabled:opacity-50"
                      >
                        <Save size={12} />
                        <span>{isMemorySaving ? "Saving..." : "Save Memory"}</span>
                      </button>
                    </div>
                  )}

                  <div className="w-px h-3.5 bg-border-glass mx-0.5"></div>

                  {/* Pin Panel Toggle */}
                  <button
                    onClick={() => {
                      if (terminals.length <= 8) setTaskPanelPinned(!isTaskPanelPinned);
                    }}
                    className={`flex items-center justify-center w-[30px] h-[30px] rounded-lg border transition-colors ${terminals.length > 8 ? 'opacity-50 cursor-not-allowed border-border-glass text-text-muted' : isTaskPanelPinned ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary' : 'bg-bg-secondary/60 border border-border-glass text-text-muted hover:text-text-primary hover:border-border-glass-hover'}`}
                    title={terminals.length > 8 ? "Docking disabled (> 8 terminals)" : isTaskPanelPinned ? "Unpin Panel (Float)" : "Pin Panel (Dock)"}
                  >
                    {isTaskPanelPinned ? <Pin size={12} /> : <PinOff size={12} />}
                  </button>

                  {/* Hide Panel Toggle */}
                  <button
                    onClick={() => setTaskCenterVisible(false)}
                    className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg bg-bg-secondary/60 border border-border-glass text-text-muted hover:text-text-primary hover:border-border-glass-hover text-[10px] font-bold tracking-wider uppercase transition-colors"
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
              className={`${isTaskPanelPinned ? 'relative w-full z-20' : 'absolute left-0 right-0 z-30'} h-3 bg-transparent ${isHeightDragging ? '' : 'hover:bg-accent-primary/10 transition-all duration-200'} cursor-row-resize flex items-center justify-center group select-none flex-shrink-0`}
              style={isTaskPanelPinned ? {} : { 
                top: 'var(--top-panel-height)',
                left: (isSidebarVisible && !isAgentPanelPinned && settings?.appearance?.workspace?.sidebarPosition !== 'right') ? 'calc(var(--sidebar-width) + 8px)' : '0px',
                right: (isSidebarVisible && !isAgentPanelPinned && settings?.appearance?.workspace?.sidebarPosition === 'right') ? 'calc(var(--sidebar-width) + 8px)' : '0px'
              }}
              title="Drag to resize top panel, Double-click to collapse"
            >
              {/* Drag handle button */}
              <div className="h-1.5 w-6 rounded glass-panel transition-all duration-150 flex justify-center items-center gap-[2px] px-1 shadow-md">
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
              </div>
            </div>
          )}



          {/* Nexora Team Dashboard Panel */}
          {isTeamPanelVisible && (
            <div
              className="absolute top-2.5 bottom-8 left-2 right-2 z-30 flex flex-col bg-[#0D0D10]/98 border border-[#1B1B22] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex-1 min-h-0 overflow-hidden">
                <React.Suspense fallback={<div className="h-full flex items-center justify-center text-zinc-500 font-mono text-xs">Loading Nexora Team Dashboard...</div>}>
                  <TeamDashboard />
                </React.Suspense>
              </div>
            </div>
          )}

          {/* Bottom Panel (Terminal Workspace / Web Browser split) */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-row gap-1 relative overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col glass-panel px-2 pb-2 pt-1 overflow-hidden">
              <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-zinc-500 font-mono text-xs">Loading terminal workspace...</div>}>
                <TerminalWorkspace />
              </React.Suspense>
            </div>

            {/* Backdrop overlay for unpinned browser panel */}
            {isBrowserPanelVisible && !isBrowserPanelPinned && (
              <div 
                className="absolute inset-0 z-20 bg-black/20 cursor-default"
                onClick={toggleBrowserPanel}
              />
            )}

            {/* Backdrop overlay for unpinned review center panel */}
            {isReviewCenterOpen && (
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
                  <div className="w-[1px] h-full bg-border-glass group-hover:bg-accent-primary/50 group-active:bg-accent-primary transition-colors duration-150" />
                  <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-accent-primary/50 group-active:border-accent-primary/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                  </div>
                </div>

                {/* Web Browser Panel (Pinned) */}
                <div
                  className={`flex-shrink-0 h-full overflow-hidden glass-panel ${
                    isBrowserDragging ? '' : 'transition-[width] duration-300 ease-out'
                  }`}
                  style={{ width: 'var(--browser-panel-width)', maxWidth: 'calc(100% - 100px)' }}
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
                  style={{ right: 'min(var(--browser-panel-width), 100%)' }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-accent-primary/50 group-active:border-accent-primary/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                  </div>
                </div>

                {/* Web Browser Panel (Unpinned/Popup) */}
                <div
                  className={`!absolute right-0 top-0 bottom-0 z-30 overflow-hidden glass-panel shadow-2xl bg-[#08080a] backdrop-blur-xl border border-border-glass rounded-lg ${
                    isBrowserDragging ? '' : 'transition-[width] duration-300 ease-out'
                  }`}
                  style={{ width: 'var(--browser-panel-width)', maxWidth: '100%' }}
                >
                  <BrowserPanel />
                </div>
              </>
            )}

            {/* Agent Review Center Panel (Floating/Popup) */}
            {isReviewCenterOpen && activeWs && (
              <>
                {/* Floating Resizer Handle */}
                <div
                  onMouseDown={startReviewResize}
                  className="absolute top-0 bottom-0 w-2 bg-transparent cursor-col-resize flex items-center justify-center group select-none z-45"
                  style={{ right: 'min(var(--review-panel-width), 100%)' }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 rounded glass-panel group-hover:border-accent-primary/50 group-active:border-accent-primary/80 transition-all duration-150 flex flex-col justify-center items-center gap-[2px] py-1 shadow-md">
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                    <div className="w-[2px] h-[2px] rounded-full bg-zinc-500 group-hover:bg-accent-primary" />
                  </div>
                </div>

                <div
                  className={`!absolute right-0 top-0 bottom-0 z-30 overflow-hidden glass-panel shadow-2xl bg-[#08080a] backdrop-blur-xl border border-border-glass rounded-lg ${
                    isReviewDragging ? '' : 'transition-[width] duration-300 ease-out'
                  }`}
                  style={{ width: 'var(--review-panel-width)', maxWidth: '100%' }}
                >
                  <React.Suspense fallback={<div className="h-full flex items-center justify-center text-zinc-500 font-mono text-xs">Loading review center...</div>}>
                    <AgentReviewCenter
                      repoPath={projects.find(p => p.id === selectedProjectId)?.path || activeWs.rootPath}
                      onClose={() => setReviewCenterOpen(false)}
                    />
                  </React.Suspense>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Visual Status bar at the bottom */}
      {settings?.appearance?.workspace?.showStatusBar !== false && (
        <div className="h-6 glass-bottombar px-4 flex items-center justify-between text-[10px] text-zinc-400 font-mono select-none flex-shrink-0 border-t border-white/[0.04] bg-black/95 z-40">
          {/* Left section: Connection & Workspace info */}
          <div className="flex-center gap-3 flex">
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

            {settings?.appearance?.workspace?.showGitBranch && gitBranch && (
              <div className="flex items-center gap-1.5 text-zinc-300">
                <span className="text-zinc-650">|</span>
                <span className="flex items-center gap-1 text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                  <GitBranch size={10} className="text-zinc-500" />
                  Branch:
                </span>
                <span className="text-zinc-200 font-semibold">{gitBranch}</span>
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
                <Cpu size={10} className="text-[#38bdf8]" />
                <span>CPU <span className="text-zinc-200 font-bold">{cpuLoad}%</span></span>
              </div>
              
              {/* RAM */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.04] text-zinc-400" title="Global Memory Used">
                <HardDrive size={10} className="text-[#38bdf8]" />
                <span>RAM <span className="text-zinc-200 font-bold">{ramLoad} GB</span></span>
              </div>

              {/* PTYs */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/[0.04] text-zinc-400" title="Active PTY Processes">
                <Layers size={10} className="text-[#38bdf8]" />
                <span>PTYs <span className="text-zinc-200 font-bold">{terminals.length}</span></span>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      <ContextMenu />
      <CustomDialog />
      <SettingsModalBoundary>
        <SettingsModal />
      </SettingsModalBoundary>
      <AgentInspector />
      <PerformanceOverlay />
      </div>
    </div>
  );
}

export default App;
