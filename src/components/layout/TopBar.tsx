/**
 * Multi Vibe — TopBar Component
 *
 * Header bar with logo, central search/command trigger, and action buttons.
 */
import React from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useTerminalStore } from '../../stores/terminalStore';
import './TopBar.css';

export const TopBar: React.FC = () => {
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleCommandPalette = useLayoutStore((s) => s.toggleCommandPalette);
  const theme = useLayoutStore((s) => s.theme);
  const setTheme = useLayoutStore((s) => s.setTheme);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const sessions = useTerminalStore((s) => s.sessions);

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;

  return (
    <header className="glass-topbar topbar">
      <div className="topbar__left">
        <button 
          className="glass-button glass-button--icon glass-button--sm topbar__sidebar-toggle"
          onClick={toggleSidebar}
          title="Toggle Sidebar (Ctrl+B)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
        <span className="topbar__logo">Multi Vibe</span>
        {activeSession && (
          <span className="topbar__session-info font-mono text-muted">
            /{activeSession.shell}
          </span>
        )}
      </div>

      <div className="topbar__center" onClick={toggleCommandPalette}>
        <div className="topbar__search-trigger glass-input">
          <svg className="topbar__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="text-muted">Search commands, agents, or files...</span>
          <kbd className="topbar__kbd">Ctrl+Shift+P</kbd>
        </div>
      </div>

      <div className="topbar__right">
        <div className="topbar__themes">
          <button
            className={`topbar__theme-btn ${theme === 'void' ? 'topbar__theme-btn--active' : ''}`}
            onClick={() => setTheme('void')}
            title="Void (Dark)"
          >
            ●
          </button>
          <button
            className={`topbar__theme-btn ${theme === 'neon' ? 'topbar__theme-btn--active' : ''}`}
            onClick={() => setTheme('neon')}
            title="Neon Pulse"
          >
            ●
          </button>
        </div>
        <div className="topbar__status">
          <span className="status-indicator status-indicator--online" />
          <span className="text-muted text-xs">Connected</span>
        </div>
      </div>
    </header>
  );
};
