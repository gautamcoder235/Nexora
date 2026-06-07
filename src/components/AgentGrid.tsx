import React, { useState, useEffect } from "react";
import { Cpu, Play, Square, Trash2, AlertCircle, GripVertical } from "lucide-react";
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
  verticalListSortingStrategy,
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
  onStart: (agent: AgentProfile) => void;
  onStop: (agent: AgentProfile) => void;
  onProjectChange: (agentId: string, projectId: string) => void;

  onDelete: (agentId: string) => void;
  onShowInstallGuide: (pluginId: string) => void;
  formatRuntime: (seconds: number) => string;
}

export const SortableAgentCard: React.FC<SortableAgentCardProps> = ({
  agent,
  activeProjects,
  isRunning,
  pluginId,
  isInstalled,
  dragOverId,
  onStart,
  onStop,
  onProjectChange,

  onDelete,
  onShowInstallGuide,
  formatRuntime,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isHighlighted = dragOverId === agent.id && !isDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => {
        if (isRunning) {
          EventBus.publish("terminal:highlight", { agentId: agent.id });
        }
      }}
      className={`bg-[#08080c]/80 border rounded-lg p-3 flex flex-col justify-between shadow-sm transition-all duration-250 flex-shrink-0 ${
        isRunning ? "cursor-pointer hover:border-purple-500/50" : ""
      } ${
        isRunning
          ? "border-purple-500/30 bg-purple-500/[0.01]"
          : "border-[#1b1b22] hover:border-zinc-800"
      } ${
        isHighlighted
          ? "border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.2)] bg-purple-500/[0.03]"
          : ""
      } ${isDragging ? "shadow-xl border-purple-500/40" : ""}`}
    >
      {/* 1. TOP HEADER ZONE */}
      <div className="flex items-start justify-between gap-2.5 flex-shrink-0">
        <div className="flex-1 min-w-0 flex items-start gap-1">
          {/* ── Drag Handle ── */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-purple-400 p-0.5 -mt-0.5 rounded transition-colors flex-shrink-0 touch-none"
            title="Drag to reorder"
          >
            <GripVertical size={12} />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-[11.5px] font-bold text-zinc-200 flex items-start gap-1.5 leading-snug">
              <Cpu
                size={12}
                className={`flex-shrink-0 mt-[2px] ${
                  isRunning ? "text-purple-400" : "text-zinc-500"
                }`}
              />
              <span className="break-words select-text truncate block">
                {agent.name}
              </span>
            </h4>
            {agent.groupId && (
              <div className="mt-0.5">
                <span className="text-[8px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1 py-0.5 rounded-sm uppercase tracking-wide font-bold font-mono">
                  {agent.groupId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {agent.status === "running" && (
              <span className="text-[9px] text-zinc-500 font-mono border border-[#232329] px-1.5 py-0.5 rounded bg-[#16161a]">
                Run: {formatRuntime(agent.runtimeSeconds)}
              </span>
            )}
            <span
              className={`text-[8px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded font-mono ${
                agent.status === "running"
                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  : "bg-zinc-900 text-zinc-500 border border-[#1b1b22]"
              }`}
            >
              {agent.status}
            </span>
          </div>
          {pluginId !== "generic" && !isInstalled && (
            <button
              type="button"
              onClick={() => onShowInstallGuide(pluginId)}
              className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono border transition-all bg-amber-500/10 text-amber-450 border-amber-500/25 hover:bg-amber-500/20 cursor-pointer"
              title="Click to view install guide"
            >
              Install CLI
            </button>
          )}
        </div>
      </div>

      {/* 2. BODY MIDDLE ZONE */}
      <div className="flex-grow flex flex-col justify-center text-[9.5px] text-zinc-400 my-2">

        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(agent.capabilities).map(([cap, val]) => {
            if (!val) return null;
            return (
              <span
                key={cap}
                className="text-[8px] bg-[#101014] text-zinc-500 border border-[#1b1b22] px-1.5 py-0.5 rounded font-mono"
              >
                {cap}
              </span>
            );
          })}
        </div>
      </div>

      {/* 3. BOTTOM FOOTER ZONE */}
      <div className="border-t border-[#1b1b22]/50 pt-2 flex items-center justify-between text-[10px] text-zinc-550 select-none flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-zinc-500">Project:</span>
            <select
              value={agent.projectId || ""}
              onChange={(e) => onProjectChange(agent.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#121216] border border-[#232329] text-[9px] text-zinc-300 font-semibold rounded px-1 py-0.5 outline-none cursor-pointer hover:border-purple-500/50 focus:border-purple-500 transition-colors max-w-[120px] truncate"
            >
              <option value="">Unassigned</option>
              {activeProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        
        <div className="flex gap-1.5">
          {isRunning ? (
            <button
              type="button"
              onClick={() => onStop(agent)}
              className="flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/20 px-2 py-0.5 rounded text-[9px] transition-colors cursor-pointer"
            >
              <Square size={9} className="fill-rose-400/20" />
              Kill
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStart(agent)}
              className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-0.5 rounded text-[9px] transition-colors cursor-pointer font-semibold"
            >
              <Play size={9} className="fill-white" />
              Launch
            </button>
          )}

          <button
            type="button"
            onClick={() => onDelete(agent.id)}
            title="Delete Profile"
            className="p-1 hover:bg-[#121216] rounded border border-[#1b1b22] text-zinc-550 hover:text-rose-455 transition-colors cursor-pointer"
          >
            <Trash2 size={10} />
          </button>
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
  const deleteAgent = useOrchestratorStore((s) => s.deleteAgent);
  const updateAgent = useOrchestratorStore((s) => s.updateAgent);
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
        // Require 5 px of movement before a drag starts.
        // This lets single clicks on buttons fire normally.
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
      <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500 bg-[#0f0f11] rounded-lg border border-[#232329] h-64 select-none">
        <Cpu size={32} className="text-zinc-700 mb-3" />
        <p className="text-xs font-mono">
          Create or select a workspace to manage agents.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-2 overflow-hidden">
      {/* CLI Spawner Panel at the top of the left panel */}
      <CliSpawnerPanel />

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-purple-400" />
          <h2 className="text-xs uppercase font-bold tracking-wider text-zinc-400 font-mono">
            Active Swarm Profiles
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-400 font-mono">
            Target Project:
          </span>
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="bg-[#0c0c0e] text-xs text-zinc-300 border border-[#232329] px-2 py-1 rounded outline-none cursor-pointer focus:border-purple-500/30"
          >
            <option value="">All Projects</option>
            {activeProjects.map((p: Project) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Agents List – dnd-kit Sortable */}
      {agents.length === 0 ? (
        <div className="text-zinc-500 text-xs font-mono py-12 text-center border border-[#232329] border-dashed rounded-lg bg-[#0f0f11]/40 flex-grow">
          No CLI agent profiles registered in this workspace yet.
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
            items={agents.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex-grow flex-1 overflow-y-auto min-h-0 pr-1 border border-[#232329] rounded-lg bg-[#070709]/30 p-1.5 flex flex-col gap-2">
              {agents.map((agent: AgentProfile) => {
                const proj = activeProjects.find(
                  (p: Project) => p.id === agent.projectId
                );
                const isRunning = agent.status === "running";
                const pluginId = resolvePluginId(agent);
                const isInstalled = cliInstalledStatuses[pluginId] !== false;

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
                    onStart={handleStartAgent}
                    onStop={handleStopAgent}
                    onProjectChange={(agentId, projectId) => updateAgent(agentId, { projectId: projectId || null })}

                    onDelete={deleteAgent}
                    onShowInstallGuide={setSelectedInstallGuide}
                    formatRuntime={formatRuntime}
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
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center font-mono">
              <div className="bg-[#121214] border border-[#232329] rounded-lg p-5 w-[380px] shadow-2xl space-y-4">
                <div className="border-b border-[#232329] pb-2 flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    CLI Setup Instructions
                  </h3>
                  <span className="text-[10px] text-zinc-500 font-bold bg-[#1a1a20] border border-[#232329] px-1.5 rounded uppercase">
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
                      <div className="flex items-center justify-between bg-black/40 px-2.5 py-1.5 rounded border border-zinc-800 select-text">
                        <code className="text-zinc-300 font-mono text-[10px]">
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
                          className="text-[9px] text-purple-400 hover:text-purple-300 transition-colors uppercase font-bold"
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
                      className="inline-block text-[10px] text-purple-400 hover:underline font-bold"
                    >
                      Official Setup Documentation &rarr;
                    </a>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-[#232329]">
                  <button
                    type="button"
                    onClick={() => setSelectedInstallGuide(null)}
                    className="bg-[#232329] hover:bg-zinc-700 text-zinc-300 text-[10px] py-1 px-4 rounded transition-colors font-bold uppercase"
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
