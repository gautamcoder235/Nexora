/**
 * Multi Vibe — Agent Type Definitions
 * For CLI agent detection and multi-agent swarm orchestration
 */

/** Supported CLI agent types */
export type AgentType =
  | 'claude-code'
  | 'codex'
  | 'gemini-cli'
  | 'aider'
  | 'opencode'
  | 'other';

/** Agent role in a swarm — adapted from BridgeSwarm architecture */
export type AgentRole =
  | 'coordinator'  // Decomposes tasks, assigns work, reviews results
  | 'builder'      // Writes code, runs commands
  | 'scout'        // Researches codebase, reads docs, gathers context
  | 'reviewer';    // Reviews code quality, tests, security

/** Agent execution status */
export type AgentStatus =
  | 'available'    // Detected and ready to use
  | 'running'      // Currently executing a task
  | 'idle'         // In a swarm but not currently working
  | 'error'        // Encountered an error
  | 'offline';     // Not available

/** Information about a detected CLI agent */
export interface AgentInfo {
  /** Unique identifier */
  id: string;
  /** Display name (e.g., "Claude Code") */
  name: string;
  /** Agent type */
  type: AgentType;
  /** Path to the binary */
  binaryPath: string;
  /** Version string */
  version: string | null;
  /** Current status */
  status: AgentStatus;
}

/** A running agent instance in a swarm */
export interface AgentInstance {
  /** Unique instance identifier */
  id: string;
  /** Reference to the agent info */
  agentId: string;
  /** Assigned role in the swarm */
  role: AgentRole;
  /** Current status */
  status: AgentStatus;
  /** Current task description */
  currentTask: string | null;
  /** Message history */
  messages: AgentMessage[];
  /** When this instance was spawned */
  startedAt: Date;
}

/** Message in an agent conversation */
export interface AgentMessage {
  /** Unique message ID */
  id: string;
  /** Who sent this message */
  sender: 'user' | 'agent' | 'system';
  /** Message content (Markdown) */
  content: string;
  /** Timestamp */
  timestamp: Date;
  /** Associated terminal block (if agent ran a command) */
  blockId: string | null;
}

/** Swarm configuration */
export interface SwarmConfig {
  /** Maximum concurrent agents */
  maxAgents: number;
  /** Task to accomplish */
  task: string;
  /** Agent assignments */
  agents: {
    agentId: string;
    role: AgentRole;
  }[];
}

/** Swarm execution state */
export interface SwarmState {
  /** Whether a swarm is active */
  isActive: boolean;
  /** Swarm configuration */
  config: SwarmConfig | null;
  /** Active agent instances */
  instances: AgentInstance[];
  /** Overall progress (0-100) */
  progress: number;
  /** When the swarm started */
  startedAt: Date | null;
}
