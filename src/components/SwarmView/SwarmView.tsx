import React, { useEffect, useRef } from "react";
import { Zap, Plus, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSwarmStore } from "../../stores/swarmStore";
import { createExecutionEvents } from "../../services/ExecutionEvents";
import { ExecutionList } from "./ExecutionList";
import { LaunchExecutionPanel } from "./LaunchExecutionPanel";
import { ExecutionReviewWorkspace } from "../ExecutionReview/ExecutionReviewWorkspace";

interface AgentRow { id: string; name: string; command: string; }

export function SwarmView() {
  const {
    executions,
    selectedExecutionId,
    isLaunchPanelOpen,
    selectExecution,
    setLaunchPanelOpen,
    loadExecutions,
  } = useSwarmStore();

  const [agents, setAgents] = React.useState<AgentRow[]>([]);

  useEffect(() => {
    // Load agents for the launch form
    invoke<AgentRow[]>("get_all_agents").then(setAgents).catch(() => {});
  }, []);

  const runningCount = executions.filter(e => e.status === "running" || e.status === "validating").length;
  const pendingCount = executions.filter(e => e.merge_status === "pending_review").length;

  return (
    <div className="flex flex-col h-full glass-panel overflow-hidden shadow-sm font-sans">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-glass flex-shrink-0 select-none">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-accent-primary" />
          <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">Swarm Executions</span>

          {runningCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
              {runningCount} running
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary border border-accent-primary/30 animate-pulse">
              {pendingCount} to review
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={loadExecutions}
            className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw size={11} />
          </button>
          <button
            onClick={() => setLaunchPanelOpen(!isLaunchPanelOpen)}
            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border transition-all cursor-pointer ${
              isLaunchPanelOpen
                ? "bg-accent-primary/10 text-accent-primary border-accent-primary/30"
                : "glass-button text-zinc-400 border-border-glass hover:text-zinc-200"
            }`}
          >
            <Plus size={11} />
            Launch
          </button>
        </div>
      </div>

      {/* Main 3-column body */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Left: Execution list (fixed width) */}
        <div className="w-[260px] flex-shrink-0 border-r border-border-glass overflow-hidden flex flex-col">
          <ExecutionList
            executions={executions}
            selectedId={selectedExecutionId}
            onSelect={selectExecution}
          />
        </div>

        {/* Center: Review workspace (grows) */}
        <div className="flex-1 overflow-hidden">
          <ExecutionReviewWorkspace
            executionId={selectedExecutionId}
            onClose={() => selectExecution(null)}
          />
        </div>

        {/* Right: Launch panel (slide-in, fixed width when open) */}
        {isLaunchPanelOpen && (
          <div className="w-[320px] flex-shrink-0 border-l border-border-glass overflow-hidden flex flex-col">
            <LaunchExecutionPanel
              onClose={() => setLaunchPanelOpen(false)}
              agents={agents}
            />
          </div>
        )}
      </div>
    </div>
  );
}
