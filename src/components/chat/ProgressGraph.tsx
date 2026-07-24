import React from 'react';
import { Check, X, Circle, Loader2 } from 'lucide-react';
import type { ConversationPhase } from '../../core/ai/protocol';

interface ProgressGraphProps {
  phase: ConversationPhase;
}

const phases = [
  { id: 'thinking', label: 'Thinking', states: ['preparing', 'building_context'] },
  { id: 'planning', label: 'Planning', states: ['planning', 'waiting_approval'] },
  { id: 'building', label: 'Building', states: ['executing'] },
  { id: 'testing', label: 'Testing', states: ['observing', 'reflecting'] },
  { id: 'complete', label: 'Complete', states: ['completed', 'failed'] },
];

export const ProgressGraph: React.FC<ProgressGraphProps> = ({ phase }) => {
  const getPhaseStatus = (phaseId: string, currentPhase: ConversationPhase) => {
    if (currentPhase === 'completed') return 'done';
    if (currentPhase === 'failed') return phaseId === 'complete' ? 'failed' : 'done';
    if (currentPhase === 'idle') return 'pending';
    
    const currentIndex = phases.findIndex(p => p.states.includes(currentPhase));
    const targetIndex = phases.findIndex(p => p.id === phaseId);

    if (currentIndex === -1) return 'pending';
    if (targetIndex < currentIndex) return 'done';
    if (targetIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="flex items-center justify-center max-w-[340px] mx-auto py-1.5 px-2 overflow-x-auto overflow-y-hidden scrollbar-none select-none">
      {phases.map((step, index) => {
        const status = getPhaseStatus(step.id, phase);
        const isLast = index === phases.length - 1;
        
        return (
          <React.Fragment key={step.id}>
            {/* Node */}
            <div className="flex flex-col items-center relative group">
              <div className={`
                flex items-center justify-center w-5 h-5 rounded-full z-10 transition-all duration-300
                ${status === 'done' ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] shadow-sm' : 
                  status === 'active' ? 'bg-[rgba(var(--accent-primary-rgb),0.15)] text-[var(--accent-primary)] border border-[var(--accent-primary)]' : 
                  status === 'failed' ? 'bg-rose-500 text-white' : 
                  'bg-[var(--bg-secondary)] text-zinc-500 border border-[var(--border-glass)]'}
              `}>
                {status === 'done' && <Check size={11} strokeWidth={3} />}
                {status === 'active' && <Loader2 size={11} className="animate-spin" />}
                {status === 'failed' && <X size={11} strokeWidth={3} />}
                {status === 'pending' && <Circle size={6} className="fill-current opacity-40" />}
                
                {status === 'active' && (
                  <div className="absolute inset-0 rounded-full animate-ping bg-[rgba(var(--accent-primary-rgb),0.3)] opacity-75"></div>
                )}
              </div>
              <span className={`mt-1 text-[8px] font-mono tracking-wider uppercase font-semibold ${
                status === 'active' ? 'text-[var(--accent-primary)]' : 
                status === 'done' ? 'text-zinc-300' : 
                'text-zinc-500'
              }`}>
                {step.label}
              </span>
            </div>

            {/* Edge */}
            {!isLast && (
              <div className="flex-1 min-w-[8px] max-w-[24px] h-[1.5px] mx-1 relative -top-2">
                <div className="absolute inset-0 bg-[var(--border-glass)] rounded-full"></div>
                <div className={`absolute left-0 top-0 bottom-0 bg-[var(--accent-primary)] rounded-full transition-all duration-500 ${
                  status === 'done' ? 'w-full' : 'w-0'
                }`}></div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default ProgressGraph;
