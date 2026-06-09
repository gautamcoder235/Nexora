import { useState } from "react";
import { X, ChevronRight, FolderOpen, Tag, Bot, Plus, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { swarmApi } from "../../services/ExecutionEvents";
import { useSwarmStore } from "../../stores/swarmStore";

interface AgentOption { id: string; name: string; command: string; }

interface Step1Data {
  repoPath: string;
  taskTitle: string;
  taskDescription: string;
  agentId: string;
  allowedPatterns: string[];
}

const defaultStep1: Step1Data = {
  repoPath: "",
  taskTitle: "",
  taskDescription: "",
  agentId: "claude",
  allowedPatterns: ["src/**"],
};

interface Props {
  onClose: () => void;
  agents: AgentOption[];
  draft?: any; // We'll type this as ExecutionDraft if available, any is fine for now
}

export function LaunchExecutionPanel({ onClose, agents, draft }: Props) {
  const { loadExecutions, loadDrafts, discardDraft } = useSwarmStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState<Step1Data>(() => {
    if (draft) {
      return {
        repoPath: draft.repo_path || "",
        taskTitle: draft.task_title || "",
        taskDescription: draft.task_description || "",
        agentId: draft.agent_id || "claude",
        allowedPatterns: draft.allowed_patterns ? JSON.parse(draft.allowed_patterns) : ["src/**"],
      };
    }
    return defaultStep1;
  });
  const [patternInput, setPatternInput] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectFolder = async () => {
    try {
      const path = await invoke<string | null>("select_folder");
      if (path) setData(d => ({ ...d, repoPath: path }));
    } catch {}
  };

  const addPattern = () => {
    if (!patternInput.trim()) return;
    setData(d => ({ ...d, allowedPatterns: [...d.allowedPatterns, patternInput.trim()] }));
    setPatternInput("");
  };

  const removePattern = (i: number) => {
    setData(d => ({ ...d, allowedPatterns: d.allowedPatterns.filter((_, idx) => idx !== i) }));
  };

  const canProceed = data.repoPath && data.taskTitle && data.agentId;

  const handleSaveDraft = async () => {
    await swarmApi.saveDraft({
      repo_name: data.repoPath.split(/[\\/]/).pop() || "repo",
      repo_path: data.repoPath,
      task_title: data.taskTitle,
      task_description: data.taskDescription,
      agent_id: data.agentId,
      allowed_patterns: data.allowedPatterns,
    });
    await loadDrafts();
    onClose();
  };

  const handleLaunch = async () => {
    if (!canProceed) return;
    setIsLaunching(true);
    setError(null);
    try {
      await invoke("start_task_execution", {
        repoName: data.repoPath.split(/[\\/]/).pop() || "repo",
        repoPath: data.repoPath,
        taskTitle: data.taskTitle,
        taskDescription: data.taskDescription,
        agentId: data.agentId,
        allowedPatterns: data.allowedPatterns,
      });
      await loadExecutions();
      
      // Delete draft ONLY after successful execution creation
      if (draft && draft.id) {
        await discardDraft(draft.id);
      }
      
      onClose();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setIsLaunching(false);
    }
  };

  const selectedAgent = agents.find(a => a.id === data.agentId);

  return (
    <div className="h-full flex flex-col bg-[#0d0d10] border-l border-[#1b1b22] text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1b1b22] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className={`px-1.5 py-0.5 rounded font-bold ${step === 1 ? "bg-purple-500/20 text-purple-300" : "text-zinc-600"}`}>
              1 Configure
            </span>
            <ChevronRight size={10} className="text-zinc-600" />
            <span className={`px-1.5 py-0.5 rounded font-bold ${step === 2 ? "bg-purple-500/20 text-purple-300" : "text-zinc-600"}`}>
              2 Confirm
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Repository */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Repository Path</label>
            <div className="flex gap-2">
              <input
                value={data.repoPath}
                onChange={e => setData(d => ({ ...d, repoPath: e.target.value }))}
                placeholder="/path/to/repo"
                className="flex-1 bg-[#121216] text-[11px] text-zinc-200 border border-[#232329] px-2.5 py-1.5 rounded outline-none focus:border-purple-500/40 font-mono"
              />
              <button
                onClick={selectFolder}
                className="px-2 py-1.5 bg-[#121216] border border-[#232329] rounded hover:border-purple-500/30 text-zinc-400 hover:text-purple-400 transition-colors"
                title="Browse"
              >
                <FolderOpen size={13} />
              </button>
            </div>
          </div>

          {/* Task */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Task Title</label>
            <input
              value={data.taskTitle}
              onChange={e => setData(d => ({ ...d, taskTitle: e.target.value }))}
              placeholder="e.g. Add dark mode toggle"
              className="w-full bg-[#121216] text-[11px] text-zinc-200 border border-[#232329] px-2.5 py-1.5 rounded outline-none focus:border-purple-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Instructions (optional)</label>
            <textarea
              value={data.taskDescription}
              onChange={e => setData(d => ({ ...d, taskDescription: e.target.value }))}
              placeholder="Extra context for the agent..."
              rows={3}
              className="w-full bg-[#121216] text-[11px] text-zinc-200 border border-[#232329] px-2.5 py-1.5 rounded outline-none focus:border-purple-500/40 resize-none"
            />
          </div>

          {/* Agent */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Bot size={10} /> Agent
            </label>
            <select
              value={data.agentId}
              onChange={e => setData(d => ({ ...d, agentId: e.target.value }))}
              className="w-full bg-[#121216] text-[11px] text-zinc-200 border border-[#232329] px-2.5 py-1.5 rounded outline-none focus:border-purple-500/40"
            >
              {agents.map(a => (
                <option key={a.id} value={a.id} className="bg-[#121216]">{a.name} ({a.command})</option>
              ))}
            </select>
          </div>

          {/* File patterns */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Tag size={10} /> Allowed File Patterns
            </label>
            <div className="flex gap-2">
              <input
                value={patternInput}
                onChange={e => setPatternInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addPattern()}
                placeholder="src/** or tests/**"
                className="flex-1 bg-[#121216] text-[11px] text-zinc-200 border border-[#232329] px-2.5 py-1.5 rounded outline-none focus:border-purple-500/40 font-mono"
              />
              <button onClick={addPattern} className="px-2 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded text-purple-400 hover:bg-purple-500/20 transition-colors">
                <Plus size={13} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {data.allowedPatterns.map((p, i) => (
                <div key={i} className="flex items-center gap-1 bg-[#1a1a22] border border-[#2a2a35] rounded px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                  {p}
                  <button onClick={() => removePattern(i)} className="text-zinc-600 hover:text-red-400 ml-0.5 transition-colors">
                    <Trash2 size={9} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2 – Confirm */}
      {step === 2 && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-[11px] text-zinc-400">Review the configuration before launching the agent.</p>

          <div className="bg-[#121216] border border-[#1b1b22] rounded-lg p-4 space-y-3">
            <Row label="Repository" value={data.repoPath} mono />
            <Row label="Task" value={data.taskTitle} />
            {data.taskDescription && <Row label="Instructions" value={data.taskDescription} />}
            <Row label="Agent" value={`${selectedAgent?.name ?? data.agentId} (${selectedAgent?.command ?? ""})`} mono />
            <div>
              <div className="text-[9px] font-mono font-bold text-zinc-500 uppercase mb-1.5">Allowed Patterns</div>
              <div className="flex flex-wrap gap-1">
                {data.allowedPatterns.map((p, i) => (
                  <span key={i} className="text-[10px] font-mono bg-[#1a1a22] border border-[#2a2a35] px-2 py-0.5 rounded text-zinc-300">{p}</span>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-[#1b1b22] flex items-center justify-between flex-shrink-0">
        {step === 1 ? (
          <>
            <button onClick={handleSaveDraft} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
              Save as Draft
            </button>
            <button
              onClick={() => setStep(2)}
              disabled={!canProceed}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold text-[11px] px-4 py-1.5 rounded transition-colors"
            >
              Review & Launch <ChevronRight size={12} />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setStep(1)} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
              ← Back
            </button>
            <button
              onClick={handleLaunch}
              disabled={isLaunching}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold text-[11px] px-4 py-1.5 rounded transition-colors"
            >
              {isLaunching ? "Launching…" : "✓ Confirm Launch"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-mono font-bold text-zinc-500 uppercase mb-0.5">{label}</div>
      <div className={`text-[11px] text-zinc-200 break-all ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
