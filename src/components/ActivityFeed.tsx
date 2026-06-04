import React, { useState } from "react";
import { MessageSquare, AlertCircle, Info, Database, Play, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { ActivityLogSource, ActivityLogSeverity, ActivityLog } from "../types";

interface ActivityFeedProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ isExpanded, onToggle }) => {
  const { activityFeed, clearActivityFeed, activeWorkspaceId } = useOrchestratorStore();
  const [sourceFilter, setSourceFilter] = useState<ActivityLogSource | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<ActivityLogSeverity | 'all'>('all');

  const getSourceIcon = (source: ActivityLogSource) => {
    switch (source) {
      case 'agent':
        return <MessageSquare size={12} className="text-purple-400" />;
      case 'terminal':
        return <Play size={12} className="text-sky-400" />;
      case 'workspace':
        return <Database size={12} className="text-amber-500" />;
      case 'system':
      default:
        return <Info size={12} className="text-zinc-500" />;
    }
  };

  const getLogColors = (log: ActivityLog) => {
    if (log.severity === 'error') {
      return "border-l-rose-500 bg-rose-500/[0.02] text-rose-400";
    }
    if (log.severity === 'warning') {
      return "border-l-amber-500 bg-amber-500/[0.01] text-amber-400";
    }
    
    // Normal info logs
    switch (log.sourceType) {
      case 'agent':
        return "border-l-purple-500 text-zinc-300";
      case 'terminal':
        return "border-l-sky-500 text-zinc-300";
      case 'workspace':
        return "border-l-amber-500 text-zinc-300";
      case 'system':
      default:
        return "border-l-zinc-700 text-zinc-400";
    }
  };

  const filteredLogs = activityFeed.filter(log => {
    const matchesSource = sourceFilter === 'all' || log.sourceType === sourceFilter;
    const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
    return matchesSource && matchesSeverity;
  });

  if (!activeWorkspaceId) {
    return null;
  }

  return (
    <div className={`bg-[#0c0c0e] border border-[#232329] rounded-lg flex flex-col h-full font-mono overflow-hidden transition-all duration-300 ${
      isExpanded ? 'p-2 space-y-1.5' : 'px-2 py-1 space-y-0 justify-center'
    }`}>
      {/* Title / Action bar */}
      <div className={`flex items-center justify-between select-none ${isExpanded ? 'border-b border-[#232329]/60 pb-1.5' : ''}`}>
        <span 
          onClick={onToggle}
          className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:text-zinc-200 transition-colors"
          title={isExpanded ? "Collapse Feed" : "Expand Feed"}
        >
          <AlertCircle size={13} className="text-emerald-400" />
          Mission Control Activity Feed
        </span>
        <div className="flex items-center gap-1.5">
          {isExpanded && activityFeed.length > 0 && (
            <button
              onClick={clearActivityFeed}
              title="Clear Log History"
              className="text-zinc-600 hover:text-rose-400 p-1 hover:bg-[#1a1a20] rounded transition-colors animate-fade-in"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={onToggle}
            title={isExpanded ? "Collapse Activity Feed" : "Expand Activity Feed"}
            className="text-zinc-500 hover:text-zinc-300 p-1 hover:bg-[#1a1a20] rounded transition-colors"
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {/* Filter Options */}
      {isExpanded && (
        <div className="flex gap-2 text-[10px] select-none pb-1 animate-fade-in">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="bg-[#121214] border border-[#232329] px-2 py-0.5 rounded text-zinc-400 cursor-pointer outline-none focus:border-zinc-700"
          >
            <option value="all">Source: All</option>
            <option value="agent">Agent</option>
            <option value="terminal">Terminal</option>
            <option value="workspace">Workspace</option>
            <option value="system">System</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="bg-[#121214] border border-[#232329] px-2 py-0.5 rounded text-zinc-400 cursor-pointer outline-none focus:border-zinc-700"
          >
            <option value="all">Severity: All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      )}

      {/* Feed list */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 select-text font-mono text-[10.5px] animate-fade-in">
          {filteredLogs.length === 0 ? (
            <div className="text-zinc-600 text-center py-8 text-xs select-none">
              No events match selected filters.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const time = new Date(log.timestamp).toLocaleTimeString();
              return (
                <div 
                  key={log.id} 
                  className={`p-2 rounded border-l-2 border-r border-t border-b border-[#232329]/60 flex items-start gap-2.5 leading-relaxed ${getLogColors(log)}`}
                >
                  <span className="text-zinc-600 select-none text-[9.5px] mt-0.5">{time}</span>
                  <span className="mt-0.5 select-none">{getSourceIcon(log.sourceType)}</span>
                  <div className="flex-1 min-w-0">
                    {log.agentId && (
                      <span className="text-purple-400 font-semibold mr-1.5 uppercase text-[9.5px]">
                        [agent:{log.agentId}]
                      </span>
                    )}
                    <span>{log.message}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
