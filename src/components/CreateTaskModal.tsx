import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import type { Task, Priority } from '../types';

interface CreateTaskModalProps {
  onClose: () => void;
  onCreate: (task: Omit<Task, 'id' | 'createdAt' | 'status'>) => void;
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];
const PRIORITY_COLOR: Record<Priority, string> = {
  low: '#38bdf8', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
};

export default function CreateTaskModal({ onClose, onCreate }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title: title.trim(), description: description.trim(), priority, assignedAgentId: null, tags, projectId: '' });
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center fade-in" onClick={onClose}>
      <div
        className="bg-[#0d0d10] border border-[#2a2a38] rounded-xl w-full max-w-md shadow-2xl slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e28]">
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-[#f59e0b]" />
            <h2 className="text-sm font-semibold text-[#e2e2ea]">Create Task</h2>
          </div>
          <button onClick={onClose} className="text-[#555568] hover:text-[#e2e2ea] transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-[10px] font-bold tracking-widest text-[#555568] mb-1.5">TITLE *</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title..."
              className="w-full bg-[#111116] border border-[#2a2a38] rounded-lg px-3 py-2.5 text-sm text-[#e2e2ea] placeholder-[#333344] outline-none focus:border-[#f59e0b]/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-widest text-[#555568] mb-1.5">DESCRIPTION</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full bg-[#111116] border border-[#2a2a38] rounded-lg px-3 py-2.5 text-sm text-[#e2e2ea] placeholder-[#333344] outline-none focus:border-[#f59e0b]/50 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-widest text-[#555568] mb-1.5">PRIORITY</label>
            <div className="flex gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className="flex-1 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition-all cursor-pointer"
                  style={{
                    borderColor: priority === p ? `${PRIORITY_COLOR[p]}60` : '#2a2a38',
                    color: priority === p ? PRIORITY_COLOR[p] : '#555568',
                    background: priority === p ? `${PRIORITY_COLOR[p]}15` : 'transparent',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-widest text-[#555568] mb-1.5">TAGS</label>
            <div className="flex gap-2 mb-2">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add tag and press Enter..."
                className="flex-1 bg-[#111116] border border-[#2a2a38] rounded-lg px-3 py-2 text-sm text-[#e2e2ea] placeholder-[#333344] outline-none focus:border-[#f59e0b]/50 transition-colors"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 rounded-lg bg-[#1a1a22] border border-[#2a2a38] text-[#888899] hover:text-[#e2e2ea] text-xs transition-colors cursor-pointer"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1a1a22] border border-[#2a2a38] text-[#888899] text-[11px]">
                    {tag}
                    <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="text-[#555568] hover:text-[#ef4444] transition-colors cursor-pointer">
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-[#2a2a38] text-[#888899] text-sm font-medium hover:border-[#444458] hover:text-[#e2e2ea] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 py-2.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold transition-colors cursor-pointer"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
