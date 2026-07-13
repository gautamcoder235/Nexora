import React, { useState } from 'react';
import { ExecutionLogInfo } from '../../types/executionReview';

interface Props {
  logs: ExecutionLogInfo[];
}

export function ExecutionLogDrawer({ logs }: Props) {
  const [filter, setFilter] = useState<'All' | 'Info' | 'Warning' | 'Error'>('All');
  const [search, setSearch] = useState('');

  const filteredLogs = logs.filter(log => {
    if (filter !== 'All' && log.level !== filter.toLowerCase()) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="solid-dark-log border border-border-glass rounded-lg overflow-hidden flex flex-col h-96">
      <div className="bg-bg-secondary/40 border-b border-border-glass px-4 py-3 flex justify-between items-center select-none">
        <div className="flex gap-2">
          {['All', 'Info', 'Warning', 'Error'].map(level => (
            <button
              key={level}
              onClick={() => setFilter(level as any)}
              className={`px-3 py-1 text-xs rounded border transition-colors cursor-pointer ${
                filter === level 
                  ? 'bg-bg-primary text-text-primary border-border-glass font-medium' 
                  : 'bg-transparent text-text-muted border-transparent hover:text-text-primary'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        <div>
          <input 
            type="text" 
            placeholder="Search logs..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input text-xs w-64"
            style={{ padding: '4px 10px' }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-bg-tertiary">
        {filteredLogs.length === 0 ? (
          <div className="text-text-muted italic">// No logs found.</div>
        ) : (
          filteredLogs.map(log => (
            <div key={log.id} className="flex gap-4 mb-1 hover:bg-bg-secondary/40 px-2 py-0.5 rounded transition-all">
              <span className="text-text-muted shrink-0">{new Date(log.timestamp).toISOString().split('T')[1].slice(0, -1)}</span>
              <span className={`w-12 shrink-0 font-bold ${
                log.level === 'error' ? 'text-accent-error' :
                log.level === 'warning' ? 'text-accent-warning' : 'text-accent-info'
              }`}>
                {log.level.toUpperCase()}
              </span>
              <span className="text-text-secondary break-all select-text">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
