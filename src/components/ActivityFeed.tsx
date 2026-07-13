import React, { useState, useRef, useCallback, useMemo } from "react";
import { MessageSquare, AlertCircle, Info, Database, Play, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { useShallow } from "zustand/react/shallow";
import { ActivityLogSource, ActivityLogSeverity, ActivityLog } from "../types";

interface ActivityFeedProps {
  isExpanded: boolean;
  onToggle: () => void;
}

const ITEM_HEIGHT = 52; // avg px per log item
const OVERSCAN = 5;     // extra items rendered above/below viewport

export const ActivityFeed: React.FC<ActivityFeedProps> = React.memo(({ isExpanded, onToggle }) => {
  const { activityFeed, clearActivityFeed, activeWorkspaceId } = useOrchestratorStore(
    useShallow(s => ({
      activityFeed: s.activityFeed,
      clearActivityFeed: s.clearActivityFeed,
      activeWorkspaceId: s.activeWorkspaceId,
    }))
  );
  const [sourceFilter, setSourceFilter] = useState<ActivityLogSource | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<ActivityLogSeverity | 'all'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  const getSourceIcon = (source: ActivityLogSource) => {
    switch (source) {
      case 'agent':
        return <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />;
      case 'terminal':
        return <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />;
      case 'workspace':
        return <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />;
      case 'system':
      default:
        return <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 inline-block" />;
    }
  };

  const getLogColors = (log: ActivityLog) => {
    if (log.severity === 'error') {
      return "border-l-[#ef4444] text-[#fca5a5] bg-[#ef4444]/[0.02]";
    }
    if (log.severity === 'warning') {
      return "border-l-[#f59e0b] text-[#fde68a] bg-[#f59e0b]/[0.02]";
    }
    
    // Normal info logs
    switch (log.sourceType) {
      case 'agent':
        return "border-l-indigo-500 text-zinc-350 bg-[#6366f1]/[0.01]";
      case 'terminal':
        return "border-l-sky-500 text-zinc-350 bg-[#38bdf8]/[0.01]";
      case 'workspace':
        return "border-l-violet-500 text-zinc-350 bg-[#8b5cf6]/[0.01]";
      case 'system':
      default:
        return "border-l-zinc-700 text-zinc-400 bg-white/[0.005]";
    }
  };

  const filteredLogs = useMemo(() => activityFeed.filter(log => {
    const matchesSource = sourceFilter === 'all' || log.sourceType === sourceFilter;
    const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
    return matchesSource && matchesSeverity;
  }), [activityFeed, sourceFilter, severityFilter]);

  if (!activeWorkspaceId) {
    return null;
  }

  // Compute visible window for virtualization
  const totalHeight = filteredLogs.length * ITEM_HEIGHT;
  const containerHeight = 272; // ~h-72 = 18rem
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filteredLogs.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  );
  const visibleLogs = filteredLogs.slice(startIndex, endIndex);
  const offsetY = startIndex * ITEM_HEIGHT;

  return (
    <div className={`bg-[#07080f]/75 backdrop-blur-md border border-white/[0.04] rounded-xl flex flex-col h-full font-mono overflow-hidden transition-all duration-300 ${
      isExpanded ? 'p-3 space-y-2' : 'px-3 py-1.5 space-y-0 justify-center'
    }`}>
      {/* Title / Action bar */}
      <div className={`flex items-center justify-between select-none ${isExpanded ? 'border-b border-white/[0.04] pb-2' : ''}`}>
        <span 
          onClick={onToggle}
          className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:text-zinc-200 transition-colors"
          title={isExpanded ? "Collapse Feed" : "Expand Feed"}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Mission Control Activity
        </span>
        <div className="flex items-center gap-1.5">
          {isExpanded && activityFeed.length > 0 && (
            <button
              onClick={clearActivityFeed}
              title="Clear Log History"
              className="text-zinc-500 hover:text-rose-400 p-1 hover:bg-[#1a1a24] rounded transition-colors animate-fade-in"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={onToggle}
            title={isExpanded ? "Collapse Activity Feed" : "Expand Activity Feed"}
            className="text-zinc-550 hover:text-zinc-350 p-1 hover:bg-[#1a1a24] rounded transition-colors"
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
            className="bg-[#0c0d16] border border-white/[0.05] px-2 py-0.5 rounded text-zinc-450 cursor-pointer outline-none focus:border-indigo-500/40 transition-colors"
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
            className="bg-[#0c0d16] border border-white/[0.05] px-2 py-0.5 rounded text-zinc-450 cursor-pointer outline-none focus:border-indigo-500/40 transition-colors"
          >
            <option value="all">Severity: All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      )}

      {/* Virtualized Feed list */}
      {isExpanded && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0 select-text font-mono text-[10.5px] animate-fade-in scrollbar-thin"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-zinc-650 text-center py-8 text-[11px] select-none">
              No events match selected filters.
            </div>
          ) : (
            // Virtual scroller: outer div sets total scroll height; inner div offsets visible items
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
                {visibleLogs.map((log) => {
                  const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <div 
                      key={log.id} 
                      className={`h-10 flex items-center justify-between border-l-2 pl-3 pr-2 border-y border-r border-white/[0.02] mb-1.5 transition-colors select-text ${getLogColors(log)}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="flex-shrink-0 flex items-center">{getSourceIcon(log.sourceType)}</span>
                        
                        {log.agentId && (
                          <span className="text-[8px] bg-white/5 border border-white/5 text-zinc-450 px-1 py-0.5 rounded-sm font-semibold uppercase tracking-wider scale-95 shrink-0">
                            AGENT:{log.agentId.slice(0, 4)}
                          </span>
                        )}
                        <span className="truncate pr-2 text-zinc-300">{log.message}</span>
                      </div>
                      
                      <span className="text-zinc-600 select-none text-[9px] font-mono whitespace-nowrap text-right shrink-0">{time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

