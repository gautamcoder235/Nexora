import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Cpu, Play, Square, Trash2, AlertCircle, GripVertical, MoreVertical, Edit2, Copy, RotateCcw, FileText, Trash } from "lucide-react";
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
import { AgentProfile, Project } from "../types";
import { PluginRegistry } from "../plugins";
import { CliSpawnerPanel } from "./CliSpawnerPanel";
import { EventBus } from "../core/events";

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
}

const SortableAgentCard: React.FC<SortableAgentCardProps> = ({
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
  onOpenLogs
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: agent.id,
    transition: {
      duration: 350,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    }
  });

  const isHighlighted = dragOverId === agent.id && !isDragging;
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ x: number; y: number } | null>(null);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform) + (isDragging ? ' scale(0.97)' : ''),
    transition: transition || 'transform 350ms cubic-bezier(0.25, 1, 0.5, 1)',
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

  // Pseudo CPU/RAM metrics when running to make layout feel alive
  const pseudoCpu = isRunning ? ((agent.id.charCodeAt(0) + (agent.id.charCodeAt(1) || 0)) % 5) + 3.2 : 0;
  const pseudoMem = isRunning ? ((agent.id.charCodeAt(2) + (agent.id.charCodeAt(3) || 0)) % 30) + 48 : 0;

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
        colorClass = "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]";
        text = "Running";
        pulseDot = true;
        break;
      case "paused":
        colorClass = "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]";
        text = "Waiting";
        break;
      case "error":
        colorClass = "bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]";
        text = "Error";
        break;
      default:
        colorClass = "bg-zinc-500 shadow-none";
        text = "Idle";
        break;
    }

    return (
      <div className="flex items-center gap-1 py-0.5 px-1.5 rounded bg-white/5 border border-border-glass/40 select-none flex-shrink-0">
        <span className="relative flex h-1 w-1">
          {pulseDot && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-1 w-1 ${colorClass}`}></span>
        </span>
        <span className="text-[8px] uppercase tracking-wide font-bold font-mono text-zinc-400">{text}</span>
      </div>
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => {
        if (isRunning) {
          EventBus.publish("terminal:highlight", { agentId: agent.id });
        }
      }}
      className={`glass-panel p-3 flex flex-col justify-between gap-3 transition-all duration-250 relative min-h-[195px] overflow-visible select-none hover:-translate-y-0.5 ${
        isRunning ? "cursor-pointer border-accent-primary/25 bg-accent-primary/[0.02] shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_12px_rgba(245,158,11,0.05)]" : "border-border-glass hover:border-border-glass-hover bg-white/[0.03] shadow-sm hover:shadow-md hover:border-zinc-700/60"
      } ${
        isHighlighted
          ? "border-accent-primary shadow-[0_0_12px_rgba(245,158,11,0.2)] bg-accent-primary/[0.03]"
          : ""
      } ${isDragging ? "shadow-2xl border-accent-primary/40 opacity-80" : ""} ${showDropdown ? "z-40" : "z-10"}`}
    >
      {/* 1. TOP HEADER ZONE */}
      <div className="flex items-start gap-1.5 flex-shrink-0 min-w-0">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-zinc-550 hover:text-accent-primary p-0.5 rounded transition-colors flex-shrink-0 touch-none mt-[1.5px]"
          title="Drag to reorder"
        >
          <GripVertical size={11} />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-bold text-zinc-100 truncate block leading-snug" title={agent.name}>
            🤖 {agent.name}
          </span>
          <span className="text-[9.5px] text-zinc-500 truncate block font-sans mt-0.5">
            {agent.role || agent.groupId || "AI Coding Assistant"}
          </span>
        </div>
      </div>

      {/* 2. CAPABILITIES */}
      <div className="flex flex-wrap gap-1">
        {agent.capabilities.coding && (
          <span className="text-[8.5px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
            ⌨️ Coding
          </span>
        )}
        {agent.capabilities.review && (
          <span className="text-[8.5px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
            🔍 Review
          </span>
        )}
        {agent.capabilities.planning && (
          <span className="text-[8.5px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
            🧠 Planning
          </span>
        )}
        {agent.capabilities.testing && (
          <span className="text-[8.5px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
            🧪 Testing
          </span>
        )}
      </div>

      {/* 3. METRICS ROW */}
      <div className="grid grid-cols-3 gap-1 text-center bg-white/[0.01] border border-border-glass/30 rounded-md p-1.5 flex-shrink-0 select-none">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[8px] uppercase font-bold text-zinc-555 font-sans tracking-wide truncate">Tasks</span>
          <span className="text-[11px] font-semibold text-zinc-200 truncate">{tasksCount}</span>
        </div>
        <div className="flex flex-col gap-0.5 border-x border-border-glass/35 min-w-0">
          <span className="text-[8px] uppercase font-bold text-zinc-555 font-sans tracking-wide truncate">Tokens</span>
          <span className="text-[11px] font-semibold text-zinc-200 truncate">
            {isRunning ? "12K" : "84K"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[8px] uppercase font-bold text-zinc-555 font-sans tracking-wide truncate">Activity</span>
          <span className="text-[11px] font-semibold text-zinc-200 truncate">
            {isRunning ? formatRuntime(agent.runtimeSeconds) : formatLastActiveHours(agent.lastActive)}
          </span>
        </div>
      </div>

      {/* 4. FOOTER ZONE */}
      <div className="flex flex-col gap-2.5 flex-shrink-0">
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
                className="glass-input text-[9.5px] text-zinc-200 font-semibold font-mono rounded !pl-1.5 !pr-6 !py-0.5 outline-none cursor-pointer max-w-[120px] truncate"
              >
                <option value="" className="bg-[#0c0c0e]">Unassigned</option>
                {activeProjects.map(p => (
                  <option key={p.id} value={p.id} className="bg-[#0c0c0e]">{p.name}</option>
                ))}
              </select>
              <span className="text-[8.5px] text-zinc-500 font-sans mt-0.5">
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
              <span className="text-[11px] font-semibold text-zinc-200 group-hover/proj:text-accent-primary transition-colors truncate block">
                {proj ? proj.name : "Unassigned"}
              </span>
              <span className="text-[9px] text-zinc-500 font-sans">
                Current Project
              </span>
            </div>
          )}

          {/* Moved Status Pill here next to project details */}
          {renderStatusIndicator(agent.status)}
        </div>

        {/* Card Footer Actions */}
        <div className="mt-4 pt-3 border-t border-border-glass flex flex-col gap-2 relative">
          <div className="flex items-center justify-between gap-2">
            {/* Main Action Button */}
            <div className="flex-1">
              {isRunning ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop(agent);
                  }}
                  className="glass-button glass-button--danger w-full flex items-center justify-center gap-1 h-[34px] text-[10px] font-bold tracking-wide transition-all shadow-glow-error cursor-pointer"
                >
                  <Square size={8} className="fill-current" />
                  Stop Agent
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart(agent);
                  }}
                  className="w-full flex items-center justify-center gap-1 h-[34px] text-[10px] font-bold tracking-wide text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded transition-all transform hover:scale-[1.01] shadow-[0_0_10px_rgba(245,158,11,0.15)] hover:shadow-[0_0_16px_rgba(245,158,11,0.3)] cursor-pointer"
                >
                  <Play size={8} className="fill-current" />
                  Launch Agent
                </button>
              )}
            </div>

            {/* Quick Actions Menu Trigger */}
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
                  
                  // Position to the right of the button by default
                  let xPos = rect.right + 8;
                  // If it goes off the right edge, position to the left instead
                  if (xPos + popupWidth > window.innerWidth) {
                    xPos = rect.left - popupWidth - 8;
                  }

                  // Align top of popup with top of button by default
                  let yPos = rect.top;
                  // If it goes off the bottom edge, shift it up
                  if (yPos + popupHeight > window.innerHeight) {
                    yPos = window.innerHeight - popupHeight - 12; // 12px padding from bottom
                  }

                  setDropdownPos({ x: xPos, y: yPos });
                  setShowDropdown(true);
                }}
                className={`p-2 rounded border border-border-glass h-[34px] w-[34px] flex items-center justify-center transition-colors cursor-pointer ${showDropdown ? 'bg-white/10 text-zinc-200' : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-200'}`}
                title="More Actions"
              >
                <MoreVertical size={12} />
              </button>
            </div>
          </div>
            
          {showDropdown && dropdownPos && createPortal(
            <>
              {/* Invisible backdrop to catch clicks outside */}
              <div 
                className="fixed inset-0 z-[9998]" 
                onPointerDown={(e) => { 
                  e.stopPropagation(); 
                  setShowDropdown(false); 
                }}
              />
              <div 
                ref={dropdownRef}
                className="fixed bg-[#18181b] shadow-[0_0_24px_rgba(0,0,0,0.8)] p-1.5 text-[10px] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 border border-border-glass/60 rounded-md z-[9999]"
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
                  className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Edit2 size={10} className="text-zinc-400" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDropdown(false);
                    onDuplicate();
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Copy size={10} className="text-zinc-400" />
                  <span>Duplicate Profile</span>
                </button>
                {isRunning && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onRestart();
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <RotateCcw size={10} className="text-zinc-400" />
                    <span>Restart Agent</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowDropdown(false);
                    onOpenLogs();
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <FileText size={10} className="text-zinc-400" />
                  <span>Open Logs</span>
                </button>
                <div className="h-px bg-border-glass/40 my-0.5" />
                <button
                  type="button"
                  onClick={() => {
                    setShowDropdown(false);
                    onDelete(agent.id);
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-rose-500/10 rounded text-rose-400 flex items-center gap-2 cursor-pointer transition-colors"
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
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AgentGrid – Main Container
// ─────────────────────────────────────────────────────────────────────────────
export const AgentGrid: React.FC = () => {
  const projects = useOrchestratorStore((s) => s.projects);
  const agents = useOrchestratorStore((s) => s.agents);
  const tasks = useOrchestratorStore((s) => s.tasks);
  const deleteAgent = useOrchestratorStore((s) => s.deleteAgent);
  const updateAgent = useOrchestratorStore((s) => s.updateAgent);
  const createAgent = useOrchestratorStore((s) => s.createAgent);
  const spawnTerminal = useOrchestratorStore((s) => s.spawnTerminal);
  const killTerminal = useOrchestratorStore((s) => s.killTerminal);
  const activeWorkspaceId = useOrchestratorStore((s) => s.activeWorkspaceId);
  const cliInstalledStatuses = useOrchestratorStore(
    (s) => s.cliInstalledStatuses
  );
  const checkAgentCli = useOrchestratorStore((s) => s.checkAgentCli);
  const showAlertDialog = useOrchestratorStore((s) => s.showAlertDialog);

  const [selectedProjectFilter, setSelectedProjectFilter] = useState("");
  const [selectedInstallGuide, setSelectedInstallGuide] = useState<string | null>(null);

  // dnd-kit drag-over tracking for highlight effect
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // ── dnd-kit sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeProjects = projects.filter(
    (p: Project) => p.workspaceId === activeWorkspaceId
  );

  // Run CLI installation checks on load
  useEffect(() => {
    if (activeWorkspaceId) {
      const plugins = PluginRegistry.getAll();
      for (const plugin of plugins) {
        checkAgentCli(plugin.id);
      }
    }
  }, [activeWorkspaceId, checkAgentCli]);

  // ── dnd-kit handlers ──
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

  const handleStartAgent = async (agent: AgentProfile) => {
    if (!agent.projectId) {
      showAlertDialog(
        "Project Required",
        "Please assign a project to this agent first before launching."
      );
      return;
    }
    await spawnTerminal(agent.projectId, agent.id);
  };

  const handleStopAgent = async (agent: AgentProfile) => {
    if (agent.terminalSessionIds.length > 0) {
      const terminals = [...agent.terminalSessionIds];
      for (const termId of terminals) {
        await killTerminal(termId);
      }
    }
  };

  const handleEditAgent = (agent: AgentProfile) => {
    const newName = prompt("Edit Agent Profile Name:", agent.name);
    if (newName !== null) {
      const newArgsStr = prompt("Edit CLI Arguments (comma-separated):", agent.arguments.join(", "));
      if (newArgsStr !== null) {
        const newArgs = newArgsStr.split(",").map(a => a.trim()).filter(a => a !== "");
        updateAgent(agent.id, {
          name: newName.trim() || agent.name,
          arguments: newArgs
        });
      }
    }
  };

  const handleDuplicateAgent = (agent: AgentProfile) => {
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
  };

  const handleRestartAgent = async (agent: AgentProfile) => {
    await handleStopAgent(agent);
    setTimeout(() => {
      handleStartAgent(agent);
    }, 400);
  };

  const handleOpenLogsAgent = (agent: AgentProfile) => {
    if (agent.status === "running") {
      EventBus.publish("terminal:highlight", { agentId: agent.id });
    } else {
      showAlertDialog("Agent Offline", "Terminal logs are only accessible for active running agents.");
    }
  };

  const formatRuntime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
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
      <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-555 glass-panel h-64 select-none">
        <Cpu size={32} className="text-zinc-755 mb-3" />
        <p className="text-xs font-mono">
          Create or select a workspace to manage agents.
        </p>
      </div>
    );
  }

  // Filter agents array if selectedProjectFilter is set
  const filteredAgents = selectedProjectFilter
    ? agents.filter((a) => a.projectId === selectedProjectFilter)
    : agents;

  // Swarm metrics counts
  const runningAgentsCount = agents.filter((a) => a.status === "running").length;
  const idleAgentsCount = agents.filter((a) => a.status === "idle").length;
  const failedAgentsCount = agents.filter((a) => a.status === "error").length;
  const totalActiveProjects = activeProjects.length;

  return (
    <div className="flex flex-col h-full space-y-2 overflow-hidden pb-1">
      {/* CLI Spawner Panel at the top of the left panel */}
      <CliSpawnerPanel />

      {/* Swarm Summary Bar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 glass-panel bg-bg-secondary/40 select-none flex-shrink-0 text-[10px] font-mono border-border-glass/40">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-zinc-350 font-bold">{runningAgentsCount} <span className="text-zinc-550 font-sans font-normal lowercase">running</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500"></span>
          <span className="text-zinc-350 font-bold">{idleAgentsCount} <span className="text-zinc-550 font-sans font-normal lowercase">idle</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
          <span className="text-zinc-350 font-bold">{failedAgentsCount} <span className="text-zinc-550 font-sans font-normal lowercase">failed</span></span>
        </div>
        <div className="h-3 w-px bg-border-glass/40"></div>
        <div className="text-zinc-350 font-bold">
          {totalActiveProjects} <span className="text-zinc-555 font-sans font-normal lowercase">projects</span>
        </div>
      </div>

      {/* Filters and Sub-header */}
      <div className="flex items-center justify-between py-0.5 flex-shrink-0">
        <h3 className="text-[10px] uppercase font-bold tracking-wide text-zinc-500 font-mono select-none">
          Profiles Grid
        </h3>
        <div className="flex items-center gap-1">
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="glass-input text-[9px] text-zinc-300 font-semibold rounded !pl-1.5 !pr-6 !py-0 outline-none cursor-pointer max-w-[125px] truncate h-[22px] leading-none"
          >
            <option value="" className="bg-[#0c0c0e]">All Projects</option>
            {activeProjects.map((p: Project) => (
              <option key={p.id} value={p.id} className="bg-[#0c0c0e]">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Agents List – dnd-kit Sortable */}
      {filteredAgents.length === 0 ? (
        <div className="text-zinc-500 text-xs font-mono py-12 text-center border border-border-glass border-dashed rounded-lg bg-bg-secondary/20 flex-grow flex flex-col justify-center items-center gap-2">
          <span>No CLI agent profiles found.</span>
          <span className="text-[10px] text-zinc-605">Ready to launch a new swarm agent profile above.</span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragOver={(event) =>
            setDragOverId(event.over ? String(event.over.id) : null)
          }
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragOverId(null)}
        >
          <SortableContext
            items={filteredAgents.map((a) => a.id)}
            strategy={rectSortingStrategy}
          >
            <div className="flex-grow flex-1 overflow-y-auto min-h-0 pr-1 border border-border-glass rounded-lg bg-bg-primary/20 p-1.5 grid grid-cols-2 gap-2 auto-rows-max">
              {filteredAgents.map((agent: AgentProfile) => {
                const proj = activeProjects.find(
                  (p: Project) => p.id === agent.projectId
                );
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
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* CLI Installation Guide Popup Modal */}
      {selectedInstallGuide &&
        (() => {
          const plugin = PluginRegistry.get(selectedInstallGuide);
          return (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center font-mono">
              <div className="glass-modal p-5 w-[380px] shadow-2xl space-y-4">
                <div className="border-b border-border-glass pb-2 flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    CLI Setup Instructions
                  </h3>
                  <span className="text-[10px] text-zinc-500 font-bold bg-white/5 border border-border-glass px-1.5 rounded uppercase">
                    {selectedInstallGuide}
                  </span>
                </div>

                <div className="space-y-3 text-[11px] leading-relaxed">
                  <p className="text-zinc-400">
                    {plugin?.installHelp.instructions}
                  </p>
                  {plugin?.installHelp.command && (
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase font-bold">
                        Copy Setup Command:
                      </span>
                      <div className="flex items-center justify-between bg-black/40 px-2.5 py-1.5 rounded border border-zinc-805 select-text">
                        <code className="text-zinc-305 font-mono text-[10px]">
                          {plugin.installHelp.command}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              plugin.installHelp.command
                            );
                            showAlertDialog(
                              "Clipboard Copy",
                              "Setup command copied to clipboard!"
                            );
                          }}
                          className="text-[9px] text-amber-400 hover:text-amber-300 transition-colors uppercase font-bold cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                  {plugin?.installHelp.url && (
                    <a
                      href={plugin.installHelp.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-[10px] text-amber-400 hover:underline font-bold"
                    >
                      Official Setup Documentation &rarr;
                    </a>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-border-glass">
                  <button
                    type="button"
                    onClick={() => setSelectedInstallGuide(null)}
                    className="glass-button text-[10px] py-1 px-4 rounded transition-colors font-bold uppercase cursor-pointer"
                  >
                    Close Guide
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};
