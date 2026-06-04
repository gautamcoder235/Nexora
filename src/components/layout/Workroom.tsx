/**
 * Multi Vibe — Workroom Layout
 *
 * The main workspace container with BridgeSpace-style layout:
 * TopBar + Sidebar + PaneManager + BottomBar
 */
import React from 'react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomBar } from './BottomBar';
import { PaneManager } from './PaneManager';
import { useLayoutStore } from '../../stores/layoutStore';
import './Workroom.css';

export const Workroom: React.FC = () => {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);

  return (
    <div className="workroom">
      <TopBar />
      <div className="workroom__body">
        {sidebarVisible && (
          <Sidebar style={{ width: `${sidebarWidth}px` }} />
        )}
        <main className="workroom__main">
          <PaneManager />
        </main>
      </div>
      <BottomBar />
    </div>
  );
};
