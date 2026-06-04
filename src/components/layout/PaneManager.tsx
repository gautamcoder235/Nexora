/**
 * Multi Vibe — PaneManager Component
 *
 * Recursively renders split panes (terminal, agent-chat, memory) based on layoutStore.
 */
import React from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import type { PaneNode } from '../../types/layout';
import { TerminalPane } from '../terminal/TerminalPane';
import './PaneManager.css';

export const PaneManager: React.FC = () => {
  const rootPane = useLayoutStore((s) => s.rootPane);

  return (
    <div className="pane-manager">
      <PaneNodeRenderer node={rootPane} />
    </div>
  );
};

interface PaneNodeRendererProps {
  node: PaneNode;
}

const PaneNodeRenderer: React.FC<PaneNodeRendererProps> = ({ node }) => {
  const setFocusedPane = useLayoutStore((s) => s.setFocusedPane);
  const splitPane = useLayoutStore((s) => s.splitPane);
  const closePane = useLayoutStore((s) => s.closePane);

  const handleFocus = () => {
    // Only focus if clicking inside this leaf pane and not already focused
    if (node.children.length === 0 && !node.isFocused) {
      setFocusedPane(node.id);
    }
  };

  // If node has children, render them recursively in split views
  if (node.children && node.children.length > 0) {
    const isVertical = node.splitDirection === 'vertical';
    const flexDir = isVertical ? 'row' : 'column';

    return (
      <div 
        className="pane-node pane-node--split" 
        style={{ 
          display: 'flex', 
          flexDirection: flexDir, 
          width: '100%', 
          height: '100%',
          flex: node.ratio,
        }}
      >
        {node.children.map((child, idx) => (
          <React.Fragment key={child.id}>
            {idx > 0 && (
              <div 
                className={`pane-divider pane-divider--${node.splitDirection}`} 
              />
            )}
            <div 
              style={{ 
                flex: child.ratio, 
                display: 'flex',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <PaneNodeRenderer node={child} />
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  // Leaf node: render the pane content based on type
  return (
    <div 
      className={`pane-node pane-node--leaf ${node.isFocused ? 'pane-node--focused' : ''}`}
      onClick={handleFocus}
      style={{ flex: 1 }}
    >
      <div className="pane-node__header font-mono text-xs">
        <span className="pane-node__title">
          {node.type.toUpperCase()} ({node.id.slice(-4)})
        </span>
        <div className="pane-node__actions">
          <button 
            className="pane-node__action-btn"
            onClick={() => splitPane(node.id, 'vertical')}
            title="Split Vertically"
          >
            |
          </button>
          <button 
            className="pane-node__action-btn"
            onClick={() => splitPane(node.id, 'horizontal')}
            title="Split Horizontally"
          >
            —
          </button>
          <button 
            className="pane-node__action-btn pane-node__action-btn--close"
            onClick={() => closePane(node.id)}
            title="Close Pane"
          >
            ×
          </button>
        </div>
      </div>
      <div className="pane-node__content">
        {node.type === 'terminal' ? (
          <TerminalPane paneId={node.id} isFocused={node.isFocused} />
        ) : (
          <div className="pane-node__placeholder text-muted">
            {node.type} Content (Pending implementation in later phases)
          </div>
        )}
      </div>
    </div>
  );
};
