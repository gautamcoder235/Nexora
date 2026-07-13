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
        return <CheckCircle className="w-3.5 h-3.5 text-success" />;
      case 'warning':
      case 'quarantine_alert':
        return <AlertTriangle className="w-3.5 h-3.5 text-warning animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-error" />;
      case 'task_transfer':
      case 'review_request':
        return <ArrowRightLeft className="w-3.5 h-3.5 text-accent-primary" />;
      case 'lock_acquired':
      case 'lock_released':
        return <FileCode className="w-3.5 h-3.5 text-accent-primary" />;
      case 'validation_trigger':
        return <ShieldCheck className="w-3.5 h-3.5 text-accent-primary" />;
      default:
        return <Info className="w-3.5 h-3.5 text-text-muted" />;
    }
  };

  const getEventColor = (type: SystemEventType) => {
    switch (type) {
      case 'success':
        return 'text-success border-success/15 bg-success/5';
      case 'warning':
      case 'quarantine_alert':
        return 'text-warning border-warning/15 bg-warning/5';
      case 'error':
        return 'text-error border-error/15 bg-error/5';
      default:
        return 'text-text-secondary border-border-glass bg-bg-tertiary/30';
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
    <div className="flex flex-col h-full bg-bg-primary/20 overflow-hidden font-mono text-[10px]">
      {/* Search and Filters */}
      <div className="p-3 border-b border-border-glass bg-bg-secondary/50 flex items-center gap-2.5 flex-shrink-0 select-none">
        <div className="relative flex-1">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search timeline..."
            className="w-full bg-bg-tertiary border border-border-glass rounded px-7 py-1.5 text-[9px] text-text-primary placeholder-text-muted/65 focus:outline-none focus:border-accent-primary/50"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-bg-tertiary border border-border-glass rounded px-2 py-1.5 text-[9px] text-text-primary focus:outline-none focus:border-accent-primary/50 cursor-pointer"
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
            <div className="h-full flex items-center justify-center p-4 text-text-muted italic">
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
                  <span className="text-text-muted mr-2 flex-shrink-0 select-none">
                    [{new Date(event.timestamp).toLocaleTimeString()}]
                  </span>
                  <span className="break-words select-text">{event.message}</span>
                  {event.agentId && (
                    <span className="ml-2 text-[8px] bg-bg-tertiary px-1.5 py-0.5 rounded text-text-secondary border border-border-glass">
                      agent: {event.agentId}
                    </span>
                  )}
                  {event.taskId && (
                    <span className="ml-2 text-[8px] bg-bg-tertiary px-1.5 py-0.5 rounded text-text-secondary border border-border-glass">
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
