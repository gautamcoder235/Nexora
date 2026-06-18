import React, { useEffect, useState, useMemo } from 'react';
import { useChangesetStore } from '../stores/changesetStore';
import { useOrchestratorStore } from '../stores/orchestratorStore';
import { useSwarmStore } from '../stores/swarmStore';
import { swarmApi, ExecutionEventInfo } from '../services/ExecutionEvents';
import { invoke } from '@tauri-apps/api/core';
import { X, Bot, Clipboard, FileCode, Terminal, Lock, ListTodo, History, CheckCircle, Play, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

interface LogLine {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

interface ArtifactInfo {
  id: string;
  artifact_type: string;
  file_path: string;
  size_bytes: number;
  created_at: string;
  checksum: string;
}

interface LockState {
  file: string;
  agentName: string;
  expiresInSecs: number;
  lastHeartbeatSecsAgo: number;
}

interface CheckpointState {
  id: string;
  name: string;
  hash: string;
  timestamp: string;
  status: 'active' | 'archived';
}

export function AgentInspector() {
  const selectedAgentId = useChangesetStore(s => s.selectedAgentIdForInspector);
  const isOpen = useChangesetStore(s => s.isAgentInspectorOpen);
  const setOpen = useChangesetStore(s => s.setAgentInspectorOpen);
  const setSelectedAgentId = useChangesetStore(s => s.setSelectedAgentIdForInspector);

  const agents = useOrchestratorStore(s => s.agents);
  const tasks = useOrchestratorStore(s => s.tasks);
  const executions = useSwarmStore(s => s.executions);

  const [activeTab, setActiveTab] = useState<'task' | 'reasoning' | 'files' | 'terminal' | 'locks' | 'events' | 'checkpoints'>('task');

  // Loaded database info
  const [dbLogs, setDbLogs] = useState<LogLine[]>([]);
  const [dbArtifacts, setDbArtifacts] = useState<ArtifactInfo[]>([]);
  const [dbEvents, setDbEvents] = useState<ExecutionEventInfo[]>([]);
  const [contractLogText, setContractLogText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Active locks local state with timers
  const [locks, setLocks] = useState<LockState[]>([]);

  // Checkpoints list
  const [checkpoints, setCheckpoints] = useState<CheckpointState[]>([]);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const agent = useMemo(() => {
    return agents.find(a => a.id === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const task = useMemo(() => {
    if (!agent) return null;
    return tasks.find(t => t.id === agent.taskId || t.assignedAgentId === agent.id) || null;
  }, [tasks, agent]);

  const execution = useMemo(() => {
    if (!agent) return null;
    // Find running execution first, else most recent execution
    return executions.find(e => e.agent_id === agent.id && e.status === 'running') ||
           executions.find(e => e.agent_id === agent.id) || null;
  }, [executions, agent]);

  const contractData = useMemo(() => {
    if (!task) return null;
    return { allowedPatterns: ["src/**"] };
  }, [task]);

  // Compute worktree path
  const worktreePath = useMemo(() => {
    if (!agent || !task || !execution) return null;
    // Git worktree path convention from swarm_worktrees.rs
    const project = useOrchestratorStore.getState().projects.find(p => p.id === agent.projectId);
    if (!project) return null;
    const normPath = project.path.replace(/\\/g, '/');
    const lastSlash = normPath.lastIndexOf('/');
    const parent = lastSlash === -1 ? `${normPath}/..` : normPath.substring(0, lastSlash);
    return `${parent}/.nexora-worktrees/task-${task.id}-exec-${execution.id}`;
  }, [agent, task, execution]);

  // Fetch execution database tables
  const fetchData = async () => {
    if (!execution) {
      setDbLogs([]);
      setDbArtifacts([]);
      setDbEvents([]);
      setContractLogText('');
      return;
    }
    setIsLoading(true);
    try {
      // 1. Fetch DB logs
      const logs = await invoke<LogLine[]>('get_execution_logs', { executionId: execution.id });
      setDbLogs(logs);

      // 2. Fetch DB artifacts (modified files)
      const artifacts = await invoke<ArtifactInfo[]>('get_artifacts', { executionId: execution.id });
      setDbArtifacts(artifacts);

      // 3. Fetch Timeline Events
      const events = await swarmApi.getExecutionEvents(execution.id);
      setDbEvents(events);

      // 4. Fetch Worktree contract logs if worktree exists
      if (worktreePath) {
        const logFilePath = `${worktreePath}/.nexora/execution.log`;
        const logContent = await invoke<string>('read_project_file', { path: logFilePath }).catch(() => '');
        setContractLogText(logContent);
      }
    } catch (err) {
      console.warn("Error fetching inspector database details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch resource locks
  const fetchLocks = async () => {
    if (!agent) return;
    try {
      const allLocks = await invoke<any[]>('get_resource_locks');
      const nowSecs = Math.floor(Date.now() / 1000);
      const mappedLocks = allLocks
        .filter((l: any) => l.agent_id === agent.id)
        .map((l: any) => ({
          file: l.file_path,
          agentName: agent.name,
          expiresInSecs: Math.max(0, l.expires_at - nowSecs),
          lastHeartbeatSecsAgo: Math.max(0, nowSecs - l.heartbeat_at)
        }));
      setLocks(mappedLocks);
    } catch (err) {
      console.warn("Error fetching locks:", err);
    }
  };

  // Fetch checkpoints (snapshots)
  const fetchCheckpoints = async () => {
    if (!execution) return;
    try {
      const list = await invoke<any[]>('list_execution_snapshots', { executionId: execution.id });
      const mappedCheckpoints = list.map((chk, idx) => ({
        id: chk.id,
        name: `Worktree Snapshot (Commit ${chk.head_commit.substring(0, 7)})`,
        hash: chk.head_commit,
        timestamp: chk.timestamp,
        status: (idx === 0 ? 'active' : 'archived') as 'active' | 'archived'
      }));
      setCheckpoints(mappedCheckpoints);
    } catch (err) {
      console.warn("Failed to load checkpoints:", err);
    }
  };

  useEffect(() => {
    if (isOpen && execution) {
      fetchData();
      fetchCheckpoints();
    }
  }, [isOpen, execution, worktreePath]);

  // Real-time polling when execution is actively running or validating
  useEffect(() => {
    if (!isOpen || !execution) return;

    const isExecuting = execution.status === 'running' || execution.status === 'validating';
    if (!isExecuting) return;

    const pollInterval = setInterval(() => {
      fetchData();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isOpen, execution]);

  // Periodic lock refetching and heartbeat ticking
  useEffect(() => {
    if (!isOpen || !agent) return;

    fetchLocks();

    const fetchInterval = setInterval(() => {
      fetchLocks();
    }, 5000);

    const tickInterval = setInterval(() => {
      setLocks(prev => 
        prev.map(lock => ({
          ...lock,
          expiresInSecs: Math.max(0, lock.expiresInSecs - 1),
          lastHeartbeatSecsAgo: lock.lastHeartbeatSecsAgo + 1
        }))
      );
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(tickInterval);
    };
  }, [isOpen, agent]);

  if (!isOpen || !agent) return null;

  const handleClose = () => {
    setOpen(false);
    setSelectedAgentId(null);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const handleRevertCheckpoint = async (chkId: string) => {
    if (!execution) return;
    setRevertingId(chkId);
    try {
      await invoke('revert_execution_snapshot', { executionId: execution.id, snapshotId: chkId });
      useOrchestratorStore.getState().showAlertDialog('Revert Checkpoint', 'Workspace successfully reverted to checkpoint state.');
      fetchCheckpoints();
      fetchData();
    } catch (err) {
      console.error("Failed to revert checkpoint:", err);
      useOrchestratorStore.getState().showAlertDialog('Revert Failed', "Failed to revert: " + err);
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center font-sans">
      <div className="bg-[#0c0c0e] border border-zinc-800 rounded-xl w-full max-w-4xl h-[600px] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-[#0f0f12] flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              agent.status === 'running' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400'
            }`}>
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                {agent.name}
                <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                  agent.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 animate-pulse' :
                  agent.status === 'error' ? 'bg-rose-500/10 text-rose-400 border-rose-500/25' :
                  'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}>
                  {agent.status}
                </span>
              </h2>
              <p className="text-[10px] text-zinc-500 font-mono">
                Agent ID: {agent.id} | Role: {agent.role || 'Builder'}
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-4 border-b border-zinc-800/80 bg-[#0a0a0c] flex items-center gap-1 shrink-0 h-11">
          <TabButton active={activeTab === 'task'} onClick={() => setActiveTab('task')} icon={<ListTodo size={12} />} label="Current Task" />
          <TabButton active={activeTab === 'reasoning'} onClick={() => setActiveTab('reasoning')} icon={<Bot size={12} />} label="Reasoning Summary" />
          <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<FileCode size={12} />} label="Files Modified" />
          <TabButton active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} icon={<Terminal size={12} />} label="Terminal Logs" />
          <TabButton active={activeTab === 'locks'} onClick={() => setActiveTab('locks')} icon={<Lock size={12} />} label="Active Locks" />
          <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<History size={12} />} label="Event Logs" />
          <TabButton active={activeTab === 'checkpoints'} onClick={() => setActiveTab('checkpoints')} icon={<CheckCircle size={12} />} label="Checkpoints" />
        </div>

        {/* Content Pane */}
        <div className="flex-grow overflow-y-auto p-6 min-h-0 bg-[#08080a]">
          {isLoading && (
            <div className="h-full w-full flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-amber-500" />
            </div>
          )}

          {!isLoading && (
            <>
              {/* Tab: Current Task */}
              {activeTab === 'task' && (
                <div className="space-y-4">
                  {task ? (
                    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <h3 className="text-sm font-bold text-white">{task.title}</h3>
                        <span className={`text-[9px] uppercase font-bold tracking-widest font-mono px-2 py-0.5 rounded border ${
                          task.priority === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          task.priority === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                          'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                          {task.priority} Priority
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{task.description}</p>
                      {contractData && (
                        <div className="pt-2 border-t border-zinc-800/60 space-y-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block font-mono">Scope constraints (Glob Rules)</span>
                          <div className="flex flex-wrap gap-1.5">
                            {contractData.allowedPatterns.map((pat: string) => (
                              <span key={pat} className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-mono px-2 py-0.5 rounded">
                                {pat}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                      No active task currently assigned to this agent.
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Reasoning Summary */}
              {activeTab === 'reasoning' && (
                <div className="space-y-4">
                  {dbLogs.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 font-mono">Agent Reasoning Stream</h3>
                      <div className="space-y-2.5">
                        {dbLogs
                          .filter(l => l.message.includes('thought') || l.message.includes('reasoning') || l.level === 'INFO')
                          .map((log) => (
                            <div key={log.id} className="p-3 bg-zinc-900/30 border border-zinc-800/80 rounded-lg flex items-start gap-3">
                              <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center text-[10px] shrink-0 font-mono font-bold">
                                ?
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-zinc-300 leading-relaxed font-sans">{log.message}</p>
                                <span className="text-[9px] text-zinc-650 font-mono">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                      No reasoning logs captured for this execution.
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Files Modified */}
              {activeTab === 'files' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 font-mono">Files Written / Touched by Agent</h3>
                  {dbArtifacts.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {dbArtifacts.map((art) => (
                        <div key={art.id} className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg flex items-center justify-between font-mono text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="text-zinc-250 truncate block" title={art.file_path}>
                              {art.file_path.split(/[\\/]/).pop()}
                            </span>
                            <span className="text-[9px] text-zinc-500 truncate block mt-0.5" title={art.file_path}>
                              {art.file_path}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-right">
                            <span className="text-[10px] text-zinc-400">
                              {(art.size_bytes / 1024).toFixed(2)} KB
                            </span>
                            <span className="text-[9px] text-zinc-550 uppercase bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                              {art.artifact_type}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                      No files modified during this session.
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Terminal Logs */}
              {activeTab === 'terminal' && (
                <div className="flex flex-col h-[450px] bg-black border border-zinc-800 rounded-lg overflow-hidden relative">
                  <div className="px-4 py-2 border-b border-zinc-800 bg-[#0d0d10] flex justify-between items-center select-none shrink-0 font-mono text-[10px] text-zinc-500">
                    <span>CWD: {worktreePath || 'unknown'}</span>
                    <button 
                      onClick={fetchData} 
                      className="text-amber-500 hover:text-amber-400 flex items-center gap-1.5"
                    >
                      <RefreshCw size={10} /> Reload Log
                    </button>
                  </div>
                  <div className="flex-grow p-4 overflow-y-auto font-mono text-[11px] text-emerald-450 leading-relaxed selection:bg-emerald-500/20 selection:text-emerald-400 scrollbar-thin">
                    {contractLogText ? (
                      <pre className="whitespace-pre-wrap select-text">{contractLogText}</pre>
                    ) : dbLogs.length > 0 ? (
                      <div className="space-y-1">
                        {dbLogs.map((log) => (
                          <div key={log.id} className="flex gap-2">
                            <span className="text-zinc-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className={log.level === 'ERROR' ? 'text-rose-400' : 'text-zinc-300'}>
                              {log.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-zinc-600 italic">No workspace terminal output logs recorded.</span>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Active Locks */}
              {activeTab === 'locks' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 font-mono">Concurrency Write Locks</h3>
                    {locks.length > 0 && (
                      <span className="text-[9px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {locks.length} files locked
                      </span>
                    )}
                  </div>

                  {locks.length > 0 ? (
                    <div className="space-y-2.5">
                      {locks.map((lock) => (
                        <div key={lock.file} className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-lg flex items-center justify-between font-mono text-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                              <Lock size={14} />
                            </div>
                            <div>
                              <span className="text-zinc-200 font-bold block">{lock.file.split('/').pop()}</span>
                              <span className="text-[9px] text-zinc-500 block mt-0.5">{lock.file}</span>
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            <div className="text-[10px] text-amber-400">
                              Expires in: <span className="font-bold">{formatTime(lock.expiresInSecs)}</span>
                            </div>
                            <div className="text-[9px] text-zinc-500">
                              Heartbeat: {lock.lastHeartbeatSecsAgo}s ago
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                      No active resource locks held by this agent.
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Event Logs */}
              {activeTab === 'events' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 font-mono">Timeline Events</h3>
                  {dbEvents.length > 0 ? (
                    <div className="relative border-l border-zinc-800 ml-3 pl-6 space-y-5 py-2">
                      {dbEvents.map((evt) => (
                        <div key={evt.id} className="relative group">
                          {/* Dot marker */}
                          <div className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-zinc-900 border-2 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-200 font-bold uppercase tracking-wide font-mono">{evt.event_type}</span>
                              <span className="text-[9px] text-zinc-500 font-mono">
                                {new Date(evt.timestamp).toLocaleString()}
                              </span>
                            </div>
                            {evt.detail && (
                              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">{evt.detail}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                      No execution lifecycle events found.
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Checkpoints */}
              {activeTab === 'checkpoints' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 font-mono">Swarm Workspace Restore Milestones</h3>
                  <div className="space-y-3">
                    {checkpoints.map((chk) => (
                      <div key={chk.id} className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-lg flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                            chk.status === 'active' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-zinc-800/80 text-zinc-400 border-zinc-700'
                          }`}>
                            <CheckCircle size={14} />
                          </div>
                          <div>
                            <span className="text-zinc-200 font-bold block">{chk.name}</span>
                            <span className="text-[9px] text-zinc-500 font-mono block mt-0.5">
                              Hash: {chk.hash} | Saved: {new Date(chk.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        <div>
                          <button
                            onClick={() => handleRevertCheckpoint(chk.id)}
                            disabled={revertingId !== null}
                            className="bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-amber-500 disabled:opacity-40 text-zinc-400 text-[10px] font-mono px-3 py-1.5 rounded transition-all cursor-pointer"
                          >
                            {revertingId === chk.id ? 'Reverting...' : 'Revert State'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`h-[30px] px-3 rounded text-[10px] font-bold tracking-wider uppercase border transition-all flex items-center gap-1.5 cursor-pointer ${
        active
          ? 'border-amber-500 text-amber-500 bg-amber-500/5'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
