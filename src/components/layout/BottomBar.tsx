/**
 * Multi Vibe — BottomBar Component
 *
 * Status bar showing agent activities, layout config, and workspace stats.
 */
import React from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import './BottomBar.css';

export const BottomBar: React.FC = () => {
  const bottomBarExpanded = useLayoutStore((s) => s.bottomBarExpanded);
  const toggleBottomBar = useLayoutStore((s) => s.toggleBottomBar);

  return (
    <footer className={`glass-bottombar bottombar ${bottomBarExpanded ? 'bottombar--expanded' : ''}`}>
      <div className="bottombar__left">
        <button 
          className="bottombar__expand-trigger font-mono text-xs"
          onClick={toggleBottomBar}
        >
          {bottomBarExpanded ? '▼ Close Log' : '▲ Open Swarm Activity Log'}
        </button>
        <div className="bottombar__divider" />
        <span className="text-xs text-muted">
          Active Agents: <span className="text-accent font-medium">1/16</span>
        </span>
      </div>

      {bottomBarExpanded && (
        <div className="bottombar__log-pane font-mono text-xs text-secondary">
          <div className="bottombar__log-line"><span className="text-accent">[System]</span> Initiating Swarm Coordinator...</div>
          <div className="bottombar__log-line"><span className="text-accent">[System]</span> Scanning E:\Codes\BridgeSpace for installed agent plugins...</div>
          <div className="bottombar__log-line"><span className="text-accent">[System]</span> Detected Claude Code CLI. Available for integration.</div>
          <div className="bottombar__log-line"><span className="text-accent">[Coordinator]</span> Ready. Spawning sub-sessions on request.</div>
        </div>
      )}

      <div className="bottombar__right text-xs text-muted font-mono">
        <span>CWD: e:\Codes\BridgeSpace</span>
        <div className="bottombar__divider" />
        <span>UTF-8</span>
        <div className="bottombar__divider" />
        <span>Line 1, Col 1</span>
      </div>
    </footer>
  );
};
