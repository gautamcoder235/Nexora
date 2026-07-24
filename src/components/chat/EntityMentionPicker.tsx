import React, { useEffect, useState, useRef } from 'react';
import { FileText, Folder, Terminal, Users, CheckSquare, Hash } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';

interface EntityMentionPickerProps {
  onSelect: (mention: string) => void;
}

const mockEntities = [
  { id: 'f1', type: 'file', label: 'App.tsx', icon: FileText },
  { id: 'f2', type: 'file', label: 'main.ts', icon: FileText },
  { id: 'd1', type: 'folder', label: 'src/components', icon: Folder },
  { id: 't1', type: 'terminal', label: 'build-server', icon: Terminal },
  { id: 'a1', type: 'agent', label: 'Scout Agent', icon: Users },
  { id: 'ts1', type: 'task', label: 'Fix memory leak', icon: CheckSquare },
  { id: 's1', type: 'symbol', label: 'ConversationSession', icon: Hash },
];

export const EntityMentionPicker: React.FC<EntityMentionPickerProps> = ({ onSelect }) => {
  const { mentionQuery, isMentionPickerOpen, setMentionPickerOpen } = useChatStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredEntities = mockEntities.filter(e => 
    !mentionQuery || e.label.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionQuery]);

  useEffect(() => {
    if (!isMentionPickerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredEntities.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredEntities.length) % filteredEntities.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredEntities[selectedIndex]) {
          onSelect(filteredEntities[selectedIndex].label);
          setMentionPickerOpen(false);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMentionPickerOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMentionPickerOpen, filteredEntities, selectedIndex, onSelect, setMentionPickerOpen]);

  useEffect(() => {
    if (containerRef.current) {
      const selectedEl = containerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isMentionPickerOpen || filteredEntities.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-64 max-h-64 overflow-y-auto bg-[var(--bg-secondary)]/98 border border-[var(--border-glass)] rounded-xl shadow-2xl z-50 backdrop-blur-xl animate-in fade-in duration-150">
      <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold border-b border-[var(--border-glass)]">Mention Entity Context</div>
      <div ref={containerRef} className="p-1 space-y-0.5 font-sans">
        {filteredEntities.map((entity, index) => {
          const Icon = entity.icon;
          const isSelected = index === selectedIndex;
          
          return (
            <button
              key={entity.id}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                isSelected 
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.12)] text-[var(--accent-primary)] font-medium border border-[rgba(var(--accent-primary-rgb),0.2)]' 
                  : 'text-zinc-300 hover:bg-[var(--border-glass)]'
              }`}
              onClick={() => {
                onSelect(entity.label);
                setMentionPickerOpen(false);
              }}
            >
              <Icon size={14} className={isSelected ? "text-[var(--accent-primary)]" : "text-zinc-400"} />
              <span className="truncate">{entity.label}</span>
              <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                {entity.type}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EntityMentionPicker;
