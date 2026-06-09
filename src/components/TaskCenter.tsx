import React, { useState, useEffect } from "react";
import { Plus, Trash2, ArrowLeft, ArrowRight, UserPlus, FileText, Zap, ClipboardList, Eye, CheckCircle2 } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { useSwarmStore } from "../stores/swarmStore";
import { Task } from "../types";

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
    deleteTask,
    moveTask,
    assignTask,
    activeWorkspaceId
  } = useOrchestratorStore();

  const activeProjects = projects.filter(p => p.workspaceId === activeWorkspaceId);
  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const projectAgents = agents.filter(a => a.projectId === selectedProjectId);

  // Quick inputs
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedProjectId) return;
    await createTask(selectedProjectId, newTaskTitle, newTaskDesc);
    setNewTaskTitle("");
    setNewTaskDesc("");
    setShowAddForm(false);
  };

  const columns: { id: Task['status']; title: string; color: string }[] = [
    { id: 'todo', title: 'Todo', color: 'border-t-zinc-500 bg-bg-secondary/20 shadow-sm' },
    { id: 'doing', title: 'Doing', color: 'border-t-amber-500 bg-bg-secondary/20 shadow-[0_0_12px_rgba(245,158,11,0.06)]' },
    { id: 'review', title: 'Review', color: 'border-t-indigo-500 bg-bg-secondary/20 shadow-sm' },
    { id: 'done', title: 'Done', color: 'border-t-emerald-500 bg-bg-secondary/20 shadow-sm' }
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

      {/* Task Creation Form */}
      {showAddForm && (
        <form onSubmit={handleCreateTask} className="glass-panel bg-bg-secondary/40 border border-border-glass p-3.5 rounded-lg space-y-3 flex-shrink-0 shadow-lg animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              required
              placeholder="Task Title (e.g. Implement Login API)"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="glass-input text-[11px]"
            />
            <input
              type="text"
              placeholder="Task Description / Details"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              className="glass-input text-[11px]"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="glass-button glass-button--ghost text-[10px] px-3 py-1 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="glass-button glass-button--accent text-[10px] font-bold px-4 py-1 cursor-pointer shadow-glow"
            >
              Save Task
            </button>
          </div>
        </form>
      )}

      {/* Kanban Board Columns Grid */}
      <div className="flex-1 grid grid-cols-4 gap-2 overflow-hidden min-h-0">
        {columns.map(col => {
          const colTasks = projectTasks.filter(t => t.status === col.id);
          return (
            <div 
              key={col.id} 
              className={`flex flex-col border border-border-glass border-t-2 rounded-md overflow-hidden min-w-0 transition-all ${col.color}`}
            >
              {/* Column Header */}
              <div className="bg-bg-secondary/35 px-2.5 py-1 border-b border-border-glass flex items-center justify-between select-none">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">{col.title}</span>
                <span className="bg-white/5 h-[16px] min-w-[16px] px-1 rounded text-zinc-400 text-[8.5px] font-bold border border-border-glass/30 flex items-center justify-center">
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
                          className="bg-bg-secondary/40 border border-border-glass hover:border-zinc-700/60 rounded-md p-2.5 space-y-2.5 hover:shadow-md hover:scale-[1.01] transition-all select-none relative group"
                        >
                          {/* Title & Description */}
                          <div className="space-y-1 select-text">
                            <h4 className="text-[10.5px] font-bold text-zinc-200 break-words leading-tight">{task.title}</h4>
                            {task.description && (
                              <p className="text-[9.5px] text-zinc-500 break-words leading-relaxed font-sans">{task.description}</p>
                            )}
                          </div>

                          {/* Assignment & Action row */}
                          <div className="flex items-center justify-between pt-1 border-t border-border-glass/20 text-[9px] gap-1">
                            {/* Assign Agent Selector */}
                            <div className="flex items-center gap-1.5 max-w-[65%] truncate bg-white/5 border border-border-glass/40 px-1.5 py-0.5 rounded">
                              <UserPlus size={10} className="text-zinc-500 flex-shrink-0" />
                              <select
                                value={task.assignedAgentId || ""}
                                onChange={(e) => assignTask(task.id, e.target.value || null)}
                                className="bg-transparent text-zinc-400 outline-none cursor-pointer max-w-full hover:text-zinc-200 transition-colors font-mono font-semibold"
                              >
                                <option value="" className="bg-[#0f0f15]">Unassigned</option>
                                {projectAgents.map(agent => (
                                  <option key={agent.id} value={agent.id} className="bg-[#0f0f15]">
                                    {agent.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Actions list shown ONLY on hover for cleaner UI layout */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              {col.id !== 'todo' && (
                                <button
                                  type="button"
                                  onClick={() => handleMove(task, 'left')}
                                  title="Move back"
                                  className="text-zinc-400 hover:text-accent-primary p-1 hover:bg-white/5 rounded border border-border-glass/40 cursor-pointer transition-colors flex items-center justify-center"
                                >
                                  <ArrowLeft size={9} />
                                </button>
                              )}
                              {col.id !== 'done' && (
                                <button
                                  type="button"
                                  onClick={() => handleMove(task, 'right')}
                                  title="Move forward"
                                  className="text-zinc-400 hover:text-accent-primary p-1 hover:bg-white/5 rounded border border-border-glass/40 cursor-pointer transition-colors flex items-center justify-center"
                                >
                                  <ArrowRight size={9} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  useSwarmStore.getState().setSwarmPanelVisible(true);
                                  useSwarmStore.getState().setFilter('all');
                                }}
                                title="View Swarm Executions"
                                className="text-zinc-400 hover:text-accent-primary p-1 hover:bg-white/5 rounded border border-border-glass/40 cursor-pointer transition-colors flex items-center justify-center"
                              >
                                <Zap size={9} />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTask(task.id)}
                                title="Delete Task"
                                className="text-zinc-400 hover:text-rose-400 p-1 hover:bg-rose-500/10 rounded border border-border-glass/40 cursor-pointer transition-colors flex items-center justify-center"
                              >
                                <Trash2 size={9} />
                              </button>
                            </div>
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
