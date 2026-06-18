/**
 * Nexora — Terminal Store (Zustand)
 *
 * Manages terminal sessions, command blocks, and active state.
 * Adapted from Warp's TerminalModel + BlockList architecture.
 */
import { create } from 'zustand';
import type {
  TerminalBlock,
  TerminalSession,
  BlockId,
  SessionId,
  BlockStatus,
} from '../types/terminal';

interface TerminalState {
  /** All terminal sessions indexed by ID */
  sessions: Map<string, TerminalSession>;
  /** Currently focused session */
  activeSessionId: SessionId | null;

  // --- Session Actions ---
  /** Create a new terminal session */
  createSession: (session: TerminalSession) => void;
  /** Remove a terminal session */
  removeSession: (sessionId: SessionId) => void;
  /** Set the active session */
  setActiveSession: (sessionId: SessionId) => void;

  // --- Block Actions ---
  /** Add a new block to a session */
  addBlock: (sessionId: SessionId, block: TerminalBlock) => void;
  /** Update a block's output (append) */
  appendBlockOutput: (sessionId: SessionId, blockId: BlockId, output: string) => void;
  /** Update a block's status */
  updateBlockStatus: (
    sessionId: SessionId,
    blockId: BlockId,
    status: BlockStatus,
    exitCode?: number
  ) => void;
  /** Toggle block collapsed state */
  toggleBlockCollapse: (sessionId: SessionId, blockId: BlockId) => void;
  /** Toggle block bookmark */
  toggleBlockBookmark: (sessionId: SessionId, blockId: BlockId) => void;
  /** Update session CWD */
  updateCwd: (sessionId: SessionId, cwd: string) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: new Map(),
  activeSessionId: null,

  createSession: (session) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.set(session.id, session);
      return {
        sessions,
        activeSessionId: state.activeSessionId ?? session.id,
      };
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.delete(sessionId);
      const activeSessionId =
        state.activeSessionId === sessionId
          ? (sessions.keys().next().value ?? null)
          : state.activeSessionId;
      return { sessions, activeSessionId };
    }),

  setActiveSession: (sessionId) =>
    set({ activeSessionId: sessionId }),

  addBlock: (sessionId, block) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(sessionId);
      if (!session) return state;

      sessions.set(sessionId, {
        ...session,
        blocks: [...session.blocks, block],
        activeBlockId: block.id,
      });
      return { sessions };
    }),

  appendBlockOutput: (sessionId, blockId, output) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(sessionId);
      if (!session) return state;

      const blocks = session.blocks.map((b) =>
        b.id === blockId ? { ...b, output: b.output + output } : b
      );
      sessions.set(sessionId, { ...session, blocks });
      return { sessions };
    }),

  updateBlockStatus: (sessionId, blockId, status, exitCode) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(sessionId);
      if (!session) return state;

      const now = new Date();
      const blocks = session.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const endTime = status === 'success' || status === 'error' ? now : b.endTime;
        const startTime = status === 'running' ? now : b.startTime;
        const duration =
          startTime && endTime
            ? endTime.getTime() - startTime.getTime()
            : b.duration;
        return {
          ...b,
          status,
          exitCode: exitCode ?? b.exitCode,
          startTime,
          endTime,
          duration,
        };
      });
      sessions.set(sessionId, { ...session, blocks });
      return { sessions };
    }),

  toggleBlockCollapse: (sessionId, blockId) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(sessionId);
      if (!session) return state;

      const blocks = session.blocks.map((b) =>
        b.id === blockId ? { ...b, isCollapsed: !b.isCollapsed } : b
      );
      sessions.set(sessionId, { ...session, blocks });
      return { sessions };
    }),

  toggleBlockBookmark: (sessionId, blockId) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(sessionId);
      if (!session) return state;

      const blocks = session.blocks.map((b) =>
        b.id === blockId ? { ...b, isBookmarked: !b.isBookmarked } : b
      );
      sessions.set(sessionId, { ...session, blocks });
      return { sessions };
    }),

  updateCwd: (sessionId, cwd) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(sessionId);
      if (!session) return state;

      sessions.set(sessionId, { ...session, cwd });
      return { sessions };
    }),
}));
