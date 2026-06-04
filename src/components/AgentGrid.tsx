import React, { useState, useEffect } from "react";
import { Cpu, Play, Square, Trash2, Plus, Edit, AlertCircle, GripVertical } from "lucide-react";
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
import { AgentProfile, AgentCapabilities, Project } from "../types";
import { agentTemplates } from "../agents/templates";
import { PluginRegistry } from "../plugins";

// ─────────────────────────────────────────────────────────────────────────────
// Sortable Card Component
// ─────────────────────────────────────────────────────────────────────────────
interface SortableAgentCardProps {
  agent: AgentProfile;
  proj: Project | undefined;
  isRunning: boolean;
  pluginId: string;
  isInstalled: boolean;
  dragOverId: string | null;
  onStart: (agent: AgentProfile) => void;
  onStop: (agent: AgentProfile) => void;
  onEdit: (agent: AgentProfile) => void;
  onDelete: (agentId: string) => void;
  onShowInstallGuide: (pluginId: string) => void;
  formatRuntime: (seconds: number) => string;
}

const SortableAgentCard: React.FC<SortableAgentCardProps> = ({
  agent,
  proj,
  isRunning,
  pluginId,
  isInstalled,
  dragOverId,
  onStart,
  onStop,
  onEdit,
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    minHeight: "136px",
  };

  const isDropTarget = dragOverId === agent.id && !isDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-[#121214] border rounded-lg p-2.5 pb-3 flex flex-col justify-between shadow-md transition-colors ${
        isRunning
          ? "border-purple-500/40 bg-purple-500/[0.02]"
          : "border-[#232329] hover:border-zinc-700"
      } ${
        isDropTarget
          ? "border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.25)] bg-purple-500/[0.04]"
          : ""
      } ${isDragging ? "shadow-2xl border-purple-400/60" : ""}`}
    >
      {/* 1. TOP HEADER ZONE */}
      <div className="flex items-start justify-between gap-2.5 flex-shrink-0">
        <div className="flex-1 min-w-0 flex items-start gap-1">
          {/* ── Drag Handle ── attach attributes + listeners ONLY here */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-purple-400 p-0.5 -mt-0.5 rounded transition-colors flex-shrink-0 touch-none"
            title="Drag to reorder"
          >
            <GripVertical size={12} />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-semibold text-zinc-200 flex items-start gap-1.5 leading-snug">
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
          <span
            className={`text-[8px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded font-mono ${
              agent.status === "running"
                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700"
            }`}
          >
            {agent.status}
          </span>
          {pluginId !== "generic" && (
            <button
              type="button"
              onClick={() => !isInstalled && onShowInstallGuide(pluginId)}
              className={`text-[8px] font-bold px-1.5 py-0.5 rounded font-mono border transition-all ${
                isInstalled
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
              }`}
              title={
                isInstalled ? "CLI tool available" : "Click to view install guide"
              }
            >
              {isInstalled ? "CLI OK" : "Install CLI"}
            </button>
          )}
        </div>
      </div>

      {/* 2. BODY MIDDLE ZONE */}
      <div className="flex-grow flex flex-col justify-center text-[9.5px] text-zinc-400 my-1.5">
        <p
          className="text-[9px] text-zinc-500 font-mono select-text truncate"
          title={`${agent.cliCommand} ${agent.arguments.join(" ")}`}
        >
          <span className="text-zinc-600">CMD:</span> {agent.cliCommand}{" "}
          {agent.arguments.join(" ")}
        </p>
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(agent.capabilities).map(([cap, val]) => {
            if (!val) return null;
            return (
              <span
                key={cap}
                className="text-[8px] bg-[#1e1e24] text-zinc-400 border border-zinc-800 px-1.5 py-0.5 rounded font-mono"
              >
                {cap}
              </span>
            );
          })}
        </div>
      </div>

      {/* 3. BOTTOM FOOTER ZONE */}
      <div className="border-t border-[#232329]/60 pt-1.5 flex items-center justify-between text-[10px] text-zinc-500 select-none flex-shrink-0">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] text-zinc-500 truncate max-w-[120px]">
            Project:{" "}
            <span className="text-zinc-300 font-semibold">
              {proj ? proj.name : "Unassigned"}
            </span>
          </span>
          {isRunning && (
            <span className="text-[9px] text-zinc-400 font-mono mt-0.5 block leading-tight">
              Run: {formatRuntime(agent.runtimeSeconds)}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          {isRunning ? (
            <button
              type="button"
              onClick={() => onStop(agent)}
              className="flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded text-[9px] transition-colors cursor-pointer"
            >
              <Square size={9} className="fill-rose-400/20" />
              Kill
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStart(agent)}
              className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded text-[9px] transition-colors cursor-pointer"
            >
              <Play size={9} className="fill-white" />
              Launch
            </button>
          )}

          <button
            type="button"
            onClick={() => onEdit(agent)}
            title="Edit Profile"
            className="p-0.5 hover:bg-[#1a1a20] rounded border border-[#232329] text-zinc-500 hover:text-purple-400 transition-colors cursor-pointer"
          >
            <Edit size={10} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(agent.id)}
            title="Delete Profile"
            className="p-0.5 hover:bg-[#1a1a20] rounded border border-[#232329] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
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
  const createAgent = useOrchestratorStore((s) => s.createAgent);
  const deleteAgent = useOrchestratorStore((s) => s.deleteAgent);
  const spawnTerminal = useOrchestratorStore((s) => s.spawnTerminal);
  const killTerminal = useOrchestratorStore((s) => s.killTerminal);
  const activeWorkspaceId = useOrchestratorStore((s) => s.activeWorkspaceId);
  const cliInstalledStatuses = useOrchestratorStore(
    (s) => s.cliInstalledStatuses
  );
  const checkAgentCli = useOrchestratorStore((s) => s.checkAgentCli);
  const spawnTeamTemplate = useOrchestratorStore((s) => s.spawnTeamTemplate);
  const updateAgent = useOrchestratorStore((s) => s.updateAgent);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsStr, setArgsStr] = useState("");
  const [group, setGroup] = useState("");
  const [targetProj, setTargetProj] = useState("");
  const [selectedTemplateProj, setSelectedTemplateProj] = useState("");

  // Capabilities
  const [coding, setCoding] = useState(true);
  const [review, setReview] = useState(false);
  const [testing, setTesting] = useState(false);
  const [planning, setPlanning] = useState(false);

  // Preset Role State
  const [role, setRole] = useState("custom");
  const [startupInstructionsStr, setStartupInstructionsStr] = useState("");
  const [selectedInstallGuide, setSelectedInstallGuide] = useState<
    string | null
  >(null);

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

  const handleRoleChange = (selectedRole: string) => {
    setRole(selectedRole);
    if (selectedRole === "frontend") {
      setName("Frontend Engineer");
      setGroup("Frontend Team");
      setCommand("npx");
      setArgsStr("@claudecode/cli --dangerously-skip-permissions");
      setCoding(true);
      setReview(false);
      setTesting(false);
      setPlanning(true);
      setStartupInstructionsStr("npm run lint");
    } else if (selectedRole === "backend") {
      setName("Backend Engineer");
      setGroup("Backend Team");
      setCommand("aider");
      setArgsStr("");
      setCoding(true);
      setReview(true);
      setTesting(false);
      setPlanning(false);
      setStartupInstructionsStr("cargo check");
    } else if (selectedRole === "qa") {
      setName("QA Engineer");
      setGroup("QA Team");
      setCommand("npx");
      setArgsStr("playwright test");
      setCoding(false);
      setReview(false);
      setTesting(true);
      setPlanning(false);
      setStartupInstructionsStr("npm run test");
    } else if (selectedRole === "architect") {
      setName("Architect");
      setGroup("Planning Team");
      setCommand("gemini");
      setArgsStr("");
      setCoding(false);
      setReview(true);
      setTesting(false);
      setPlanning(true);
      setStartupInstructionsStr("git status");
    }
  };

  const handleSpawnTemplate = async (templateId: string) => {
    const projId =
      selectedTemplateProj || activeProjects[0]?.id;
    if (!projId) {
      alert(
        "Please select or create a project first before spawning a team template."
      );
      return;
    }
    await spawnTeamTemplate(projId, templateId);
  };

  const handleEditClick = (agent: AgentProfile) => {
    setEditingAgentId(agent.id);
    setName(agent.name);
    setCommand(agent.cliCommand);
    setArgsStr(agent.arguments.join(" "));
    setGroup(agent.groupId || "");
    setTargetProj(agent.projectId || "");
    setCoding(agent.capabilities.coding);
    setTesting(agent.capabilities.testing);
    setReview(agent.capabilities.review);
    setPlanning(agent.capabilities.planning);
    setRole(agent.role || "custom");
    setStartupInstructionsStr(
      (agent.startupInstructions || []).join("\n")
    );
    setShowAddForm(true);
  };

  const resetForm = () => {
    setName("");
    setCommand("");
    setArgsStr("");
    setGroup("");
    setTargetProj("");
    setCoding(true);
    setReview(false);
    setTesting(false);
    setPlanning(false);
    setRole("custom");
    setStartupInstructionsStr("");
    setShowAddForm(false);
    setEditingAgentId(null);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    const parsedArgs = argsStr.trim() ? argsStr.split(/\s+/) : [];
    const capabilities: AgentCapabilities = {
      coding,
      review,
      testing,
      planning,
    };
    const parsedStartup = startupInstructionsStr.trim()
      ? startupInstructionsStr
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    if (editingAgentId) {
      await updateAgent(editingAgentId, {
        name,
        groupId: group.trim() || undefined,
        cliCommand: command,
        arguments: parsedArgs,
        projectId: targetProj || null,
        capabilities,
        role,
        startupInstructions: parsedStartup,
      });
    } else {
      await createAgent({
        name,
        groupId: group.trim() || undefined,
        cliCommand: command,
        arguments: parsedArgs,
        env: {},
        projectId: targetProj || null,
        taskId: null,
        capabilities,
        role,
        startupInstructions: parsedStartup,
      });
    }

    resetForm();
  };

  const handleStartAgent = async (agent: AgentProfile) => {
    if (!agent.projectId) {
      alert("Please assign a project to this agent first.");
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
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-purple-400" />
          <h2 className="text-xs uppercase font-bold tracking-wider text-zinc-400 font-mono">
            Active Swarm Profiles
          </h2>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 text-xs py-1 px-3.5 rounded transition-all"
        >
          <Plus size={13} />
          Register Agent
        </button>
      </div>

      {/* Add/Edit Agent Dialog */}
      {showAddForm && (
        <form
          onSubmit={handleSubmitForm}
          className="bg-[#121214] border border-purple-500/20 p-5 rounded-lg space-y-4 shadow-xl"
        >
          <div className="border-b border-zinc-800 pb-2">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400">
              {editingAgentId
                ? "Edit Swarm Profile"
                : "Register New Swarm Agent"}
            </h3>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-zinc-500 uppercase">
              Agent Role Preset
            </label>
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="w-full bg-[#0c0c0e] text-xs text-zinc-300 border border-[#232329] px-2 py-1.5 rounded outline-none cursor-pointer focus:border-purple-500/30"
            >
              <option value="custom">Custom Agent Setup</option>
              <option value="frontend">
                Frontend Engineer (Claude Code CLI)
              </option>
              <option value="backend">Backend Engineer (Aider CLI)</option>
              <option value="qa">QA Engineer (Playwright/Jest CLI)</option>
              <option value="architect">Architect (Gemini CLI)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase">
                Agent Profile Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Claude Coding Agent"
                className="w-full bg-[#0c0c0e] text-xs text-zinc-200 border border-[#232329] px-3 py-1.5 rounded outline-none focus:border-purple-500/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase">
                Agent Group (Team)
              </label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="e.g. Backend Dev"
                className="w-full bg-[#0c0c0e] text-xs text-zinc-200 border border-[#232329] px-3 py-1.5 rounded outline-none focus:border-purple-500/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase">
                CLI Command / Executable
              </label>
              <input
                type="text"
                required
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. npx, aider, python"
                className="w-full bg-[#0c0c0e] text-xs text-zinc-200 border border-[#232329] px-3 py-1.5 rounded outline-none focus:border-purple-500/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase">
                Arguments (space separated)
              </label>
              <input
                type="text"
                value={argsStr}
                onChange={(e) => setArgsStr(e.target.value)}
                placeholder="e.g. @claudecode/cli --dangerously-skip-permissions"
                className="w-full bg-[#0c0c0e] text-xs text-zinc-200 border border-[#232329] px-3 py-1.5 rounded outline-none focus:border-purple-500/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase">
                Assigned Project
              </label>
              <select
                value={targetProj}
                onChange={(e) => setTargetProj(e.target.value)}
                className="w-full bg-[#0c0c0e] text-xs text-zinc-300 border border-[#232329] px-2 py-2 rounded outline-none cursor-pointer focus:border-purple-500/30"
              >
                <option value="">-- Unassigned --</option>
                {activeProjects.map((p: Project) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Capabilities Checkboxes */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                Capabilities Routing
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer hover:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={coding}
                    onChange={(e) => setCoding(e.target.checked)}
                    className="rounded border-zinc-700 bg-transparent text-purple-500 focus:ring-0 focus:ring-offset-0"
                  />
                  Coding
                </label>
                <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer hover:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={testing}
                    onChange={(e) => setTesting(e.target.checked)}
                    className="rounded border-zinc-700 bg-transparent text-purple-500 focus:ring-0 focus:ring-offset-0"
                  />
                  Testing
                </label>
                <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer hover:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={review}
                    onChange={(e) => setReview(e.target.checked)}
                    className="rounded border-zinc-700 bg-transparent text-purple-500 focus:ring-0 focus:ring-offset-0"
                  />
                  Review
                </label>
                <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer hover:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={planning}
                    onChange={(e) => setPlanning(e.target.checked)}
                    className="rounded border-zinc-700 bg-transparent text-purple-500 focus:ring-0 focus:ring-offset-0"
                  />
                  Planning
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-zinc-500 uppercase">
              Startup Instructions (commands executed sequentially on shell PTY
              boot, one per line)
            </label>
            <textarea
              value={startupInstructionsStr}
              onChange={(e) => setStartupInstructionsStr(e.target.value)}
              placeholder={`e.g.\nnpm install\nnpm run lint`}
              rows={3}
              className="w-full bg-[#0c0c0e] text-xs text-zinc-200 border border-[#232329] px-3 py-1.5 rounded outline-none focus:border-purple-500/30 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={resetForm}
              className="bg-transparent hover:bg-[#1a1a20] text-zinc-400 text-xs py-1.5 px-4 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-1.5 px-4 rounded transition-colors"
            >
              {editingAgentId ? "Update Swarm Profile" : "Register Executable"}
            </button>
          </div>
        </form>
      )}

      {/* Team Presets Selection Bar */}
      <div className="bg-[#121214] border border-[#232329] p-2.5 rounded-lg space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
              Agent Team Presets
            </h3>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
              Spawn standard multi-agent setups in one click.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400 font-mono">
              Target Project:
            </span>
            <select
              value={selectedTemplateProj || activeProjects[0]?.id || ""}
              onChange={(e) => setSelectedTemplateProj(e.target.value)}
              className="bg-[#0c0c0e] text-xs text-zinc-300 border border-[#232329] px-2 py-1 rounded outline-none cursor-pointer focus:border-purple-500/30"
            >
              {activeProjects.map((p: Project) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {activeProjects.length === 0 && (
                <option value="">No projects available</option>
              )}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {agentTemplates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => handleSpawnTemplate(tpl.id)}
              disabled={activeProjects.length === 0}
              className="flex flex-col justify-between items-start text-left bg-[#0c0c0e] hover:bg-[#16161a] disabled:opacity-50 disabled:hover:bg-[#0c0c0e] border border-[#232329] hover:border-purple-500/30 p-2.5 rounded transition-all group w-full min-h-[72px] cursor-pointer"
            >
              <span className="text-[11px] font-bold text-zinc-300 group-hover:text-purple-400 transition-colors font-mono leading-snug">
                {tpl.name}
              </span>
              <span className="text-[9.5px] text-zinc-500 font-mono mt-1.5 leading-snug">
                {tpl.description}
              </span>
            </button>
          ))}
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
                    isRunning={isRunning}
                    pluginId={pluginId}
                    isInstalled={isInstalled}
                    dragOverId={dragOverId}
                    onStart={handleStartAgent}
                    onStop={handleStopAgent}
                    onEdit={handleEditClick}
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
                            alert("Setup command copied!");
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
