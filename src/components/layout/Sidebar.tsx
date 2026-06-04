/**
 * Multi Vibe — Sidebar Component
 *
 * Contains panel selector (left edge) and active panel content (agents, files, memory, settings).
 */
import React from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import type { SidebarPanel } from '../../types/layout';
import './Sidebar.css';

interface SidebarProps {
  style?: React.CSSProperties;
}

export const Sidebar: React.FC<SidebarProps> = ({ style }) => {
  const activePanel = useLayoutStore((s) => s.activeSidebarPanel);
  const setPanel = useLayoutStore((s) => s.setSidebarPanel);

  const panels: { id: SidebarPanel; label: string; icon: React.ReactNode }[] = [
    {
      id: 'agents',
      label: 'AI Agents',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      ),
    },

    {
      id: 'memory',
      label: 'BridgeMemory',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3.001 3.001 0 0 1 0-3.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3.001 3.001 0 0 0 0-3.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  const renderContent = () => {
    switch (activePanel) {
      case 'agents':
        return (
          <div className="sidebar__panel-content animate-fade-in">
            <h3 className="sidebar__panel-title">AI Coding Swarm</h3>
            <p className="sidebar__panel-desc">BridgeSwarm controls up to 16 agents to build software collaboratively.</p>
            <div className="sidebar__agent-list">
              <div className="glass-card sidebar__agent-item sidebar__agent-item--active">
                <div className="sidebar__agent-meta">
                  <span className="sidebar__agent-name font-mono">Coordinator</span>
                  <span className="glass-badge glass-badge--accent">Swarm Leader</span>
                </div>
                <div className="sidebar__agent-status text-xs text-muted">
                  <span className="status-indicator status-indicator--online" /> Idle, awaiting task
                </div>
              </div>
              <div className="glass-card sidebar__agent-item">
                <div className="sidebar__agent-meta">
                  <span className="sidebar__agent-name font-mono">Claude Code</span>
                  <span className="glass-badge">Detected CLI</span>
                </div>
                <div className="sidebar__agent-status text-xs text-muted">
                  Offline
                </div>
              </div>
            </div>
          </div>
        );

      case 'memory':
        return (
          <div className="sidebar__panel-content animate-fade-in">
            <h3 className="sidebar__panel-title">BridgeMemory</h3>
            <p className="sidebar__panel-desc">Local markdown knowledge base for project architecture and decision logs.</p>
            <div className="sidebar__memory-entries text-sm">
              <div className="glass-card sidebar__memory-item">
                <div className="sidebar__memory-meta font-mono text-xs text-muted">
                  Created: 2026-06-04
                </div>
                <div className="sidebar__memory-title font-medium">
                  Authentication Architecture Decision
                </div>
              </div>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="sidebar__panel-content animate-fade-in">
            <h3 className="sidebar__panel-title">Preferences</h3>
            <div className="sidebar__settings-list">
              <div className="sidebar__settings-item">
                <label className="text-sm text-secondary">PTY Shell</label>
                <select className="glass-input text-sm">
                  <option>PowerShell (Default)</option>
                  <option>Command Prompt</option>
                  <option>WSL / Bash</option>
                </select>
              </div>
              <div className="sidebar__settings-item">
                <label className="text-sm text-secondary">GPU Acceleration</label>
                <div className="sidebar__toggle">
                  <input type="checkbox" defaultChecked />
                  <span className="text-xs text-muted">Use WebGL Renderer</span>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <aside className="glass-sidebar sidebar" style={style}>
      <div className="sidebar__icons">
        {panels.map((p) => (
          <button
            key={p.id}
            className={`sidebar__icon-btn ${activePanel === p.id ? 'sidebar__icon-btn--active' : ''}`}
            onClick={() => setPanel(p.id)}
            title={p.label}
          >
            {p.icon}
          </button>
        ))}
      </div>
      <div className="sidebar__panel">
        {renderContent()}
      </div>
    </aside>
  );
};
