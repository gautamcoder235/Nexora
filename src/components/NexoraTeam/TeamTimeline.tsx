import React, { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { SystemEventType } from '../../types/events';
import { Info, AlertTriangle, AlertCircle, CheckCircle, ArrowRightLeft, FileCode, Search, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const TeamTimeline: React.FC = () => {
  const { systemEvents } = useTeamStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const getEventIcon = (type: SystemEventType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-3.5 h-3.5 text-[#22C55E]" />;
      case 'warning':
      case 'quarantine_alert':
        return <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-[#EF4444]" />;
      case 'task_transfer':
      case 'review_request':
        return <ArrowRightLeft className="w-3.5 h-3.5 text-[#7C5CFF]" />;
      case 'lock_acquired':
      case 'lock_released':
        return <FileCode className="w-3.5 h-3.5 text-[#3B82F6]" />;
      case 'validation_trigger':
        return <ShieldCheck className="w-3.5 h-3.5 text-[#3B82F6]" />;
      default:
        return <Info className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const getEventColor = (type: SystemEventType) => {
    switch (type) {
      case 'success':
        return 'text-emerald-300 border-[#22C55E]/15 bg-[#22C55E]/5';
      case 'warning':
      case 'quarantine_alert':
        return 'text-amber-300 border-[#F59E0B]/15 bg-[#F59E0B]/5';
      case 'error':
        return 'text-rose-300 border-[#EF4444]/15 bg-[#EF4444]/5';
      default:
        return 'text-zinc-300 border-[#1B1B22] bg-[#0D0D10]/30';
    }
  };

  const filteredEvents = systemEvents
    .filter(event => {
      if (filterType !== 'all' && event.type !== filterType) return false;
      if (searchTerm.trim() === '') return true;
      return event.message.toLowerCase().includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="flex flex-col h-full bg-[#121218]/30 overflow-hidden font-mono text-[10px]">
      {/* Search and Filters */}
      <div className="p-3 border-b border-[#1B1B22] bg-[#121218]/50 flex items-center gap-2.5 flex-shrink-0 select-none">
        <div className="relative flex-1">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search timeline..."
            className="w-full bg-[#0D0D10] border border-[#1B1B22] rounded px-7 py-1.5 text-[9px] text-zinc-300 placeholder-zinc-650 focus:outline-none focus:border-[#7C5CFF]/50"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-[#0D0D10] border border-[#1B1B22] rounded px-2 py-1.5 text-[9px] text-zinc-300 focus:outline-none focus:border-[#7C5CFF]/50 cursor-pointer"
        >
          <option value="all">All Events</option>
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="validation_trigger">Validation</option>
        </select>
      </div>

      {/* Logs View */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2 min-h-0 select-text">
        <AnimatePresence initial={false}>
          {filteredEvents.length === 0 ? (
            <div className="h-full flex items-center justify-center p-4 text-zinc-600 italic">
              No matching events found in active cache.
            </div>
          ) : (
            filteredEvents.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className={`p-2.5 rounded-lg border leading-relaxed flex gap-2.5 items-start ${getEventColor(
                  event.type
                )}`}
              >
                {/* Event Icon */}
                <div className="flex-shrink-0 mt-0.5">{getEventIcon(event.type)}</div>
                
                {/* Event Details */}
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-500 mr-2 flex-shrink-0 select-none">
                    [{new Date(event.timestamp).toLocaleTimeString()}]
                  </span>
                  <span className="break-words select-text">{event.message}</span>
                  {event.agentId && (
                    <span className="ml-2 text-[8px] bg-[#0D0D10] px-1.5 py-0.5 rounded text-zinc-400 border border-[#1B1B22]">
                      agent: {event.agentId}
                    </span>
                  )}
                  {event.taskId && (
                    <span className="ml-2 text-[8px] bg-[#0D0D10] px-1.5 py-0.5 rounded text-zinc-400 border border-[#1B1B22]">
                      task: {event.taskId}
                    </span>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
export default TeamTimeline;
