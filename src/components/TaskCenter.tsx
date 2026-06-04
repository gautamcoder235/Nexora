import React, { useState, useEffect } from "react";
import { Plus, Trash, ArrowLeft, ArrowRight, UserPlus, FileText } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { Task } from "../types";

export const TaskCenter: React.FC = () => {
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Default to first project when workspace changes
  useEffect(() => {
    if (activeProjects.length > 0) {
      setSelectedProjectId(activeProjects[0].id);
    } else {
      setSelectedProjectId("");
    }
  }, [activeWorkspaceId, projects]);

  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  const projectAgents = agents.filter(a => a.projectId === selectedProjectId);

  // Quick inputs
  const [showAddForm, setShowAddForm] = useState(false);
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
    { id: 'todo', title: 'Todo', color: 'border-t-zinc-600 bg-zinc-950/30' },
    { id: 'doing', title: 'Doing', color: 'border-t-purple-500 bg-purple-500/[0.01]' },
    { id: 'review', title: 'Review', color: 'border-t-sky-500 bg-sky-500/[0.01]' },
    { id: 'done', title: 'Done', color: 'border-t-emerald-500 bg-emerald-500/[0.01]' }
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

  if (!activeWorkspaceId) return null;

  return (
    <div className="flex flex-col h-full space-y-2 font-mono">
      {/* Top selector and controls */}
      <div className="flex items-center justify-between flex-shrink-0 select-none pb-1 border-b border-[#232329]/40">
        <div className="flex items-center gap-3">
          <FileText size={13} className="text-purple-400" />
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Project Task Board</span>
          
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-[#121214] text-[10px] text-zinc-300 border border-[#232329] px-2 py-0.5 rounded outline-none cursor-pointer focus:border-purple-500/30 font-semibold"
          >
            {activeProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {activeProjects.length === 0 && (
              <option value="">No Active Projects</option>
            )}
          </select>
        </div>

        {selectedProjectId && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 text-[9px] font-bold py-0.5 px-2 rounded transition-all uppercase"
          >
            <Plus size={11} />
            Create Task
          </button>
        )}
      </div>

      {/* Task Creation Form */}
      {showAddForm && (
        <form onSubmit={handleCreateTask} className="bg-[#121214] border border-purple-500/20 p-2 rounded space-y-1.5 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              required
              placeholder="Task Title (e.g. Implement Login API)"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="bg-[#0c0c0e] text-[11px] text-zinc-200 border border-[#232329] px-2.5 py-1 rounded outline-none focus:border-purple-500/30"
            />
            <input
              type="text"
              placeholder="Task Description / Details"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              className="bg-[#0c0c0e] text-[11px] text-zinc-200 border border-[#232329] px-2.5 py-1 rounded outline-none focus:border-purple-500/30"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-0.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] px-3 py-0.5 rounded"
            >
              Save Task
            </button>
          </div>
        </form>
      )}

      {/* Kanban Board Columns Grid */}
      <div className="flex-1 grid grid-cols-4 gap-1.5 overflow-hidden min-h-0">
        {columns.map(col => {
          const colTasks = projectTasks.filter(t => t.status === col.id);
          return (
            <div 
              key={col.id} 
              className={`flex flex-col border border-[#232329] border-t-2 rounded overflow-hidden min-w-0 ${col.color}`}
            >
              {/* Column Header */}
              <div className="bg-[#0c0c0e] px-2.5 py-1.5 border-b border-[#232329] flex items-center justify-between select-none">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{col.title}</span>
                <span className="bg-[#1a1a20] px-1 rounded text-zinc-500 text-[9px] font-bold border border-[#232329]">
                  {colTasks.length}
                </span>
              </div>

              {/* Column Content Scrollable Area */}
              <div className="flex-1 overflow-y-auto p-1 space-y-1.5 min-h-0">
                {colTasks.map(task => {
                  return (
                    <div 
                      key={task.id} 
                      className="bg-[#0c0c0e]/80 border border-[#232329] rounded p-1.5 space-y-1.5 hover:border-zinc-800 transition-all select-none relative group"
                    >
                      {/* Title & Description */}
                      <div className="space-y-0.5 select-text">
                        <h4 className="text-[11px] font-semibold text-zinc-200 break-words leading-tight">{task.title}</h4>
                        {task.description && (
                          <p className="text-[9.5px] text-zinc-500 break-words leading-normal">{task.description}</p>
                        )}
                      </div>

                      {/* Assignment & Action row */}
                      <div className="flex items-center justify-between pt-1 text-[9px] gap-1">
                        {/* Assign Agent Selector */}
                        <div className="flex items-center gap-1 max-w-[65%] truncate">
                          <UserPlus size={10} className="text-zinc-500 flex-shrink-0" />
                          <select
                            value={task.assignedAgentId || ""}
                            onChange={(e) => assignTask(task.id, e.target.value || null)}
                            className="bg-transparent text-zinc-400 outline-none cursor-pointer max-w-full hover:text-zinc-200 transition-colors"
                          >
                            <option value="" className="bg-[#0c0c0e]">Unassigned</option>
                            {projectAgents.map(agent => (
                              <option key={agent.id} value={agent.id} className="bg-[#0c0c0e]">
                                {agent.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Drag Status Navigation buttons */}
                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          {col.id !== 'todo' && (
                            <button
                              type="button"
                              onClick={() => handleMove(task, 'left')}
                              title="Move backward"
                              className="text-zinc-500 hover:text-zinc-300 p-0.5 hover:bg-[#1a1a20] rounded border border-zinc-800"
                            >
                              <ArrowLeft size={9} />
                            </button>
                          )}
                          {col.id !== 'done' && (
                            <button
                              type="button"
                              onClick={() => handleMove(task, 'right')}
                              title="Move forward"
                              className="text-zinc-500 hover:text-zinc-300 p-0.5 hover:bg-[#1a1a20] rounded border border-zinc-800"
                            >
                              <ArrowRight size={9} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteTask(task.id)}
                            title="Delete Task"
                            className="text-zinc-600 hover:text-rose-400 p-0.5 hover:bg-[#1a1a20] rounded border border-zinc-800"
                          >
                            <Trash size={9} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {colTasks.length === 0 && (
                  <div className="text-[9px] text-zinc-700 text-center py-6 select-none font-mono">
                    No tasks
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
