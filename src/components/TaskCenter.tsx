import React, { useState, useEffect } from "react";
import { Plus, Trash2, ArrowLeft, ArrowRight, UserPlus, FileText, Zap, ClipboardList, Eye, CheckCircle2, Star, AlertTriangle, AlertOctagon, Tag } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { useSwarmStore } from "../stores/swarmStore";
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
    case 'critical': return { icon: AlertOctagon, color: 'text-red-500', label: 'Critical' };
    case 'high': return { icon: AlertTriangle, color: 'text-orange-500', label: 'High' };
    case 'medium': return { icon: Star, color: 'text-amber-500', label: 'Medium' };
    case 'low': return { icon: Star, color: 'text-sky-400', label: 'Low' };
    default: return { icon: Star, color: 'text-zinc-500', label: 'None' };
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
    { id: 'todo', title: 'TODO', topBorder: 'border-t-[#f59e0b]', textColor: 'text-[#f59e0b]', badgeBg: 'bg-[#f59e0b]/10 border-[#f59e0b]/20' },
    { id: 'doing', title: 'DOING', topBorder: 'border-t-[#f97316]', textColor: 'text-[#f97316]', badgeBg: 'bg-[#f97316]/10 border-[#f97316]/20' },
    { id: 'review', title: 'REVIEW', topBorder: 'border-t-[#3b82f6]', textColor: 'text-[#3b82f6]', badgeBg: 'bg-[#3b82f6]/10 border-[#3b82f6]/20' },
    { id: 'done', title: 'DONE', topBorder: 'border-t-[#10b981]', textColor: 'text-[#10b981]', badgeBg: 'bg-[#10b981]/10 border-[#10b981]/20' }
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
        return <ClipboardList size={14} className="text-zinc-500 opacity-30" />;
      case 'doing':
        return <Zap size={14} className="text-amber-500 opacity-30 animate-pulse" />;
      case 'review':
        return <Eye size={14} className="text-indigo-400 opacity-30" />;
      case 'done':
        return <CheckCircle2 size={14} className="text-emerald-400 opacity-30" />;
      default:
        return <ClipboardList size={14} className="text-zinc-500 opacity-30" />;
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
      <div className="flex-1 grid grid-cols-4 gap-2 overflow-hidden min-h-0">
        {columns.map(col => {
          const colTasks = projectTasks.filter(t => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`flex flex-col border border-[#1e1e28] border-t-2 rounded-md overflow-hidden min-w-0 transition-all bg-[#0a0a0f] ${col.topBorder}`}
            >
              {/* Column Header */}
              <div className="px-2 py-1.5 flex items-center justify-between select-none border-b border-[#1e1e28]">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${col.textColor}`}>{col.title}</span>
                <span className={`h-[18px] min-w-[18px] px-1 rounded text-[9px] font-bold border flex items-center justify-center ${col.textColor} ${col.badgeBg}`}>
                  {colTasks.length}
                </span>
              </div>

              {/* Column Content Scrollable Area */}
              <div className="flex-1 flex flex-col p-1.5 min-h-0 overflow-hidden">
                {colTasks.length > 0 ? (
                  <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                    {colTasks.map(task => {
                      return (
                        <div
                          key={task.id}
                          className="bg-[#111116] border border-[#2a2a38] hover:border-zinc-700/60 rounded-lg p-3 space-y-3 hover:shadow-md hover:scale-[1.01] transition-all select-none relative group"
                        >
                          {/* Title & Priority */}
                          <div className="flex items-start justify-between gap-2 select-text">
                            <h4 className="flex-1 min-w-0 text-[12px] font-bold text-[#e2e2ea] break-all leading-tight">{task.title}</h4>
                            {task.priority && (
                              <div className={`flex items-center gap-1.5 ${getPriorityConfig(task.priority).color} shrink-0`}>
                                {React.createElement(getPriorityConfig(task.priority).icon, { size: 12 })}
                                <span className="text-[11px] font-mono font-bold">{getPriorityConfig(task.priority).label}</span>
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
                              <p className={`text-[11px] text-[#888899] break-all leading-relaxed font-sans transition-all ${expandedTaskIds.has(task.id) ? '' : 'line-clamp-2'}`}>
                                {task.description}
                              </p>
                              {task.description.length > 80 && !expandedTaskIds.has(task.id) && (
                                <span className="text-[10px] text-[#555568] group-hover/desc:text-[#888899] transition-colors mt-1 font-semibold">
                                  read more...
                                </span>
                              )}
                            </div>
                          )}

                          {/* Tags */}
                          {task.tags && task.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {task.tags.map(tag => (
                                <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1a1a22] border border-[#2a2a38] text-[#888899] text-[10px]">
                                  <Tag size={9} />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Assignment & Actions */}
                          <div className="flex items-center justify-between gap-1">
                            {/* Assign Agent Selector */}
                            <div className="flex items-center gap-1.5 max-w-[65%] truncate bg-[#1a1a22] border border-[#2a2a38] px-1.5 py-1 rounded">
                              <UserPlus size={11} className="text-[#555568] flex-shrink-0" />
                              <select
                                value={task.assignedAgentId || ""}
                                onChange={(e) => assignTask(task.id, e.target.value || null)}
                                className="bg-transparent text-[#e2e2ea] outline-none cursor-pointer max-w-full hover:text-white transition-colors font-mono font-semibold text-[10px]"
                              >
                                <option value="" className="bg-[#0f0f15]">Unassigned</option>
                                {projectAgents.map(agent => (
                                  <option key={agent.id} value={agent.id} className="bg-[#0f0f15]">
                                    {agent.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Actions list */}
                            <div className="flex items-center gap-1">
                              {col.id !== 'todo' && (
                                <button type="button" onClick={() => handleMove(task, 'left')} className="text-[#555568] hover:text-[#e2e2ea] p-1.5 hover:bg-[#1a1a22] rounded border border-[#2a2a38] transition-colors cursor-pointer">
                                  <ArrowLeft size={11} />
                                </button>
                              )}
                              {col.id !== 'done' && (
                                <button type="button" onClick={() => handleMove(task, 'right')} className="text-[#555568] hover:text-[#e2e2ea] p-1.5 hover:bg-[#1a1a22] rounded border border-[#2a2a38] transition-colors cursor-pointer">
                                  <ArrowRight size={11} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => updateTask(task.id, { isStarred: !task.isStarred })}
                                className={`p-1.5 rounded border transition-colors cursor-pointer ${task.isStarred
                                    ? 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10'
                                    : 'text-[#555568] hover:text-[#f59e0b] hover:bg-[#1a1a22] border-[#2a2a38]'
                                  }`}
                              >
                                <Star size={11} fill={task.isStarred ? '#f59e0b' : 'none'} />
                              </button>
                              <button type="button" onClick={() => deleteTask(task.id)} className="text-[#555568] hover:text-[#ef4444] p-1.5 hover:bg-[#1a1a22] rounded border border-[#2a2a38] transition-colors cursor-pointer">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>

                          {/* Footer: Time & Task ID */}
                          <div className="flex items-center justify-between pt-2 border-t border-[#1e1e28] text-[10px] text-[#555568]">
                            <span>{getRelativeTime(task.createdAt)}</span>
                            <span className="font-mono"># {projectTasks.findIndex(t => t.id === task.id) + 1}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-grow flex-1 flex flex-col items-center justify-center border border-dashed border-border-glass/30 rounded-md bg-white/[0.01] select-none text-center p-4">
                    {renderEmptyIcon(col.id)}
                    <span className="text-[9px] text-zinc-550 mt-1 font-mono tracking-wide uppercase">Empty</span>
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
