import React, { useState, useEffect } from "react";
import { Plus, Trash2, ArrowLeft, ArrowRight, UserPlus, FileText, Zap, ClipboardList, Eye, CheckCircle2, Star, AlertTriangle, AlertOctagon, Tag } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { useTeamStore } from "../stores/teamStore";
import { Task, Priority } from "../types";
import CreateTaskModal from "./CreateTaskModal";

function getRelativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getPriorityConfig(p: Priority | undefined) {
  switch (p) {
    case 'critical': return { icon: AlertOctagon, color: 'text-[var(--accent-error)]', label: 'Critical' };
    case 'high': return { icon: AlertTriangle, color: 'text-[var(--accent-warning)]', label: 'High' };
    case 'medium': return { icon: Star, color: 'text-[var(--accent-warning)]', label: 'Medium' };
    case 'low': return { icon: Star, color: 'text-[var(--accent-primary)]', label: 'Low' };
    default: return { icon: Star, color: 'text-[var(--text-muted)]', label: 'None' };
  }
}

interface TaskCenterProps {
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  showAddForm: boolean;
  setShowAddForm: (show: boolean) => void;
}

export const TaskCenter: React.FC<TaskCenterProps> = ({
  selectedProjectId,
  setSelectedProjectId,
  showAddForm,
  setShowAddForm
}) => {
  const {
    projects,
    agents,
    tasks,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    assignTask,
    activeWorkspaceId
  } = useOrchestratorStore();

  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);
  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const projectAgents = agents.filter(a => a.projectId === selectedProjectId);


  const columns: { id: Task['status']; title: string; topBorder: string; textColor: string; badgeBg: string }[] = [
    { id: 'todo', title: 'TODO', topBorder: 'border-t-[var(--border-glass)]', textColor: 'text-[var(--text-muted)]', badgeBg: 'bg-[var(--border-glass)] border border-[var(--border-glass)] text-[var(--text-muted)]' },
    { id: 'doing', title: 'DOING', topBorder: 'border-t-[var(--accent-primary)]', textColor: 'text-[var(--accent-primary)]', badgeBg: 'bg-[rgba(var(--accent-primary-rgb),0.1)] border border-[rgba(var(--accent-primary-rgb),0.2)] text-[var(--accent-primary)]' },
    { id: 'review', title: 'REVIEW', topBorder: 'border-t-[rgba(var(--accent-primary-rgb),0.6)]', textColor: 'text-[rgba(var(--accent-primary-rgb),0.85)]', badgeBg: 'bg-[rgba(var(--accent-primary-rgb),0.1)] border border-[rgba(var(--accent-primary-rgb),0.2)] text-[rgba(var(--accent-primary-rgb),0.85)]' },
    { id: 'done', title: 'DONE', topBorder: 'border-t-[var(--agent-status-success)]', textColor: 'text-[var(--agent-status-success)]', badgeBg: 'bg-[var(--agent-status-success)]/10 border border-[var(--agent-status-success)]/20 text-[var(--agent-status-success)]' }
  ];


  const handleMove = async (task: Task, direction: 'left' | 'right') => {
    const statuses: Task['status'][] = ['todo', 'doing', 'review', 'done'];
    const idx = statuses.indexOf(task.status);
    if (direction === 'left' && idx > 0) {
      await moveTask(task.id, statuses[idx - 1]);
    } else if (direction === 'right' && idx < statuses.length - 1) {
      await moveTask(task.id, statuses[idx + 1]);
    }
  };

  const renderEmptyIcon = (status: Task['status']) => {
    switch (status) {
      case 'todo':
        return <ClipboardList size={14} className="text-[var(--text-muted)] opacity-30" />;
      case 'doing':
        return <Zap size={14} className="text-[var(--accent-warning)] opacity-30 animate-pulse" />;
      case 'review':
        return <Eye size={14} className="text-[var(--accent-primary)] opacity-30" />;
      case 'done':
        return <CheckCircle2 size={14} className="text-[var(--agent-status-success)] opacity-30" />;
      default:
        return <ClipboardList size={14} className="text-[var(--text-muted)] opacity-30" />;
    }
  };

  if (!activeWorkspaceId) return null;

  return (
    <div className="flex flex-col h-full space-y-2 font-mono pb-1 overflow-hidden">

      {/* Task Creation Modal */}
      {showAddForm && (
        <CreateTaskModal
          onClose={() => setShowAddForm(false)}
          onCreate={(taskData) => {
            if (!selectedProjectId) return;
            createTask(selectedProjectId, taskData.title, taskData.description, taskData.priority, taskData.tags);
            setShowAddForm(false);
          }}
        />
      )}

      {/* Kanban Board Columns Grid */}
      <div className="flex-1 grid grid-cols-4 gap-2.5 overflow-hidden min-h-0">
        {columns.map(col => {
          const colTasks = projectTasks.filter(t => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`flex flex-col border border-[var(--border-glass)] border-t-2 rounded-xl overflow-hidden min-w-0 transition-all bg-[var(--bg-secondary)]/45 backdrop-blur-md ${col.topBorder}`}
            >
              {/* Column Header */}
              <div className="px-3 py-2 flex items-center justify-between select-none border-b border-[var(--border-glass)] bg-[var(--bg-glass-light)]/10">
                <span className={`text-[9px] font-bold uppercase tracking-widest ${col.textColor}`}>{col.title}</span>
                <span className={`h-[16px] min-w-[16px] px-1 rounded-full text-[9px] font-bold border flex items-center justify-center ${col.badgeBg}`}>
                  {colTasks.length}
                </span>
              </div>

              {/* Column Content Scrollable Area */}
              <div className="flex-1 flex flex-col p-2 min-h-0 overflow-hidden">
                {colTasks.length > 0 ? (
                  <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 scrollbar-thin">
                    {colTasks.map(task => {
                      return (
                        <div
                          key={task.id}
                          className="bg-[var(--bg-glass-light)]/30 border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] rounded-xl p-3.5 space-y-3.5 hover:shadow-[0_4px_15px_rgba(0,0,0,0.3)] hover:scale-[1.005] transition-all select-none relative group"
                        >
                          {/* Title & Priority */}
                          <div className="flex items-start justify-between gap-2.5 select-text">
                            <h4 className="flex-1 min-w-0 text-[11px] font-bold text-[var(--text-primary)] break-all leading-snug">{task.title}</h4>
                            {task.priority && (
                              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-glass)] ${getPriorityConfig(task.priority).color} shrink-0`}>
                                {React.createElement(getPriorityConfig(task.priority).icon, { size: 10 })}
                                <span className="text-[8px] font-mono font-bold uppercase tracking-wider">{getPriorityConfig(task.priority).label}</span>
                              </div>
                            )}
                          </div>

                          {/* Description */}
                          {task.description && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTaskExpansion(task.id);
                              }}
                              className="cursor-pointer group/desc flex flex-col"
                            >
                              <p className={`text-[10px] text-[var(--text-secondary)] break-all leading-relaxed font-sans transition-all ${expandedTaskIds.has(task.id) ? '' : 'line-clamp-2'}`}>
                                {task.description}
                              </p>
                              {task.description.length > 80 && !expandedTaskIds.has(task.id) && (
                                <span className="text-[8.5px] text-[var(--text-muted)] group-hover/desc:text-[var(--text-secondary)] transition-colors mt-1 font-semibold">
                                  read more...
                                </span>
                              )}
                            </div>
                          )}

                          {/* Tags */}
                          {task.tags && task.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {task.tags.map(tag => (
                                <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-glass)] text-[var(--text-muted)] text-[9px] font-sans">
                                  <Tag size={8} className="opacity-70" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Assignment & Actions */}
                          <div className="flex items-center justify-between gap-1">
                            {/* Assign Agent Selector */}
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-glass)] max-w-[55%] truncate">
                              <UserPlus size={10} className="text-[var(--text-muted)] flex-shrink-0" />
                              <select
                                value={task.assignedAgentId || ""}
                                onChange={(e) => assignTask(task.id, e.target.value || null)}
                                className="bg-transparent text-[var(--text-secondary)] outline-none cursor-pointer max-w-full hover:text-[var(--text-primary)] transition-colors font-mono font-medium text-[9px] border-none ml-1"
                              >
                                <option value="" className="bg-[var(--bg-secondary)]">Unassigned</option>
                                {projectAgents.map(agent => (
                                  <option key={agent.id} value={agent.id} className="bg-[var(--bg-secondary)]">
                                    {agent.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Actions list */}
                            <div className="flex items-center gap-1 shrink-0">
                              {col.id !== 'todo' && (
                                <button type="button" onClick={() => handleMove(task, 'left')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 hover:bg-[var(--border-glass)] rounded-md border border-[var(--border-glass)] transition-all cursor-pointer">
                                  <ArrowLeft size={10} />
                                </button>
                              )}
                              {col.id !== 'done' && (
                                <button type="button" onClick={() => handleMove(task, 'right')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 hover:bg-[var(--border-glass)] rounded-md border border-[var(--border-glass)] transition-all cursor-pointer">
                                  <ArrowRight size={10} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => updateTask(task.id, { isStarred: !task.isStarred })}
                                className={`p-1 rounded-md border transition-all cursor-pointer ${task.isStarred
                                    ? 'text-[var(--accent-primary)] border-[rgba(var(--accent-primary-rgb),0.2)] bg-[rgba(var(--accent-primary-rgb),0.1)]'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--border-glass)] border-[var(--border-glass)]'
                                  }`}
                              >
                                <Star size={10} fill={task.isStarred ? 'currentColor' : 'none'} />
                              </button>
                              <button type="button" onClick={() => deleteTask(task.id)} className="text-[var(--text-muted)] hover:text-[var(--accent-error)] p-1 hover:bg-[rgba(var(--accent-error-rgb),0.1)] rounded-md border border-[var(--border-glass)] transition-all cursor-pointer">
                                  <Trash2 size={10} />
                                </button>
                            </div>
                          </div>

                          {/* Footer: Time & Task ID */}
                          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-glass)] text-[8.5px] text-[var(--text-muted)] font-mono">
                            <span>{getRelativeTime(task.createdAt)}</span>
                            <span>#{projectTasks.findIndex(t => t.id === task.id) + 1}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-grow flex-1 flex flex-col items-center justify-center border border-dashed border-[var(--border-glass)] rounded-xl bg-[var(--bg-glass-light)]/5 select-none text-center p-4">
                    {renderEmptyIcon(col.id)}
                    <span className="text-[8px] text-[var(--text-muted)] mt-1 font-mono tracking-widest uppercase">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
