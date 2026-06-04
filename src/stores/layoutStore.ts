/**
 * Multi Vibe — Layout Store (Zustand)
 *
 * Manages workspace layout: sidebar, panes, bottom bar, and theme.
 */
import { create } from 'zustand';
import type {
  PaneNode,
  SidebarPanel,
  SplitDirection,
} from '../types/layout';

interface LayoutState {
  /** Root pane node (layout tree) */
  rootPane: PaneNode;
  /** Whether the sidebar is visible */
  sidebarVisible: boolean;
  /** Current sidebar width in pixels */
  sidebarWidth: number;
  /** Active sidebar panel */
  activeSidebarPanel: SidebarPanel;
  /** Whether the bottom bar is expanded */
  bottomBarExpanded: boolean;
  /** Current theme name */
  theme: string;
  /** Whether the command palette is open */
  commandPaletteOpen: boolean;

  // --- Actions ---
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  toggleBottomBar: () => void;
  setTheme: (theme: string) => void;
  toggleCommandPalette: () => void;
  splitPane: (paneId: string, direction: SplitDirection) => void;
  closePane: (paneId: string) => void;
  setFocusedPane: (paneId: string) => void;
  updatePaneRatio: (paneId: string, ratio: number) => void;
}

/** Generate a unique pane ID */
const generatePaneId = () => `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Helper: recursively find and update a pane in the tree */
function updatePaneInTree(
  node: PaneNode,
  paneId: string,
  updater: (pane: PaneNode) => PaneNode
): PaneNode {
  if (node.id === paneId) return updater(node);
  if (node.children.length === 0) return node;
  return {
    ...node,
    children: node.children.map((child) =>
      updatePaneInTree(child, paneId, updater)
    ),
  };
}

/** Helper: set all panes' isFocused to false, then set target to true */
function setFocusInTree(node: PaneNode, targetId: string): PaneNode {
  const focused = node.id === targetId;
  return {
    ...node,
    isFocused: focused,
    children: node.children.map((child) => setFocusInTree(child, targetId)),
  };
}

export const useLayoutStore = create<LayoutState>((set) => ({
  rootPane: {
    id: generatePaneId(),
    type: 'terminal',
    splitDirection: null,
    children: [],
    ratio: 1,
    sessionId: null,
    isFocused: true,
  },
  sidebarVisible: true,
  sidebarWidth: 260,
  activeSidebarPanel: 'agents',
  bottomBarExpanded: false,
  theme: 'void',
  commandPaletteOpen: false,

  toggleSidebar: () =>
    set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  setSidebarWidth: (width) =>
    set({ sidebarWidth: Math.max(200, Math.min(400, width)) }),

  setSidebarPanel: (panel) =>
    set({ activeSidebarPanel: panel }),

  toggleBottomBar: () =>
    set((state) => ({ bottomBarExpanded: !state.bottomBarExpanded })),

  setTheme: (theme) =>
    set({ theme }),

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  splitPane: (paneId, direction) =>
    set((state) => {
      const newPane: PaneNode = {
        id: generatePaneId(),
        type: 'terminal',
        splitDirection: null,
        children: [],
        ratio: 0.5,
        sessionId: null,
        isFocused: false,
      };

      const rootPane = updatePaneInTree(state.rootPane, paneId, (pane) => ({
        ...pane,
        splitDirection: direction,
        children: [
          { ...pane, id: pane.id, splitDirection: null, children: [], ratio: 0.5 },
          newPane,
        ],
        type: 'empty' as const,
        sessionId: null,
      }));

      return { rootPane };
    }),

  closePane: (paneId) =>
    set((state) => {
      // If closing root pane, just reset it
      if (state.rootPane.id === paneId) {
        return {
          rootPane: {
            id: generatePaneId(),
            type: 'terminal',
            splitDirection: null,
            children: [],
            ratio: 1,
            sessionId: null,
            isFocused: true,
          },
        };
      }

      // Remove pane from tree and promote sibling
      function removePaneFromTree(node: PaneNode): PaneNode | null {
        if (node.children.length === 0) return node;

        const remaining = node.children.filter((c) => c.id !== paneId);
        if (remaining.length < node.children.length) {
          // Found the parent — promote the remaining child
          if (remaining.length === 1) {
            return { ...remaining[0], ratio: node.ratio };
          }
          return { ...node, children: remaining };
        }

        return {
          ...node,
          children: node.children
            .map(removePaneFromTree)
            .filter((c): c is PaneNode => c !== null),
        };
      }

      const rootPane = removePaneFromTree(state.rootPane);
      return { rootPane: rootPane ?? state.rootPane };
    }),

  setFocusedPane: (paneId) =>
    set((state) => ({
      rootPane: setFocusInTree(state.rootPane, paneId),
    })),

  updatePaneRatio: (paneId, ratio) =>
    set((state) => ({
      rootPane: updatePaneInTree(state.rootPane, paneId, (pane) => ({
        ...pane,
        ratio: Math.max(0.15, Math.min(0.85, ratio)),
      })),
    })),
}));
