import React, { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { KanbanTask, TaskState } from '../../types/task';
import { ShieldAlert, AlertTriangle, CheckCircle, Clock, RotateCcw, ShieldCheck, User, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const COLUMNS: { state: TaskState; title: string; color: string; accent: string }[] = [
  { state: 'backlog', title: 'Backlog', color: 'border-[#1B1B22] bg-[#121218]/40', accent: 'bg-zinc-650' },
  { state: 'planning', title: 'Planning', color: 'border-[#1B1B22] bg-[#121218]/40', accent: 'bg-indigo-400' },
  { state: 'assigned', title: 'Assigned', color: 'border-[#1B1B22] bg-[#121218]/40', accent: 'bg-sky-400' },
  { state: 'running', title: 'Running', color: 'border-[#1B1B22] bg-[#121218]/40', accent: 'bg-amber-400' },
  { state: 'review', title: 'Review', color: 'border-purple-950/30 bg-purple-950/5', accent: 'bg-purple-400' },
  { state: 'validation', title: 'Validation', color: 'border-blue-950/30 bg-blue-950/5', accent: 'bg-blue-400' },
  { state: 'blocked', title: 'Blocked', color: 'border-rose-950/30 bg-rose-950/5', accent: 'bg-rose-500' },
  { state: 'quarantined', title: 'Quarantined', color: 'border-amber-950/30 bg-amber-950/5', accent: 'bg-amber-500' },
  { state: 'done', title: 'Done', color: 'border-emerald-950/30 bg-emerald-950/5', accent: 'bg-emerald-400' }
];

interface DraggableCardProps {
  task: KanbanTask;
  children: React.ReactNode;
}

const DraggableCard: React.FC<DraggableCardProps> = ({ task, children }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    opacity: isDragging ? 0.3 : undefined,
    zIndex: isDragging ? 50 : undefined,
    cursor: 'grab',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      className="active:cursor-grabbing touch-none"
    >
      {children}
    </div>
  );
};

interface DroppableColumnProps {
  state: TaskState;
  color: string;
  accent: string;
  title: string;
  children: React.ReactNode;
  count: number;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({ state, color, accent, title, count, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: state,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-xl border flex flex-col transition-all duration-200 ${color} ${
        isOver ? 'border-[#7C5CFF]/45 bg-[#7C5CFF]/5 scale-[0.99] shadow-inner shadow-[#7C5CFF]/5' : ''
      }`}
    >
      {/* Column Title */}
      <div className="px-3 py-2 border-b border-[#1B1B22] bg-[#121218]/80 flex items-center justify-between flex-shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full ${accent}`} />
          <span className="text-[10px] font-bold text-zinc-300 truncate uppercase font-sans tracking-wide">{title}</span>
        </div>
        <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-md bg-[#0D0D10] text-zinc-400 border border-[#1B1B22]">
          {count}
        </span>
      </div>

      {/* Task Cards Container */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-0">
        {children}
      </div>
    </div>
  );
};

export const TaskBoard: React.FC = () => {
  const { tasks, nodes, rollbackTask, forceValidation, updateTaskState } = useTeamStore();

  const getPriorityBadge = (prio: KanbanTask['priority']) => {
    switch (prio) {
      case 'critical':
        return 'text-rose-400 border-rose-500/20 bg-rose-500/10';
      case 'high':
        return 'text-amber-400 border-amber-500/20 bg-amber-500/10';
      case 'medium':
        return 'text-sky-400 border-sky-500/20 bg-sky-500/10';
      default:
        return 'text-zinc-400 border-zinc-700 bg-zinc-800/20';
    }
  };

  const getAssignedAgent = (agentId?: string) => {
    if (!agentId) return null;
    return nodes.find((n) => n.id === agentId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newState = over.id as TaskState;

    updateTaskState(taskId, newState);
  };

  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div 
        className="flex flex-col transition-all duration-300 rounded-2xl border border-[#1B1B22] bg-[#121218]/30 overflow-hidden shadow-lg"
        style={{ height: isCollapsed ? '42px' : '320px' }}
      >
        {/* Header */}
        <div 
          className={`px-5 py-2.5 flex items-center justify-between bg-[#121218]/80 cursor-pointer select-none ${isCollapsed ? '' : 'border-b border-[#1B1B22]'}`}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#7C5CFF]" />
            <span className="text-xs font-bold font-mono tracking-wider uppercase text-zinc-400">Sprint Task Board</span>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono hidden md:inline">{tasks.length} active operations</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(!isCollapsed);
              }}
              className="p-1 rounded hover:bg-[#1B1B22] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Horizontal Scroll Columns Area */}
        {!isCollapsed && (
          <div className="flex-1 flex flex-row overflow-x-auto overflow-y-hidden p-4 gap-3 min-h-0 select-none">
            {COLUMNS.map(({ state, title, color, accent }) => {
              const colTasks = tasks.filter((t) => t.state === state);

              return (
                <DroppableColumn
                  key={state}
                  state={state}
                  color={color}
                  accent={accent}
                  title={title}
                  count={colTasks.length}
                >
                  {colTasks.length === 0 ? (
                    <div className="h-28 flex items-center justify-center p-4 border border-dashed border-[#1B1B22] rounded-xl text-[10px] text-zinc-600 font-mono italic text-center pointer-events-none">
                      No Tasks
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {colTasks.map((task) => {
                        const agent = getAssignedAgent(task.assignedAgentId);
                        const failedAttempts = task.attempts.filter((a) => a.status === 'failed');

                        return (
                          <DraggableCard key={task.id} task={task}>
                            <div className="relative group p-3 rounded-xl border border-[#1B1B22] bg-[#0D0D10]/80 hover:bg-[#0D0D10]/95 hover:border-zinc-700 transition-all duration-200 shadow-md">
                              {/* Card Content */}
                              <div className="flex justify-between items-start gap-2 mb-2">
                                <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded border uppercase tracking-wide ${getPriorityBadge(task.priority)}`}>
                                  {task.priority}
                                </span>
                                <span className="text-[8px] text-zinc-650 font-mono">#{task.id}</span>
                              </div>

                              <h4 className="text-xs font-semibold text-zinc-200 mb-1 truncate leading-tight">{task.title}</h4>
                              <p className="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed mb-3">{task.description}</p>

                              <div className="flex justify-between items-center border-t border-[#1B1B22]/60 pt-2.5 mt-2.5">
                                {/* Assigned Agent */}
                                {agent ? (
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div className="w-4.5 h-4.5 rounded-full bg-[#7C5CFF]/10 border border-[#7C5CFF]/30 text-[8px] font-bold flex items-center justify-center text-white">
                                      {agent.label.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="text-[9px] text-zinc-400 font-mono truncate">{agent.label}</span>
                                  </div>
                                ) : (
                                  <span className="text-[9px] text-zinc-600 font-mono italic">Unassigned</span>
                                )}

                                {/* Attempt status */}
                                {task.attempts.length > 0 && (
                                  <div className="flex items-center gap-1 font-mono text-[9px] flex-shrink-0">
                                    {failedAttempts.length > 0 ? (
                                      <span className="text-rose-400 flex items-center gap-0.5" title={`${failedAttempts.length} Failed attempts`}>
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        <span>Att: {task.attempts.length}</span>
                                      </span>
                                    ) : (
                                      <span className="text-[#22C55E] flex items-center gap-0.5" title="Success">
                                        <CheckCircle className="w-2.5 h-2.5" />
                                        <span>Done</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Hover commands overlay */}
                              <div className="absolute inset-0 rounded-xl bg-[#0D0D10]/95 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center gap-2 p-2 pointer-events-none group-hover:pointer-events-auto z-10">
                                {/* Rollback button */}
                                {(state === 'running' || state === 'review' || state === 'validation' || state === 'quarantined' || state === 'done') && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      rollbackTask(task.id);
                                    }}
                                    className="px-2.5 py-1 rounded bg-[#121218] hover:bg-[#1B1B22] text-zinc-300 text-[9px] font-bold font-mono flex items-center gap-1 transition-colors border border-[#1B1B22]"
                                    title="Reset task attempts and return to planning"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" />
                                    <span>Rollback</span>
                                  </button>
                                )}

                                {/* Force Validation button */}
                                {(state === 'running' || state === 'validation' || state === 'quarantined') && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      forceValidation(task.id);
                                    }}
                                    className="px-2.5 py-1 rounded bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 text-white text-[9px] font-bold font-mono flex items-center gap-1 transition-colors shadow-lg shadow-[#7C5CFF]/15"
                                    title="Force run pipeline verification"
                                  >
                                    <ShieldCheck className="w-2.5 h-2.5" />
                                    <span>Force check</span>
                                  </button>
                                )}
                                
                                {state === 'quarantined' && (
                                  <div className="flex flex-col items-center text-center text-[9px] text-[#F59E0B] font-mono gap-0.5">
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    <span>Quarantined</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </DraggableCard>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </DroppableColumn>
              );
            })}
          </div>
        )}
      </div>
    </DndContext>
  );
};
