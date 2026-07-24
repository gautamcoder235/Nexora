import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Cpu, Play, Square, Trash2, AlertCircle, GripVertical, MoreVertical, Edit2, Copy, RotateCcw, FileText, Trash, Bot, CheckSquare, Clock } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { useChangesetStore } from "../stores/changesetStore";
import { AgentProfile, Project } from "../types";
import { PluginRegistry } from "../plugins";
import { CliSpawnerPanel } from "./CliSpawnerPanel";
import { EventBus } from "../core/events";
import { useShallow } from "zustand/react/shallow";

// ─────────────────────────────────────────────────────────────────────────────
// Sortable Card Component
// ─────────────────────────────────────────────────────────────────────────────
interface SortableAgentCardProps {
  agent: AgentProfile;
  proj: Project | undefined;
  activeProjects: Project[];
  isRunning: boolean;
  pluginId: string;
  isInstalled: boolean;
  dragOverId: string | null;
  tasksCount: number;
  onStart: (agent: AgentProfile) => void;
  onStop: (agent: AgentProfile) => void;
  onProjectChange: (agentId: string, projectId: string) => void;
  onDelete: (agentId: string) => void;
  onShowInstallGuide: (pluginId: string) => void;
  formatRuntime: (seconds: number) => string;
  onEdit: () => void;
  onDuplicate: () => void;
  onRestart: () => void;
  onOpenLogs: () => void;
  onInspect: () => void;
}

