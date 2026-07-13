import React, { useEffect, useState } from "react";
import { Cpu, HardDrive, GitBranch, FolderOpen, Check, Terminal } from "lucide-react";
import { useOrchestratorStore } from "../stores/orchestratorStore";
import { useShallow } from "zustand/react/shallow";
import { SystemMetricsService } from "../services/SystemMetricsService";

/**
 * StatusBar — Isolated leaf component for the bottom application status bar.
 *
 * Previously, cpuLoad and ramLoad state lived directly in the App() root
 * component, causing the entire UI tree to re-render every 2 seconds.
 * By extracting this into its own component, polling re-renders are
 * fully contained here and don't propagate upward.
 *
 * Uses SystemMetricsService singleton so PerformanceOverlay.tsx can share
 * the same poll without a second IPC call.
 */
export const StatusBar = React.memo(function StatusBar() {
  const [cpuLoad, setCpuLoad] = useState(0);
  const [ramLoad, setRamLoad] = useState(0);

  const { settings, activeWorkspaceId, workspaces, terminals, gitBranch } =
    useOrchestratorStore(
      useShallow((s) => ({
        settings: s.settings,
        activeWorkspaceId: s.activeWorkspaceId,
        workspaces: s.workspaces,
        terminals: s.terminals,
        gitBranch: (s as any).gitBranch as string | undefined,
      }))
    );

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

  // Subscribe to shared metrics service — no extra IPC calls
  useEffect(() => {
    return SystemMetricsService.subscribe((m) => {
      setCpuLoad(Number(m.cpu.toFixed(1)));
      setRamLoad(Number(m.ram_gb.toFixed(2)));
    });
  }, []);

  if (settings?.appearance?.workspace?.showStatusBar === false) return null;

  return (
    <div 
      className="h-7 border-t px-4 flex items-center justify-between text-[10px] font-sans select-none flex-shrink-0 z-40 relative shadow-[0_-4px_12px_rgba(0,0,0,0.4)]"
      style={{
        background: 'var(--bg-glass, rgba(7, 8, 15, 0.8))',
        borderColor: 'var(--border-glass, rgba(255, 255, 255, 0.04))',
        backdropFilter: 'blur(var(--glass-blur, 16px))',
        WebkitBackdropFilter: 'blur(var(--glass-blur, 16px))',
        color: 'var(--text-muted, #71717a)'
      }}
    >
      {/* Horizontal ambient gradient top glow */}
      <div 
        className="absolute top-0 left-0 right-0 h-[1px]" 
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(var(--accent-primary-rgb), 0.2), transparent)'
        }}
      />

      {/* Left section: Connection & Workspace info */}
      <div className="flex items-center gap-3">
        {/* Connection status badge */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--agent-status-success)]/5 border border-[var(--agent-status-success)]/15 text-[var(--agent-status-success)]/90 text-[9px] font-bold shadow-[0_0_8px_rgba(16,185,129,0.02)]">
          <span className="w-1 h-1 rounded-full bg-[var(--agent-status-success)] animate-pulse" />
          PTY SERVER
        </div>

        {activeWs && (
          <div 
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium font-mono text-[10px]"
            style={{
              background: 'rgba(var(--accent-primary-rgb), 0.06)',
              border: '1px solid rgba(var(--accent-primary-rgb), 0.15)',
              color: 'var(--accent-primary, #38bdf8)',
              boxShadow: '0 0 8px rgba(var(--accent-primary-rgb), 0.02)'
            }}
          >
            <FolderOpen size={10} style={{ color: 'var(--accent-primary, #38bdf8)', opacity: 0.8 }} />
            <span>{activeWs.name}</span>
          </div>
        )}

        {settings?.appearance?.workspace?.showGitBranch && gitBranch && (
          <div 
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium font-mono text-[10px]"
            style={{
              background: 'rgba(var(--accent-secondary-rgb), 0.06)',
              border: '1px solid rgba(var(--accent-secondary-rgb), 0.15)',
              color: 'var(--accent-secondary, #2563eb)',
              boxShadow: '0 0 8px rgba(var(--accent-secondary-rgb), 0.02)'
            }}
          >
            <GitBranch size={10} style={{ color: 'var(--accent-secondary, #2563eb)', opacity: 0.8 }} />
            <span>{gitBranch}</span>
          </div>
        )}

        {activeWs && (
          <div
            className="hidden md:flex items-center gap-1.5 max-w-[280px] truncate transition-colors duration-150 hover:text-text-primary cursor-default"
            style={{ color: 'var(--text-muted, #71717a)' }}
            title={activeWs.rootPath}
          >
            <span style={{ color: 'var(--border-glass, rgba(255,255,255,0.06))' }}>/</span>
            <span className="text-[9px] font-mono truncate">{activeWs.rootPath}</span>
          </div>
        )}
      </div>

      {/* Right section: Session state & Metrics */}
      <div className="flex items-center gap-3">
        {/* Sync Status */}
        <div className="flex items-center gap-1.5 text-[var(--agent-status-success)]/90 bg-[var(--agent-status-success)]/5 border border-[var(--agent-status-success)]/10 px-2 py-0.5 rounded-md text-[9px] font-medium font-mono">
          <Check size={9} className="text-[var(--agent-status-success)]/80" />
          <span>Synced</span>
        </div>

        <div className="h-3 w-[1px]" style={{ background: 'var(--border-glass, rgba(255,255,255,0.06))' }} />

        {/* Metrics Gauges */}
        <div className="flex items-center gap-2">
          {/* CPU */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors font-mono cursor-default"
            style={{
              background: 'rgba(var(--accent-primary-rgb), 0.06)',
              border: '1px solid rgba(var(--accent-primary-rgb), 0.12)',
              color: 'var(--accent-primary, #38bdf8)'
            }}
            title="Global CPU Load"
          >
            <Cpu size={10} style={{ color: 'var(--accent-primary, #38bdf8)', opacity: 0.8 }} />
            <span>
              CPU <span className="font-bold" style={{ color: 'var(--text-primary, #f4f4f5)' }}>{cpuLoad}%</span>
            </span>
          </div>

          {/* RAM */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors font-mono cursor-default"
            style={{
              background: 'rgba(var(--accent-secondary-rgb), 0.06)',
              border: '1px solid rgba(var(--accent-secondary-rgb), 0.12)',
              color: 'var(--accent-secondary, #2563eb)'
            }}
            title="Global Memory Used"
          >
            <HardDrive size={10} style={{ color: 'var(--accent-secondary, #2563eb)', opacity: 0.8 }} />
            <span>
              RAM <span className="font-bold" style={{ color: 'var(--text-primary, #f4f4f5)' }}>{ramLoad} GB</span>
            </span>
          </div>

          {/* PTYs */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors font-mono cursor-default"
            style={{
              background: 'var(--bg-glass-light, rgba(255,255,255,0.02))',
              border: '1px solid var(--border-glass, rgba(255,255,255,0.04))',
              color: 'var(--text-muted, #71717a)'
            }}
            title="Active PTY Processes"
          >
            <Terminal size={10} style={{ color: 'var(--text-muted, #71717a)', opacity: 0.6 }} />
            <span>
              PTYs <span className="font-bold" style={{ color: 'var(--text-primary, #f4f4f5)' }}>{terminals.length}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
