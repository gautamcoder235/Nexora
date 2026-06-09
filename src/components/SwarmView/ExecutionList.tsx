import { GitMerge } from "lucide-react";
import { ExecutionSummary } from "../../services/ExecutionEvents";
import { useSwarmStore } from "../../stores/swarmStore";

interface Props {
  executions: ExecutionSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const GATE_NAMES = ["Snapshot", "Ownership", "Git", "Typecheck", "Lint", "Tests"];

function StatusDot({ status }: { status: string }) {
  const base = "w-2 h-2 rounded-full flex-shrink-0 mt-1";
  if (status === "completed") return <div className={`${base} bg-emerald-500`} />;
  if (status === "failed") return <div className={`${base} bg-red-500`} />;
  if (status === "running") return <div className={`${base} bg-amber-400 animate-pulse`} />;
  if (status === "validating") return <div className={`${base} bg-sky-400 animate-pulse`} />;
  if (status === "pending_review" || status === "approved" || status === "rejected")
    return <div className={`${base} bg-indigo-500`} />;
  if (status === "terminated") return <div className={`${base} bg-zinc-500`} />;
  return <div className={`${base} bg-zinc-600`} />;
}

function ValidationBar({ passed, total, current }: { passed: number; total: number; current: string | null }) {
  const gateTotal = Math.max(total, 6);
  return (
    <div className="mt-1.5">
      <div className="flex gap-[2px]">
        {GATE_NAMES.map((gate, i) => {
          const isDone = i < passed;
          const isActive = !isDone && current && gate.toLowerCase().startsWith(current.toLowerCase().slice(0, 3));
          return (
            <div
              key={gate}
              title={gate}
              className={`h-[3px] flex-1 rounded-full transition-colors ${
                isDone ? "bg-emerald-500" : isActive ? "bg-amber-400 animate-pulse" : "bg-zinc-700"
              }`}
            />
          );
        })}
      </div>
      {current && (
        <span className="text-[9px] text-zinc-500 mt-0.5 block">
          Gate {passed + 1}/{gateTotal} · {current} running…
        </span>
      )}
    </div>
  );
}

function timeAgo(ts: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function duration(start: string, end: string | null): string {
  if (!start) return "";
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const s = Math.floor((to - from) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function ExecutionList({ executions, selectedId, onSelect }: Props) {
  const { filterStatus, setFilter, terminateExecution, approveExecution, rejectExecution } = useSwarmStore();

  const filtered = filterStatus === "all"
    ? executions
    : filterStatus === "pending_review"
    ? executions.filter(e => e.merge_status === "pending_review")
    : executions.filter(e => e.status === filterStatus);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0c0c0e]">
      {/* Filter bar */}
      <div className="px-3 py-2 border-b border-[#1b1b22] flex items-center gap-1 flex-shrink-0 flex-wrap">
        {(["all", "running", "completed", "failed", "pending_review", "terminated"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-all ${
              filterStatus === f
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f === "pending_review" ? "Review" : f}
          </button>
        ))}
      </div>

      {/* Execution rows */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1 p-2">
        {filtered.length === 0 && (
          <div className="text-[10px] text-zinc-600 text-center py-8 font-mono">
            No executions yet
          </div>
        )}

        {filtered.map(exec => (
          <div
            key={exec.id}
            onClick={() => onSelect(exec.id)}
            className={`group relative rounded-md p-2.5 cursor-pointer border transition-all select-none ${
              selectedId === exec.id
                ? "border-purple-500/40 bg-purple-500/5"
                : "border-[#1b1b22] hover:border-purple-500/20 hover:bg-[#121218]"
            }`}
          >
            {/* Row header */}
            <div className="flex items-start gap-2">
              <StatusDot status={exec.status} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-zinc-200 truncate">{exec.task_title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-zinc-500 font-mono">{exec.agent_id}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-[9px] text-zinc-500">{duration(exec.started_at, exec.ended_at)}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-[9px] text-zinc-600">{timeAgo(exec.started_at)}</span>
                </div>

                {/* Validation gate bar */}
                {(exec.status === "validating") && (
                  <ValidationBar
                    passed={exec.validation_steps_passed}
                    total={exec.validation_steps_total}
                    current={exec.current_gate}
                  />
                )}

                {/* Merge status badge */}
                {exec.has_merge_candidate && exec.merge_status && (
                  <div className={`inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                    exec.merge_status === "pending_review"
                      ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/5"
                      : exec.merge_status === "approved"
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
                      : "text-zinc-500 border-zinc-700 bg-zinc-800/30"
                  }`}>
                    <GitMerge size={9} />
                    {exec.merge_status === "pending_review" ? "Pending Review" : exec.merge_status}
                  </div>
                )}
              </div>
            </div>

            {/* Context-sensitive inline actions */}
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              {exec.status === "running" && (
                <button
                  onClick={e => { e.stopPropagation(); terminateExecution(exec.id); }}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  title="Terminate execution"
                >
                  Kill
                </button>
              )}
              {exec.merge_status === "pending_review" && (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); rejectExecution(exec.id); }}
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); approveExecution(exec.id); }}
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