const SortableAgentCard: React.FC<SortableAgentCardProps> = React.memo(({
  agent,
  proj,
  activeProjects,
  isRunning,
  pluginId,
  isInstalled,
  dragOverId,
  tasksCount,
  onStart,
  onStop,
  onProjectChange,
  onDelete,
  onShowInstallGuide,
  formatRuntime,
  onEdit,
  onDuplicate,
  onRestart,
  onOpenLogs,
  onInspect
}) => {
  // Fine-grained selectors — each card only re-renders when these specific
  // settings fields change, not when any setting in the store changes.
  const animateTransitions = useOrchestratorStore(s => s.settings?.appearance?.agent?.animateAgentTransitions !== false);
  const avatarStyle = useOrchestratorStore(s => s.settings?.appearance?.agent?.avatarStyle || 'initials');
  const showAgentStatusBadge = useOrchestratorStore(s => s.settings?.appearance?.agent?.showAgentStatusBadge !== false);
  const compact = useOrchestratorStore(s => s.settings?.appearance?.agent?.compactCards ?? false);

  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ x: number; y: number } | null>(null);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [runtimeSeconds, setRuntimeSeconds] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: agent.id,
    transition: animateTransitions ? {
      duration: 350,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    } : null,
  });

  const isHighlighted = dragOverId === agent.id && !isDragging;

  useEffect(() => {
    if (isRunning && agent.startedAt) {
      setRuntimeSeconds(Math.floor((Date.now() - agent.startedAt) / 1000));
      const interval = setInterval(() => {
        setRuntimeSeconds(Math.floor((Date.now() - agent.startedAt!) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setRuntimeSeconds(0);
    }
  }, [isRunning, agent.startedAt]);

  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition: transition || undefined,
    zIndex: isDragging ? 50 : showDropdown ? 40 : 10,
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  const formatLastActiveHours = (isoString: string) => {
    if (!isoString) return "Never";
    try {
      const elapsed = Date.now() - new Date(isoString).getTime();
      const secs = Math.floor(elapsed / 1000);
      if (secs < 60) return "Now";
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h`;
      const days = Math.floor(hours / 24);
      return `${days}d`;
    } catch (e) {
      return "Recently";
    }
  };

  const renderStatusIndicator = (status: AgentProfile["status"]) => {
    let colorClass = "";
    let text = "Idle";
    let pulseDot = false;

    switch (status) {
      case "running":
        colorClass = "bg-[var(--agent-status-success)] shadow-[0_0_6px_var(--agent-status-success)]";
        text = "Running";
        pulseDot = true;
        break;
      case "paused":
        colorClass = "bg-[var(--agent-status-paused)] shadow-[0_0_6px_var(--agent-status-paused)]";
        text = "Waiting";
        break;
      case "error":
        colorClass = "bg-[var(--agent-status-error)] shadow-[0_0_6px_var(--agent-status-error)]";
        text = "Error";
        break;
      default:
        colorClass = "bg-[var(--agent-status-idle)] shadow-none";
        text = "Idle";
        break;
    }

    return (
      <div className="flex items-center gap-1 py-0.5 px-1.5 rounded-full bg-[var(--border-glass)] border border-[var(--border-glass)] shadow-sm select-none flex-shrink-0">
        <span className="relative flex h-1 w-1">
          {pulseDot && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--agent-status-success)] opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-1 w-1 ${colorClass}`}></span>
        </span>
        <span className="text-[8px] uppercase tracking-wider font-bold font-mono text-[var(--text-secondary)]">{text}</span>
      </div>
    );
  };


  const initials = agent.name.slice(0, 2).toUpperCase();
  const statusColor = agent.status === 'running' ? 'bg-[var(--agent-status-success)]' : agent.status === 'error' ? 'bg-[var(--agent-status-error)]' : agent.status === 'paused' ? 'bg-[var(--agent-status-paused)]' : 'bg-[var(--agent-status-idle)]';
  const isRunningStatus = agent.status === 'running';

  const avatarElement = (() => {
    if (avatarStyle === 'icon') {
      return (
        <div className={`rounded-full bg-[rgba(var(--accent-primary-rgb),0.1)] border border-[rgba(var(--accent-primary-rgb),0.2)] flex items-center justify-center text-[var(--accent-primary)] ${compact ? 'w-6 h-6' : 'w-8 h-8'}`}>
          <Bot size={compact ? 11 : 14} />
        </div>
      );
    }
    if (avatarStyle === 'identicon') {
      return (
        <div className={`rounded-full overflow-hidden grid grid-cols-2 gap-[1px] p-[2px] bg-[var(--bg-secondary)] border border-[var(--border-glass)] ${compact ? 'w-6 h-6' : 'w-8 h-8'}`}>
          <div className="bg-indigo-500 rounded-tl-full opacity-80" />
          <div className="bg-violet-500 rounded-tr-full opacity-60" />
          <div className="bg-[#6366f1] rounded-bl-full opacity-40" />
          <div className="bg-pink-500 rounded-br-full opacity-90" />
        </div>
      );
    }
    return (
      <div className={`rounded-full bg-gradient-to-br from-[rgba(var(--accent-primary-rgb),0.15)] to-[rgba(var(--accent-primary-rgb),0.05)] border border-[rgba(var(--accent-primary-rgb),0.3)] flex items-center justify-center font-bold text-[var(--accent-primary)] ${compact ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[11px]'}`}>
        {initials}
      </div>
    );
  })();

  return (
    <div ref={setNodeRef} style={style} className="h-full relative">
      <div
        onClick={() => {
          if (isRunning) {
            EventBus.publish("terminal:highlight", { agentId: agent.id });
          }
        }}
        className={`glass-card flex flex-col justify-between transition-all duration-250 relative h-full overflow-visible select-none ${
          compact ? "p-2 gap-1.5 min-h-[140px]" : "p-3.5 gap-3.5 min-h-[195px]"
        } ${
          isRunning ? "glass-card--active cursor-pointer" : ""
        } ${isHighlighted ? "border-[var(--accent-primary)] shadow-[var(--shadow-glow)]" : ""} ${
          isDragging ? "shadow-2xl border-[var(--accent-primary)]/40 opacity-80 scale-[0.97]" : "scale-100"
        }`}
      >

        {/* TOP HEADER ZONE */}
        <div className="flex items-start justify-between gap-1.5 flex-shrink-0 min-w-0">
          <div className="flex items-start gap-1.5 min-w-0 flex-1">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--accent-primary)] p-0.5 rounded transition-colors flex-shrink-0 touch-none mt-[1.5px]"
              onClick={(e) => e.stopPropagation()}
              title="Drag to reorder"
            >
              <GripVertical size={11} />
            </div>

            {/* Avatar block */}
            <div className="relative flex-shrink-0">
              {avatarElement}
              {showAgentStatusBadge && (
                <span className={`absolute -bottom-0.5 -right-0.5 rounded-full ${statusColor} border border-[var(--bg-primary)] ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'} ${isRunningStatus ? 'animate-pulse' : ''}`} />
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
              <span className={`font-bold text-[var(--text-primary)] truncate block leading-snug ${compact ? "text-xs" : "text-[13px]"}`} title={agent.name}>
                {agent.name}
              </span>
              <span className={`text-[var(--text-muted)] truncate block font-sans ${compact ? "text-[8.5px]" : "text-[9.5px]"}`}>
                {agent.role || agent.groupId || "AI Coding Assistant"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInspect();
            }}
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--border-glass)] transition-colors cursor-pointer flex-shrink-0 mt-[1px]"
            title="Inspect Agent"
          >
            <Bot size={compact ? 11 : 13} />
          </button>
        </div>

        {/* CAPABILITIES */}
        {!compact && (
          <div className="flex flex-wrap gap-1.5">
            {agent.capabilities.coding && (
              <span className="glass-badge text-[8px] uppercase tracking-wider flex items-center gap-1 font-mono">
                <span className="w-1 h-1 rounded-full bg-[var(--accent-primary)]" /> coding
              </span>
            )}
            {agent.capabilities.review && (
              <span className="glass-badge text-[8px] uppercase tracking-wider flex items-center gap-1 font-mono">
                <span className="w-1 h-1 rounded-full bg-[rgba(var(--accent-primary-rgb),0.7)]" /> review
              </span>
            )}
            {agent.capabilities.planning && (
              <span className="glass-badge glass-badge--accent text-[8px] uppercase tracking-wider flex items-center gap-1 font-mono">
                <span className="w-1 h-1 rounded-full bg-[var(--accent-primary)] animate-pulse" /> planning
              </span>
            )}
            {agent.capabilities.testing && (
              <span className="glass-badge text-[8px] uppercase tracking-wider flex items-center gap-1 font-mono">
                <span className="w-1 h-1 rounded-full bg-[var(--agent-status-success)]" /> testing
              </span>
            )}
          </div>
        )}


        {/* METRICS ROW (2 Columns: Tasks & Activity) */}
        <div className={`grid grid-cols-2 gap-1 text-center bg-[var(--bg-tertiary)]/40 border border-[var(--border-glass)] rounded-lg flex-shrink-0 select-none ${compact ? "py-1 px-1.5" : "py-1.5 px-2"}`}>
          <div className="flex flex-col gap-0.5 justify-center min-w-0 px-1">
            <span className="text-[8px] uppercase font-bold text-[var(--text-muted)] font-mono tracking-wider truncate">Tasks</span>
            <span className={`font-bold font-mono text-[var(--text-primary)] truncate ${compact ? "text-[10.5px]" : "text-[12px]"}`}>
              {tasksCount}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 justify-center border-l border-[var(--border-glass)] min-w-0 px-1">
            <span className="text-[8px] uppercase font-bold text-[var(--text-muted)] font-mono tracking-wider truncate">Activity</span>
            <span className={`font-bold font-mono ${isRunning ? 'text-emerald-400 font-semibold' : 'text-[var(--text-primary)]'} truncate ${compact ? "text-[10.5px]" : "text-[12px]"}`}>
              {isRunning ? formatRuntime(runtimeSeconds) : formatLastActiveHours(agent.lastActive)}
            </span>
          </div>
        </div>

        {/* FOOTER ZONE */}
        <div className={`flex flex-col flex-shrink-0 ${compact ? "gap-1.5" : "gap-2.5"}`}>
          <div className="flex items-center justify-between text-[10px] select-none gap-2">
            {isEditingProject ? (
              <div className="flex flex-col min-w-0 flex-1">
                <select
                  value={agent.projectId || ""}
                  onChange={(e) => {
                    onProjectChange(agent.id, e.target.value);
                    setIsEditingProject(false);
                  }}
                  onBlur={() => setIsEditingProject(false)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  className="glass-input text-[9.5px] text-[var(--text-secondary)] font-semibold font-mono rounded !pl-1.5 !pr-6 !py-0.5 outline-none cursor-pointer max-w-[120px] truncate"
                >
                  <option value="" className="bg-[var(--bg-secondary)]">Unassigned</option>
                  {activeProjects.map(p => (
                    <option key={p.id} value={p.id} className="bg-[var(--bg-secondary)]">{p.name}</option>
                  ))}
                </select>
                <span className="text-[8.5px] text-[var(--text-muted)] font-sans mt-0.5">
                  Select Project
                </span>
              </div>
            ) : (
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingProject(true);
                }}
                className="flex flex-col cursor-pointer group/proj min-w-0 flex-1"
                title="Click to edit project assignment"
              >
                <span className={`font-semibold text-[var(--text-primary)] group-hover/proj:text-[var(--accent-primary)] transition-colors truncate block ${compact ? "text-[10px]" : "text-[11px]"}`}>
                  {proj ? proj.name : "Unassigned"}
                </span>
                <span className={`text-[var(--text-muted)] font-sans ${compact ? "text-[8px]" : "text-[9px]"}`}>
                  Current Project
                </span>
              </div>
            )}

            {showAgentStatusBadge && renderStatusIndicator(agent.status)}
          </div>

          {/* Card Footer Actions */}
          <div className={`border-t border-[var(--border-glass)] flex gap-2 relative ${compact ? "pt-1.5" : "pt-3"}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex-grow flex items-center justify-between gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                {isRunning ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStop(agent);
                    }}
                    className={`glass-button glass-button--danger w-full !text-[10px] uppercase tracking-wider min-w-0 overflow-hidden px-1 ${compact ? "h-[26px]" : "h-[34px]"}`}
                  >
                    <Square size={10} className="fill-current shrink-0" />
                    <span className="truncate">Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStart(agent);
                    }}
                    className={`glass-button glass-button--accent w-full !text-[10px] uppercase tracking-wider min-w-0 overflow-hidden px-1 ${compact ? "h-[26px]" : "h-[34px]"}`}
                  >
                    <Play size={10} className="fill-current shrink-0" />
                    <span className="truncate">Launch</span>
                  </button>
                )}
              </div>

              <div>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    if (showDropdown) {
                      setShowDropdown(false);
                      return;
                    }

                    const rect = e.currentTarget.getBoundingClientRect();
                    const popupWidth = 160;
                    const popupHeight = 180;
                    
                    let xPos = rect.right + 8;
                    if (xPos + popupWidth > window.innerWidth) {
                      xPos = rect.left - popupWidth - 8;
                    }

                    let yPos = rect.top;
                    if (yPos + popupHeight > window.innerHeight) {
                      yPos = window.innerHeight - popupHeight - 12;
                    }

                    setDropdownPos({ x: xPos, y: yPos });
                    setShowDropdown(true);
                  }}
                  className={`p-2 rounded border border-[var(--border-glass)] flex items-center justify-center transition-colors cursor-pointer ${showDropdown ? 'bg-[var(--border-glass-hover)] text-[var(--text-primary)]' : 'hover:bg-[var(--border-glass)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'} ${compact ? "h-[26px] w-[26px]" : "h-[34px] w-[34px]"}`}
                  title="More Actions"
                >
                  <MoreVertical size={12} />
                </button>
              </div>
            </div>
              
            {showDropdown && dropdownPos && createPortal(
              <>
                <div 
                  className="fixed inset-0 z-[9998]" 
                  onPointerDown={(e) => { 
                    e.stopPropagation(); 
                    setShowDropdown(false); 
                  }}
                />
                <div 
                  ref={dropdownRef}
                  className="fixed bg-[var(--bg-secondary)] shadow-[0_0_24px_rgba(0,0,0,0.8)] p-1.5 text-[10px] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 border border-[var(--border-glass)] rounded-md z-[9999]"
                  style={{
                    top: dropdownPos.y,
                    left: dropdownPos.x,
                    width: '160px'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onEdit();
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-[var(--border-glass)] rounded text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Edit2 size={10} className="text-[var(--text-muted)]" />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onDuplicate();
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-[var(--border-glass)] rounded text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Copy size={10} className="text-[var(--text-muted)]" />
                    <span>Duplicate Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onRestart();
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-[var(--border-glass)] rounded text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <RotateCcw size={10} className="text-[var(--text-muted)]" />
                    <span>Restart Agent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onInspect();
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-[var(--border-glass)] rounded text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Bot size={10} className="text-[var(--text-muted)]" />
                    <span>Inspect Agent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onOpenLogs();
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-[var(--border-glass)] rounded text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileText size={10} className="text-[var(--text-muted)]" />
                    <span>Open Logs</span>
                  </button>
                  <div className="h-px bg-[var(--border-glass)] my-0.5" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onDelete(agent.id);
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-[rgba(var(--accent-error-rgb),0.1)] rounded text-[var(--accent-error)] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Trash2 size={10} />
                    <span>Delete Agent</span>
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export const AgentGrid: React.FC = () => {
  const activeWorkspaceId = useOrchestratorStore((s) => s.activeWorkspaceId);
  const projects = useOrchestratorStore(useShallow((s) => s.projects));
  const agents = useOrchestratorStore(useShallow((s) => s.agents));
  const tasks = useOrchestratorStore(useShallow((s) => s.tasks));
  const settings = useOrchestratorStore(useShallow((s) => s.settings));
  const deleteAgent = useOrchestratorStore((s) => s.deleteAgent);
  const updateAgent = useOrchestratorStore((s) => s.updateAgent);
  const createAgent = useOrchestratorStore((s) => s.createAgent);
  const spawnTerminal = useOrchestratorStore((s) => s.spawnTerminal);
  const killTerminal = useOrchestratorStore((s) => s.killTerminal);
  const cliInstalledStatuses = useOrchestratorStore((s) => s.cliInstalledStatuses);
  const checkAgentCli = useOrchestratorStore((s) => s.checkAgentCli);
  const showAlertDialog = useOrchestratorStore((s) => s.showAlertDialog);

  const setSelectedAgentIdForInspector = useChangesetStore((s) => s.setSelectedAgentIdForInspector);
  const setAgentInspectorOpen = useChangesetStore((s) => s.setAgentInspectorOpen);

  const [selectedProjectFilter, setSelectedProjectFilter] = useState("");
  const [selectedInstallGuide, setSelectedInstallGuide] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeProjects = projects.filter((p: Project) => p.workspaceId === activeWorkspaceId);

  useEffect(() => {
    if (activeWorkspaceId) {
      const plugins = PluginRegistry.getAll();
      for (const plugin of plugins) {
        checkAgentCli(plugin.id);
      }
    }
  }, [activeWorkspaceId, checkAgentCli]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDragOverId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = agents.findIndex((a) => a.id === active.id);
    const newIndex = agents.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(agents, oldIndex, newIndex);
    useOrchestratorStore.setState({ agents: reordered });
    useOrchestratorStore.getState().saveSnapshot();
  };

  const handleStartAgent = useCallback((agent: AgentProfile) => {
    const projectId = agent.projectId;
    if (!projectId) {
      showAlertDialog("Project Required", "Please assign a project to this agent first before launching.");
      return;
    }
    setTimeout(async () => {
      await spawnTerminal(projectId, agent.id);
    }, 0);
  }, [showAlertDialog, spawnTerminal]);

  const handleStopAgent = useCallback((agent: AgentProfile) => {
    if (agent.terminalSessionIds.length > 0) {
      const terminals = [...agent.terminalSessionIds];
      setTimeout(async () => {
        for (const termId of terminals) {
          await killTerminal(termId);
        }
      }, 0);
    }
  }, [killTerminal]);

  const handleEditAgent = useCallback((agent: AgentProfile) => {
    useOrchestratorStore.getState().showPromptDialog(
      "Edit Agent Profile Name",
      "Please enter the new profile name for this agent:",
      (newName) => {
        if (newName !== null) {
          useOrchestratorStore.getState().showPromptDialog(
            "Edit CLI Arguments",
            "Enter CLI arguments (comma-separated):",
            (newArgsStr) => {
              if (newArgsStr !== null) {
                const newArgs = newArgsStr.split(",").map(a => a.trim()).filter(a => a !== "");
                updateAgent(agent.id, {
                  name: newName.trim() || agent.name,
                  arguments: newArgs
                });
              }
            },
            undefined,
            agent.arguments.join(", ")
          );
        }
      },
      undefined,
      agent.name
    );
  }, [updateAgent]);

  const handleDuplicateAgent = useCallback((agent: AgentProfile) => {
    createAgent({
      name: `${agent.name} (Copy)`,
      groupId: agent.groupId || "",
      cliCommand: agent.cliCommand,
      arguments: agent.arguments,
      env: agent.env,
      projectId: agent.projectId,
      taskId: agent.taskId,
      capabilities: agent.capabilities,
      role: agent.role || ""
    });
  }, [createAgent]);

  const handleRestartAgent = useCallback(async (agent: AgentProfile) => {
    await handleStopAgent(agent);
    setTimeout(() => {
      handleStartAgent(agent);
    }, 400);
  }, [handleStopAgent, handleStartAgent]);

  const handleOpenLogsAgent = useCallback((agent: AgentProfile) => {
    if (agent.status === "running") {
      EventBus.publish("terminal:highlight", { agentId: agent.id });
    } else {
      showAlertDialog("Agent Offline", "Terminal logs are only accessible for active running agents.");
    }
  }, [showAlertDialog]);

  const handleInspectAgent = useCallback((agent: AgentProfile) => {
    setSelectedAgentIdForInspector(agent.id);
    setAgentInspectorOpen(true);
  }, [setSelectedAgentIdForInspector, setAgentInspectorOpen]);

  const formatRuntime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const resolvePluginId = (agent: AgentProfile): string => {
    const nameLower = agent.name.toLowerCase();
    const cmdLower = agent.cliCommand.toLowerCase();
    if (cmdLower === "aider" || nameLower.includes("aider")) return "aider";
    if (cmdLower === "gemini" || nameLower.includes("gemini")) return "gemini";
    if (cmdLower === "codex" || nameLower.includes("codex")) return "codex";
    if (cmdLower === "opencode" || nameLower.includes("opencode")) return "opencode";
    if (
      nameLower.includes("claude") ||
      (cmdLower === "npx" && agent.arguments.includes("@claudecode/cli"))
    )
      return "claude";
    return "generic";
  };

  if (!activeWorkspaceId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-[var(--text-secondary)] glass-panel h-64 select-none">
        <Cpu size={32} className="text-[var(--text-muted)] mb-3" />
        <p className="text-xs font-mono">
          Create or select a workspace to manage agents.
        </p>
      </div>
    );
  }

  const filteredAgents = selectedProjectFilter
    ? agents.filter((a) => a.projectId === selectedProjectFilter)
    : agents;

  const runningAgentsCount = agents.filter((a) => a.status === "running").length;
  const idleAgentsCount = agents.filter((a) => a.status === "idle").length;
  const failedAgentsCount = agents.filter((a) => a.status === "error").length;
  const totalActiveProjects = activeProjects.length;

  return (
    <div className="flex flex-col h-full space-y-2 overflow-hidden pb-1">
      <CliSpawnerPanel />

      <div className="flex items-center justify-between px-2.5 py-1.5 glass-panel bg-[var(--bg-glass-light)] select-none flex-shrink-0 text-[10px] font-mono border border-[var(--border-glass)]">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--agent-status-success)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--agent-status-success)]"></span>
          </span>
          <span className="text-[var(--text-secondary)] font-bold">{runningAgentsCount} <span className="text-[var(--text-muted)] font-sans font-normal lowercase">running</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--agent-status-idle)]"></span>
          <span className="text-[var(--text-secondary)] font-bold">{idleAgentsCount} <span className="text-[var(--text-muted)] font-sans font-normal lowercase">idle</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--agent-status-error)]"></span>
          <span className="text-[var(--text-secondary)] font-bold">{failedAgentsCount} <span className="text-[var(--text-muted)] font-sans font-normal lowercase">failed</span></span>
        </div>
        <div className="h-3 w-px bg-[var(--border-glass)]"></div>
        <div className="text-[var(--text-secondary)] font-bold">
          {totalActiveProjects} <span className="text-[var(--text-muted)] font-sans font-normal lowercase">projects</span>
        </div>
      </div>

      <div className="flex items-center justify-between py-0.5 flex-shrink-0">
        <h3 className="text-[10px] uppercase font-bold tracking-wide text-[var(--text-muted)] font-mono select-none">
          Profiles Grid
        </h3>
        <div className="flex items-center gap-1">
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="glass-input text-[9px] text-[var(--text-secondary)] font-semibold rounded !pl-1.5 !pr-6 !py-0 outline-none cursor-pointer max-w-[125px] truncate h-[22px] leading-none"
          >
            <option value="" className="bg-[var(--bg-secondary)]">All Projects</option>
            {activeProjects.map((p: Project) => (
              <option key={p.id} value={p.id} className="bg-[var(--bg-secondary)]">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredAgents.length === 0 ? (
        <div className="text-[var(--text-muted)] text-xs font-mono py-12 text-center border border-[var(--border-glass)] border-dashed rounded-lg bg-[var(--bg-glass-light)]/20 flex-grow flex flex-col justify-center items-center gap-2">
          <span>No CLI agent profiles found.</span>
          <span className="text-[10px] text-[var(--text-muted)]">Ready to launch a new swarm agent profile above.</span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragOver={(event) => setDragOverId(event.over ? String(event.over.id) : null)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragOverId(null)}
        >
          <SortableContext items={filteredAgents.map((a) => a.id)} strategy={rectSortingStrategy}>
            <div className={`flex-grow flex-1 overflow-y-auto min-h-0 pr-1 border border-[var(--border-glass)] rounded-lg bg-[var(--bg-primary)]/20 grid grid-cols-2 auto-rows-max ${settings?.appearance?.agent?.compactCards ? "p-1 gap-1" : "p-1.5 gap-2"}`}>
              {filteredAgents.map((agent: AgentProfile) => {
                const proj = activeProjects.find((p: Project) => p.id === agent.projectId);
                const isRunning = agent.status === "running";
                const pluginId = resolvePluginId(agent);
                const isInstalled = cliInstalledStatuses[pluginId] !== false;
                const agentTasks = tasks.filter(t => t.assignedAgentId === agent.id);

                return (
                  <SortableAgentCard
                    key={agent.id}
                    agent={agent}
                    proj={proj}
                    activeProjects={activeProjects}
                    isRunning={isRunning}
                    pluginId={pluginId}
                    isInstalled={isInstalled}
                    dragOverId={dragOverId}
                    tasksCount={agentTasks.length}
                    onStart={handleStartAgent}
                    onStop={handleStopAgent}
                    onProjectChange={(agentId, projectId) => updateAgent(agentId, { projectId: projectId || null })}
                    onDelete={deleteAgent}
                    onShowInstallGuide={setSelectedInstallGuide}
                    formatRuntime={formatRuntime}
                    onEdit={() => handleEditAgent(agent)}
                    onDuplicate={() => handleDuplicateAgent(agent)}
                    onRestart={() => handleRestartAgent(agent)}
                    onOpenLogs={() => handleOpenLogsAgent(agent)}
                    onInspect={() => handleInspectAgent(agent)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {selectedInstallGuide &&
        (() => {
          const plugin = PluginRegistry.get(selectedInstallGuide);
          return (
            <div className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-md z-50 flex items-center justify-center font-mono">
              <div className="glass-modal p-5 w-[380px] shadow-2xl space-y-4">
                <div className="border-b border-[var(--border-glass)] pb-2 flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-warning)] flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    CLI Missing: {plugin?.name || selectedInstallGuide}
                  </h3>
                  <button onClick={() => setSelectedInstallGuide(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  The binary <code className="text-[var(--accent-primary)]">{plugin?.cliCommand}</code> was not detected on your system PATH. Please run the install command below to configure it:
                </p>
                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-glass)] rounded p-2.5 text-[10px] text-[var(--text-secondary)] break-all select-text font-mono relative group">
                  {plugin?.installHelp?.command || "npm install -g @claudecode/cli"}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setSelectedInstallGuide(null)} className="glass-button text-[10px] px-3.5 py-1.5 rounded">Dismiss</button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};
