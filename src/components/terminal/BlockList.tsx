/**
 * Nexora — BlockList Component
 *
 * Renders the vertical list of terminal command blocks for a session.
 */
import React, { useEffect, useRef } from 'react';
import type { TerminalBlock } from '../../types/terminal';
import { CommandBlock } from './CommandBlock';
import './BlockList.css';

interface BlockListProps {
  sessionId: string;
  blocks: TerminalBlock[];
}

export const BlockList: React.FC<BlockListProps> = ({ sessionId, blocks }) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new blocks or output additions
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [blocks.length, blocks[blocks.length - 1]?.output]);

  if (blocks.length === 0) {
    return (
      <div className="block-list block-list--empty">
        <div className="block-list__welcome glass-card animate-fade-in-scale">
          <h2 className="block-list__welcome-title">Welcome to Nexora</h2>
          <p className="block-list__welcome-desc text-muted">
            An AI-native development environment with Warp-inspired block-based terminal command lines.
          </p>
          <div className="block-list__welcome-tips font-mono text-xs text-secondary">
            <div>💡 Shell defaults detected. Type any command below to begin.</div>
            <div>💡 Individual blocks can be bookmarked (★) or collapsed (－).</div>
            <div>💡 Use the search command palette (Ctrl+Shift+P) to control active agents.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} className="block-list">
      {blocks.map((block) => (
        <CommandBlock key={block.id} sessionId={sessionId} block={block} />
      ))}
    </div>
  );
};
