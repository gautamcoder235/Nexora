/**
 * Nexora — Terminal Type Definitions
 * Adapted from Warp's Block-based architecture
 */

/** Unique identifier for a terminal block */
export type BlockId = string;

/** Unique identifier for a terminal session */
export type SessionId = string;

/** Block execution status — mirrors Warp's BlockState enum */
export type BlockStatus = 'idle' | 'running' | 'success' | 'error';

/**
 * A terminal command block — the core unit of Nexora's terminal.
 * Each block represents one command and its output, inspired by Warp's Block struct.
 *
 * @see Warp's `app/src/terminal/model/block.rs` for the original Rust implementation
 */
export interface TerminalBlock {
  /** Unique block identifier (UUID) */
  id: BlockId;
  /** The command text entered by the user */
  command: string;
  /** Raw command output text */
  output: string;
  /** Current execution status */
  status: BlockStatus;
  /** Process exit code (null if still running or idle) */
  exitCode: number | null;
  /** When the command started executing */
  startTime: Date | null;
  /** When the command finished executing */
  endTime: Date | null;
  /** Working directory at time of execution */
  pwd: string;
  /** Git branch name (if in a git repo) */
  gitBranch: string | null;
  /** Whether the user bookmarked this block */
  isBookmarked: boolean;
  /** Whether the output is collapsed */
  isCollapsed: boolean;
  /** Agent that ran this command (if any) */
  agentId: string | null;
  /** Duration in milliseconds (computed from start/end) */
  duration: number | null;
}

/**
 * A terminal session — represents one shell instance.
 * Multiple sessions can exist in different panes/tabs.
 */
export interface TerminalSession {
  /** Unique session identifier */
  id: SessionId;
  /** Shell type being used */
  shell: ShellType;
  /** Shell display name */
  shellName: string;
  /** Ordered list of command blocks */
  blocks: TerminalBlock[];
  /** Currently active (focused) block */
  activeBlockId: BlockId | null;
  /** Current working directory */
  cwd: string;
  /** Whether this session is connected */
  isConnected: boolean;
  /** When this session was created */
  createdAt: Date;
}

/** Supported shell types */
export type ShellType =
  | 'powershell'
  | 'cmd'
  | 'bash'
  | 'zsh'
  | 'fish'
  | 'wsl';

/** Shell information from the backend */
export interface ShellInfo {
  name: string;
  path: string;
  shellType: ShellType;
}

/**
 * OSC 133 shell integration markers — used to parse PTY output into blocks.
 * These are the same markers Warp uses for block boundary detection.
 */
export const OSC_MARKERS = {
  /** Prompt start — shell is ready for input */
  PROMPT_START: '\x1b]133;A\x07',
  /** Prompt end / Command start — user submitted a command */
  COMMAND_START: '\x1b]133;B\x07',
  /** Pre-exec — command is about to execute */
  PRE_EXEC: '\x1b]133;C\x07',
  /** Command done — includes exit code */
  COMMAND_DONE_PREFIX: '\x1b]133;D;',
} as const;

/** Terminal resize event */
export interface TerminalSize {
  cols: number;
  rows: number;
}
