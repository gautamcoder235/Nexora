import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Shield, GitBranch, FolderCog, Lock, Unlock, RefreshCw, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useOrchestratorStore } from '../../stores/orchestratorStore';

interface ProjectTypeInfo {
  isGit: boolean;
  isolationMode: 'git' | 'filecopy';
}

interface ResourceLock {
  id: string;
  agent_id: string;
  resource_path: string;
  lock_type: string;
  acquired_at: string;
  expires_at: string | null;
}

export const SecurityPanel: React.FC = () => {
  const [projectType, setProjectType] = useState<ProjectTypeInfo | null>(null);
  const [locks, setLocks] = useState<ResourceLock[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const activeWorkspaceId = useOrchestratorStore(s => s.activeWorkspaceId);
  const workspaces = useOrchestratorStore(s => s.workspaces);
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  const detectProject = async () => {
    if (!activeWorkspace?.rootPath) return;
    setIsLoading(true);
    try {
      const result = await invoke<ProjectTypeInfo>('detect_project_type', {
        projectPath: activeWorkspace.rootPath,
      });
      setProjectType(result);
    } catch (e) {
      console.error('Failed to detect project type:', e);
    }

    try {
      const lockResult = await invoke<ResourceLock[]>('get_resource_locks');
      setLocks(lockResult);
    } catch {
      // Resource locks might not exist yet
    }
    setIsLoading(false);
  };

  useEffect(() => {
    detectProject();
  }, [activeWorkspace?.rootPath]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 font-mono text-[10px]">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Detecting project type...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col font-sans text-xs overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1B1B22] bg-[#121218]/50 flex-shrink-0 select-none">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-[#7C5CFF]" />
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Security & Isolation</span>
        </div>
        <button
          onClick={detectProject}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Project Type Card */}
        <div className={`p-4 rounded-xl border ${
          projectType?.isGit
            ? 'border-emerald-500/20 bg-emerald-500/5'
            : 'border-amber-500/20 bg-amber-500/5'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {projectType?.isGit ? (
              <GitBranch className="w-4 h-4 text-emerald-400" />
            ) : (
              <FolderCog className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-[11px] font-bold text-zinc-200">
              {projectType?.isGit ? 'Git Repository' : 'Non-Git Project'}
            </span>
            <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
              projectType?.isGit
                ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
            }`}>
              {projectType?.isolationMode}
            </span>
          </div>

          <p className="text-[10px] text-zinc-500 leading-relaxed">
            {projectType?.isGit
              ? 'Agents are isolated using Git Worktrees. Each agent gets a separate branch and directory, preventing file conflicts.'
              : 'Agents are isolated using File-Copy Sandboxes. Changed files are tracked via file hashing and merged back after validation.'
            }
          </p>
        </div>

        {/* Isolation Strategy */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-500 block select-none">
            Isolation Strategy
          </span>

          {projectType?.isGit ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-semibold text-zinc-300 block">Git Worktree Sandboxing</span>
                  <span className="text-[9px] text-zinc-500">Each execution creates <code className="text-[#7C5CFF]">.nexora-worktrees/task-&lt;id&gt;/</code></span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-semibold text-zinc-300 block">Contract-Based Ownership</span>
                  <span className="text-[9px] text-zinc-500">Glob patterns in <code className="text-[#7C5CFF]">ownership.json</code> restrict file access per agent</span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-semibold text-zinc-300 block">6-Gate Validation Pipeline</span>
                  <span className="text-[9px] text-zinc-500">Snapshot → Ownership → Git Integrity → TypeCheck → Lint → Test</span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-semibold text-zinc-300 block">Mutex-Protected Merge</span>
                  <span className="text-[9px] text-zinc-500">Global lock ensures one merge at a time with snapshot rollback</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-semibold text-zinc-300 block">File-Copy Sandboxing</span>
                  <span className="text-[9px] text-zinc-500">Sandboxes in <code className="text-[#7C5CFF]">.nexora-sandboxes/</code> with file-watcher tracking</span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-semibold text-zinc-300 block">Hash-Based Change Detection</span>
                  <span className="text-[9px] text-zinc-500">Directory manifest hashing detects modified, added, and deleted files</span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-semibold text-zinc-300 block">Glob-Based Ownership</span>
                  <span className="text-[9px] text-zinc-500">Same ownership contracts apply regardless of VCS backend</span>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-semibold text-zinc-300 block">No Version Control</span>
                  <span className="text-[9px] text-zinc-500">Rollback relies on file backups only — consider initializing a Git repository for better safety.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resource Locks */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-500 block select-none">
            Active Resource Locks
          </span>

          {locks.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50 text-zinc-600">
              <Unlock className="w-3.5 h-3.5" />
              <span className="text-[10px]">No active resource locks</span>
            </div>
          ) : (
            locks.map(lock => (
              <div key={lock.id} className="flex items-start gap-2 p-3 rounded-lg border border-red-500/15 bg-red-500/5">
                <Lock className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold text-zinc-300 block truncate">{lock.resource_path}</span>
                  <span className="text-[9px] text-zinc-500">
                    Held by <strong className="text-zinc-400">{lock.agent_id}</strong> · {lock.lock_type}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Path Info */}
        {activeWorkspace?.rootPath && (
          <div className="p-3 rounded-lg border border-[#1B1B22] bg-[#0D0D10]/50">
            <div className="flex items-center gap-1.5 mb-1">
              <Info className="w-3 h-3 text-zinc-600" />
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Project Path</span>
            </div>
            <code className="text-[9px] text-zinc-400 font-mono break-all">{activeWorkspace.rootPath}</code>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityPanel;
