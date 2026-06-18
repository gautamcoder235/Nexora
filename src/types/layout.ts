/**
 * Nexora — Layout Type Definitions
 * For workroom pane management and UI state
 */

/** Split direction for pane layout */
export type SplitDirection = 'horizontal' | 'vertical';

/** Types of content that can occupy a pane */
export type PaneContentType = 'terminal' | 'agent-chat' | 'memory' | 'empty';

/**
 * A pane node in the layout tree.
 * Supports recursive splitting (like a binary tree).
 */
export interface PaneNode {
  /** Unique pane identifier */
  id: string;
  /** What type of content this pane holds */
  type: PaneContentType;
  /** If split, the direction of the split */
  splitDirection: SplitDirection | null;
  /** Child panes (if split) */
  children: PaneNode[];
  /** Split ratio (0-1, how much space this pane takes) */
  ratio: number;
  /** Linked session ID (for terminal panes) */
  sessionId: string | null;
  /** Whether this pane is currently focused */
  isFocused: boolean;
}

/** Sidebar panel that can be shown */
export type SidebarPanel = 'agents' | 'files' | 'memory' | 'settings';

/** Overall workspace layout state */
export interface WorkspaceLayout {
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
}

/** Tab in a terminal pane */
export interface TabInfo {
  /** Tab identifier (matches session ID) */
  id: string;
  /** Display title */
  title: string;
  /** Shell type icon */
  shellType: string;
  /** Whether this tab is active */
  isActive: boolean;
}
