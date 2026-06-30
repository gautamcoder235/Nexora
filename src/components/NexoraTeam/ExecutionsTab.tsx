import React, { useEffect } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { Zap, Plus, RefreshCw, XCircle, CheckCircle2, Clock, Loader2, Shield } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface AgentRow { id: string; name: string; command: string; }

export const ExecutionsTab: React.FC = () => {
  const {
    executions,
    selectedExecutionId,
    isLaunchPanelOpen,
    selectExecution,
    setLaunchPanelOpen,
    loadExecutions,
    terminateExecution,
    filterStatus,
    setFilterStatus,
  } = useTeamStore();

  const [agents, setAgents] = React.useState<AgentRow[]>([]);

  useEffect(() => {
    loadExecutions();
    invoke<AgentRow[]>("get_all_agents").then(setAgents).catch(() => {});
  }, []);

  const runningCount = executions.filter(e => e.status === "running" || e.status === "validating").length;
  const pendingCount = executions.filter(e => e.merge_status === "pending_review").length;

  const filteredExecutions = filterStatus === "all"
    ? executions
    : executions.filter(e => {
        if (filterStatus === "pending_review") return e.merge_status === "pending_review";
        return e.status === filterStatus;
      });

  const getStatusIcon = (status: string, mergeStatus: string | null) => {
    if (mergeStatus === "pending_review") return <Shield className="w-3 h-3 text-amber-400" />;
    switch (status) {
      case 'running': return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />;
      case 'validating': return <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />;
      case 'completed': return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case 'failed': return <XCircle className="w-3 h-3 text-red-400" />;
      case 'terminated': return <XCircle className="w-3 h-3 text-zinc-500" />;
      default: return <Clock className="w-3 h-3 text-zinc-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'border-blue-500/20 bg-blue-500/5';
      case 'validating': return 'border-purple-500/20 bg-purple-500/5';
      case 'completed': return 'border-emerald-500/20 bg-emerald-500/5';
      case 'failed': return 'border-red-500/20 bg-red-500/5';
      default: return 'border-[#1B1B22] bg-[#0D0D10]/50';
    }
  };

  const filters: { label: string; value: typeof filterStatus }[] = [
    { label: 'All', value: 'all' },
    { label: 'Running', value: 'running' },
    { label: 'Review', value: 'pending_review' },
    { label: 'Completed', value: 'completed' },
    { label: 'Failed', value: 'failed' },
  ];

  return (
    <div className="h-full flex flex-col font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1B1B22] bg-[#121218]/50 flex-shrink-0 select-none">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-[#7C5CFF]" />
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Executions</span>
          {runningCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {runningCount} active
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
              {pendingCount} to review
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={loadExecutions}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1B1B22] bg-[#0D0D10]/30 flex-shrink-0 select-none">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            className={`text-[9px] font-bold px-2 py-1 rounded-md border transition-all cursor-pointer ${
              filterStatus === f.value
                ? 'bg-[#7C5CFF]/10 text-[#7C5CFF] border-[#7C5CFF]/30'
                : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/5'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Execution list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredExecutions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-600 text-[10px] font-mono">
            <Zap className="w-5 h-5 mb-2 text-zinc-700" />
            <span>No executions found</span>
          </div>
        ) : (
          filteredExecutions.map(exec => (
            <button
              key={exec.id}
              onClick={() => selectExecution(exec.id)}
              className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer hover:bg-white/[0.02] ${
                selectedExecutionId === exec.id
                  ? 'border-[#7C5CFF]/40 bg-[#7C5CFF]/5'
                  : getStatusColor(exec.status)
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {getStatusIcon(exec.status, exec.merge_status)}
                  <span className="text-[11px] font-semibold text-zinc-200 truncate">
                    {exec.task_title}
                  </span>
                </div>
                <span className="text-[8px] font-mono text-zinc-600 flex-shrink-0">
                  {exec.id.slice(0, 8)}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-1.5 text-[9px] text-zinc-500">
                <span>Agent: <strong className="text-zinc-400">{exec.agent_id || 'unassigned'}</strong></span>
                <span className="uppercase font-bold tracking-wider">{exec.status}</span>
                {exec.validation_steps_total > 0 && (
                  <span>Gates: {exec.validation_steps_passed}/{exec.validation_steps_total}</span>
                )}
              </div>

              {exec.current_gate && (
                <div className="mt-1 text-[9px] text-purple-400 font-mono">
                  ▸ {exec.current_gate}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ExecutionsTab;
