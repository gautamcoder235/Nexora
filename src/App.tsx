import React, { useEffect, useState, useRef } from "react";
import { FolderOpen, BarChart2, Cpu, HardDrive, Layers, Trash2, Plus, Save, Pin, PinOff, LayoutGrid, FileText, ChevronDown, Keyboard, SidebarClose, Edit2, ChevronRight, Power, Settings, Import, Sparkles, Folder, Search, X, Terminal } from "lucide-react";
import { ActivityBar } from "./components/ActivityBar";
import { AgentGrid } from "./components/AgentGrid";
import { TerminalWorkspace } from "./components/TerminalWorkspace";
import { ActivityFeed } from "./components/ActivityFeed";
import { TaskCenter } from "./components/TaskCenter";
import { ProjectMemory } from "./components/ProjectMemory";
import { SwarmView } from "./components/SwarmView/SwarmView";
import { AgentReviewCenter } from "./components/ExecutionReview/AgentReviewCenter";
import { AgentInspector } from "./components/AgentInspector";
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
            style={{ padding: '8px 20px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '6px', color: '#f59e0b', fontSize: '12px', cursor: 'pointer' }}
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

  useEffect(() => {
    if (activeWorkspaceId) return;

    const handleLandingKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N -> Focus workspace name input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        workspaceInputRef.current?.focus();
      }
      // Ctrl+O -> Open Browse All Modal
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
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
        const rightBoundary = Math.min(
          window.innerWidth - (isReviewCenterOpen && isReviewPanelPinned ? reviewPanelWidth : 0) - 300,
          window.innerWidth - 320 - 8
        );
        const currentX = Math.max(leftBoundary, Math.min(e.clientX, rightBoundary));
        const newWidth = Math.max(320, window.innerWidth - currentX - 8);

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
  };  // If no workspace is active/defined, prompt to create a Workspace Session
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
      <div className="h-screen w-screen text-zinc-100 flex flex-col justify-between items-center font-sans p-8 select-none relative workspace-setup-bg overflow-hidden">
        {/* Glow ambient background circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-15%] left-[-15%] w-[65vw] h-[65vw] rounded-full bg-gradient-to-tr from-amber-500/10 to-orange-500/10 opacity-30 blur-[130px] animate-pulse" style={{ animationDuration: '9s' }}></div>
          <div className="absolute bottom-[-15%] right-[-15%] w-[65vw] h-[65vw] rounded-full bg-gradient-to-br from-purple-500/10 to-indigo-500/10 opacity-30 blur-[130px] animate-pulse" style={{ animationDuration: '13s' }}></div>
          
          {/* Abstract Grid Overlay */}
          <div 
            className="absolute inset-0 opacity-[0.02]" 
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
          <div className="absolute top-[25%] left-[20%] w-2.5 h-2.5 rounded-full bg-amber-400/25 blur-[1px] animate-float" style={{ animationDelay: '0s', animationDuration: '8s' }}></div>
          <div className="absolute top-[65%] left-[15%] w-3.5 h-3.5 rounded-full bg-purple-400/20 blur-[1px] animate-float" style={{ animationDelay: '2s', animationDuration: '12s' }}></div>
          <div className="absolute top-[35%] right-[25%] w-2 h-2 rounded-full bg-orange-400/35 blur-[1px] animate-float" style={{ animationDelay: '4s', animationDuration: '10s' }}></div>
          <div className="absolute top-[75%] right-[20%] w-2.5 h-2.5 rounded-full bg-amber-500/20 blur-[1px] animate-float" style={{ animationDelay: '1s', animationDuration: '14s' }}></div>
        </div>

        {/* Top Spacer / Flex item */}
        <div className="flex-1 flex flex-col justify-center items-center w-full max-w-4xl z-10 relative">
          
          {/* Header section */}
          <div className="text-center space-y-4 mb-12 select-none">
            {/* Logo brand with orange glow */}
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center group mb-4">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 opacity-25 blur-lg group-hover:opacity-45 transition-opacity duration-500 animate-pulse"></div>
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#181822] to-[#07070b] border border-white/10 flex items-center justify-center shadow-2xl group-hover:border-amber-500/40 transition-all duration-300">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 font-black text-2xl tracking-wider select-none font-mono">
                  NX
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-amber-500 select-none filter drop-shadow-[0_0_30px_rgba(245,158,11,0.25)]">
                Nexora
              </h1>
              <div className="flex justify-center">
                <span className="px-3.5 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase font-mono bg-amber-500/10 text-[#f59e0b] border border-amber-500/25 shadow-[0_0_15px_rgba(245,158,11,0.08)] select-none">
                  🤖 AI Orchestrator
                </span>
              </div>
              <p className="text-zinc-400 text-xs md:text-sm max-w-lg mx-auto leading-relaxed pt-2 px-4 select-none">
                A command-center dashboard designed to coordinate and monitor <span className="text-[#f59e0b] font-semibold">autonomous CLI coding agents</span> across multiple project folders.
              </p>
            </div>
          </div>

          {/* Middle Layout */}
          {workspaces.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full max-w-4xl relative items-stretch">
              
              {/* Vertical line with OR badge */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/[0.06] -translate-x-1/2 hidden md:block"></div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-white/[0.08] bg-[#07070c] flex items-center justify-center text-[10px] text-zinc-500 font-bold uppercase font-mono hidden md:flex select-none">
                OR
              </div>

              {/* Left Column: Resume Workspace */}
              <div className="flex flex-col text-left">
                <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-widest mb-3 pl-1">
                  Resume Workspace
                </div>
                <div 
                  onClick={() => useOrchestratorStore.getState().selectWorkspace(latestWorkspace.id)}
                  className="group flex items-center justify-between p-6 rounded-2xl bg-[#0b0c10]/40 border border-white/[0.04] hover:bg-[#0f1017]/85 hover:border-amber-500/30 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-amber-500/[0.02] transition-all duration-300 ease-out cursor-pointer h-[130px] select-none"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0 group-hover:bg-amber-500/20 group-hover:border-amber-500/40 transition-all duration-300 shadow-[0_0_15px_rgba(245,158,11,0.08)]">
                      <FolderOpen size={20} className="text-[#f59e0b]" />
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors truncate">{latestWorkspace.name}</span>
                      <span className="text-[10.5px] font-mono text-zinc-400 group-hover:text-zinc-300 truncate mt-1" title={latestWorkspace.rootPath}>{latestWorkspace.rootPath}</span>
                      <span className="text-[10px] text-zinc-500 mt-2">{formatLastOpenedTime(latestWorkspace.lastOpened)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/5 bg-white/5 text-zinc-500 group-hover:border-amber-500/20 group-hover:text-amber-500 transition-all">Enter</span>
                    <ChevronRight size={18} className="text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>

              {/* Right Column: Create New Session */}
              <div className="flex flex-col text-left">
                <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-widest mb-3 pl-1">
                  Create New Session
                </div>
                <div className="flex flex-col justify-between p-6 rounded-2xl bg-[#0b0c10]/40 border border-white/[0.04] shadow-2xl h-[130px] space-y-3">
                  <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 group-focus-within/input:text-amber-500 transition-colors duration-300">
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
                      className="w-full bg-black/40 border border-white/[0.08] focus:border-amber-500/50 focus:bg-black/60 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none transition-all duration-300 focus:shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                    />
                  </div>
                  <button
                    onClick={handleInitWorkspace}
                    disabled={!initName.trim()}
                    className={`w-full flex items-center justify-center gap-2 font-bold text-xs py-2.5 px-4 rounded-xl transition-all duration-300 ${
                      initName.trim()
                        ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/10 cursor-pointer active:scale-[0.98]"
                        : "bg-white/[0.02] border border-white/[0.04] text-zinc-650 cursor-not-allowed"
                    }`}
                  >
                    <FolderOpen size={14} />
                    Choose Workspace Directory
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 text-left pl-1 mt-1.5 flex items-center gap-1.5 select-none">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse"></span>
                  Enter workspace name, then choose a directory to initialize
                </p>
              </div>

            </div>
          ) : (
            /* Empty state - only show Create Session card centered */
            <div className="w-full max-w-md p-6 rounded-2xl bg-[#0b0c10]/40 border border-white/[0.04] shadow-2xl space-y-4">
              <div className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-widest text-center select-none">
                Create New Session
              </div>
              <div className="relative group/input">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 group-focus-within/input:text-amber-500 transition-colors duration-300">
                  <Folder size={14} />
                </div>
                <input
                  ref={workspaceInputRef}
                  type="text"
                  value={initName}
                  onChange={(e) => setInitName(e.target.value)}
                  placeholder="Workspace name (e.g. CLI Coding Team)"
                  className="w-full bg-black/40 border border-white/[0.08] focus:border-amber-500/50 focus:bg-black/60 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none transition-all duration-300 focus:shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                />
              </div>
              <button
                onClick={handleInitWorkspace}
                disabled={!initName.trim()}
                className={`w-full flex items-center justify-center gap-2 font-bold text-xs py-2.5 px-4 rounded-xl transition-all duration-300 ${
                  initName.trim()
                    ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/10 cursor-pointer active:scale-[0.98]"
                    : "bg-white/[0.02] border border-white/[0.04] text-zinc-650 cursor-not-allowed"
                }`}
              >
                <FolderOpen size={14} />
                Choose Workspace Directory
              </button>
              <p className="text-[10px] text-zinc-500 text-center pl-1 mt-1.5 flex items-center justify-center gap-1.5 select-none">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse"></span>
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
                    className="group/card flex items-center gap-3 p-3.5 rounded-xl bg-[#0b0c10]/20 border border-white/[0.03] hover:bg-[#0f1017]/85 hover:border-amber-500/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-500/[0.01] transition-all duration-300 ease-out cursor-pointer min-w-0 min-h-[72px] active:scale-[0.985]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0 group-hover/card:bg-amber-500/20 group-hover/card:border-amber-500/30 transition-all">
                      <Folder size={14} className="text-[#f59e0b]" />
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="text-xs font-bold text-zinc-200 group-hover/card:text-white transition-colors truncate">{ws.name}</span>
                      <span className="text-[9.5px] font-mono text-zinc-500 truncate mt-0.5" title={ws.rootPath}>{ws.rootPath}</span>
                      <span className="text-[9px] text-zinc-500 mt-1">{formatWorkspaceTime(ws.lastOpened)}</span>
                    </div>
                  </div>
                ))}

                {/* Browse All Link Card */}
                <div
                  onClick={() => setShowBrowseAllModal(true)}
                  className="group/card flex items-center justify-between p-3.5 rounded-xl bg-[#0b0c10]/10 border border-dashed border-white/10 hover:bg-[#0f1017]/60 hover:border-amber-500/30 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 ease-out cursor-pointer min-h-[72px] active:scale-[0.985]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 flex-shrink-0 group-hover/card:bg-amber-500/10 group-hover/card:border-amber-500/20 group-hover/card:text-amber-400 transition-all">
                      <FolderOpen size={14} />
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="text-xs font-bold text-zinc-300 group-hover/card:text-white transition-colors">Browse All</span>
                      <span className="text-[9.5px] text-zinc-500 mt-0.5">View all workspaces</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded border border-white/5 bg-white/5 text-zinc-600 group-hover/card:text-amber-500 group-hover/card:border-amber-500/20 transition-all">Ctrl+O</span>
                    <ChevronRight size={14} className="text-zinc-500 group-hover/card:text-amber-400 group-hover/card:translate-x-0.5 transition-all" />
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
              className="group flex items-center gap-1.5 hover:text-zinc-200 cursor-pointer transition-colors bg-transparent border-0 p-0 shadow-none outline-none font-medium"
            >
              <Sparkles size={13} className="text-[#f59e0b] group-hover:animate-pulse" />
              <span>New Session</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded border border-white/5 bg-white/5 text-zinc-600 group-hover:text-amber-400 group-hover:border-amber-500/20 transition-all ml-1.5">Ctrl+N</span>
            </button>
            <button
              onClick={() => {
                setImportJsonText("");
                setShowImportModal(true);
              }}
              className="group flex items-center gap-1.5 hover:text-zinc-200 cursor-pointer transition-colors bg-transparent border-0 p-0 shadow-none outline-none font-medium"
            >
              <Import size={13} />
              <span>Import Profile</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded border border-white/5 bg-white/5 text-zinc-600 group-hover:text-zinc-300 group-hover:border-white/15 transition-all ml-1.5">Ctrl+I</span>
            </button>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => useOrchestratorStore.getState().setSettingsModalOpen(true)}
              className="group flex items-center gap-1.5 hover:text-zinc-200 cursor-pointer transition-colors bg-transparent border-0 p-0 shadow-none outline-none font-medium"
            >
              <Settings size={13} />
              <span>Settings</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded border border-white/5 bg-white/5 text-zinc-600 group-hover:text-zinc-300 group-hover:border-white/15 transition-all ml-1.5">Ctrl+,</span>
            </button>
            <button
              onClick={handleExitApp}
              className="group flex items-center gap-1.5 hover:text-red-400 cursor-pointer transition-colors bg-transparent border-0 p-0 shadow-none outline-none font-medium"
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
                <FolderOpen size={16} className="text-amber-500" />
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
                  className="w-full bg-black/40 border border-white/[0.08] focus:border-amber-500/50 rounded-xl pl-9 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none"
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
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0 group-hover/item:bg-amber-500/20 transition-all">
                          <Folder size={14} className="text-[#f59e0b]" />
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
                <Import size={16} className="text-amber-500" />
                Import Settings Profile
              </h2>
              
              <p className="text-[10px] text-zinc-400 mb-4 select-none leading-relaxed">
                Paste a settings profile JSON configuration below. This will overwrite appearance, typography, layout, terminal, or hotkey preferences with the imported values.
              </p>

              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder={`{\n  "appearance": {\n    "theme": "dark-glass",\n    "accentColor": "amber"\n  }\n}`}
                className="w-full h-40 bg-black/40 border border-white/[0.08] focus:border-amber-500/50 rounded-xl p-3 text-[11px] font-mono text-zinc-200 placeholder-zinc-600 outline-none resize-none"
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
      <SettingsModalBoundary>
        <SettingsModal />
      </SettingsModalBoundary>
      <AgentInspector />
    </div>
  );
}

export default App;
