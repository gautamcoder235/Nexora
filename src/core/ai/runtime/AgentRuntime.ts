// ─── Nexora AI Runtime — Agent Runtime ─────────────────────────────────────
// Integrates AI-spawned agents with Nexora's existing PTY system and TeamStore.
// Manages: spawn, monitor heartbeat, read transcripts, detect completion.

import type { ExecutionNode, AgentRole, TimelineEvent } from '../protocol';
import { EventBus } from '../../events';

// ─── Agent Instance ───────────────────────────────────────────────────────

/** An AI-managed agent instance running in a PTY terminal. */
export interface ManagedAgent {
  /** Unique agent instance ID. */
  id: string;
  /** The PTY terminal session ID this agent runs in. */
  terminalSessionId: string;
  /** Execution node this agent is working on. */
  executionNodeId: string;
  /** The CLI command (e.g., 'claude', 'opencode', 'codex'). */
  cliCommand: string;
  /** Human-readable label. */
  label: string;
  /** Assigned role. */
  role: AgentRole;
  /** Current lifecycle status. */
  status: ManagedAgentStatus;
  /** Prompt that was sent to this agent. */
  prompt: string;
  /** Timestamp when the agent was spawned. */
  spawnedAt: number;
  /** Timestamp of last detected output. */
  lastActivityAt: number;
  /** Whether the agent has been detected as waiting for input. */
  waitingForInput: boolean;
  /** Detected question (if waiting for input). */
  detectedQuestion?: string;
  /** Completion summary (if detected). */
  completionSummary?: string;
}

export type ManagedAgentStatus =
  | 'spawning'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'killed';

// ─── Heartbeat Config ─────────────────────────────────────────────────────

/** Configuration for agent health monitoring. */
export interface HeartbeatConfig {
  /** How often to check for agent activity (ms). */
  checkIntervalMs: number;
  /** How long without output before marking as stalled (ms). */
  stallThresholdMs: number;
  /** Maximum time an agent can run before forced timeout (ms). */
  maxRuntimeMs: number;
}

const DEFAULT_HEARTBEAT: HeartbeatConfig = {
  checkIntervalMs: 5_000,
  stallThresholdMs: 60_000,
  maxRuntimeMs: 600_000, // 10 minutes
};

// ─── Agent Runtime ────────────────────────────────────────────────────────

/**
 * Manages AI-spawned agent instances running in Nexora's PTY terminals.
 * Coordinates with the existing orchestratorStore for terminal creation
 * and TeamStore for multi-agent graph visualization.
 *
 * The runtime does NOT directly invoke Tauri IPC — it publishes events
 * that the UI/store layer handles for actual PTY spawning.
 */
export class AgentRuntime {
  private static instance: AgentRuntime | null = null;

  private agents: Map<string, ManagedAgent> = new Map();
  private heartbeatConfig: HeartbeatConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventUnsubscribers: Array<() => void> = [];

  private constructor(config?: Partial<HeartbeatConfig>) {
    this.heartbeatConfig = { ...DEFAULT_HEARTBEAT, ...config };
  }

  static getInstance(config?: Partial<HeartbeatConfig>): AgentRuntime {
    if (!AgentRuntime.instance) {
      AgentRuntime.instance = new AgentRuntime(config);
    }
    return AgentRuntime.instance;
  }

  // ─── Agent Lifecycle ──────────────────────────────────────────────────

  /**
   * Register a new managed agent.
   * The actual PTY terminal should already be spawned by the orchestratorStore.
   */
  registerAgent(agent: ManagedAgent): void {
    this.agents.set(agent.id, agent);

    EventBus.publish('ai:agent:registered', {
      agentId: agent.id,
      label: agent.label,
      role: agent.role,
      terminalSessionId: agent.terminalSessionId,
    });

    // Start heartbeat monitoring if not already running
    if (!this.heartbeatTimer) {
      this.startHeartbeat();
    }
  }

  /**
   * Update agent status.
   */
  updateStatus(agentId: string, status: ManagedAgentStatus): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const previousStatus = agent.status;
    agent.status = status;

    if (status === 'completed' || status === 'failed' || status === 'killed') {
      EventBus.publish('ai:agent:finished', {
        agentId,
        label: agent.label,
        status,
        durationMs: Date.now() - agent.spawnedAt,
        summary: agent.completionSummary,
      });
    }

    EventBus.publish('ai:agent:status_changed', {
      agentId,
      previousStatus,
      newStatus: status,
    });
  }

  /**
   * Record activity (output detected) from an agent.
   */
  recordActivity(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.lastActivityAt = Date.now();
    if (agent.status === 'waiting_input') {
      agent.status = 'running';
      agent.waitingForInput = false;
      agent.detectedQuestion = undefined;
    }
  }

  /**
   * Record that an agent is waiting for user input.
   */
  recordWaitingForInput(agentId: string, question: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = 'waiting_input';
    agent.waitingForInput = true;
    agent.detectedQuestion = question;

    EventBus.publish('ai:agent:waiting_input', {
      agentId,
      label: agent.label,
      question,
    });
  }

  /**
   * Record that an agent has completed its task.
   */
  recordCompletion(agentId: string, summary: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.completionSummary = summary;
    this.updateStatus(agentId, 'completed');
  }

  /**
   * Kill a managed agent.
   */
  killAgent(agentId: string): void {
    this.updateStatus(agentId, 'killed');
  }

  /**
   * Remove an agent from management (after it's fully done).
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);

    // Stop heartbeat if no agents left
    if (this.agents.size === 0 && this.heartbeatTimer) {
      this.stopHeartbeat();
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────

  /** Get all managed agents. */
  getAllAgents(): ManagedAgent[] {
    return Array.from(this.agents.values());
  }

  /** Get agents by status. */
  getAgentsByStatus(status: ManagedAgentStatus): ManagedAgent[] {
    return this.getAllAgents().filter(a => a.status === status);
  }

  /** Get agent by terminal session ID. */
  getAgentByTerminal(terminalSessionId: string): ManagedAgent | undefined {
    return this.getAllAgents().find(a => a.terminalSessionId === terminalSessionId);
  }

  /** Get agents working on a specific execution node. */
  getAgentsByExecutionNode(executionNodeId: string): ManagedAgent[] {
    return this.getAllAgents().filter(a => a.executionNodeId === executionNodeId);
  }

  /** Check if any agents are still actively running. */
  hasActiveAgents(): boolean {
    return this.getAllAgents().some(
      a => a.status === 'spawning' || a.status === 'running' || a.status === 'waiting_input'
    );
  }

  /** Get count of active agents. */
  get activeCount(): number {
    return this.getAllAgents().filter(
      a => a.status === 'spawning' || a.status === 'running' || a.status === 'waiting_input'
    ).length;
  }

  // ─── Heartbeat Monitoring ─────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.heartbeatConfig.checkIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private checkHeartbeats(): void {
    const now = Date.now();

    for (const agent of this.agents.values()) {
      if (agent.status !== 'running' && agent.status !== 'spawning') continue;

      // Check for stall
      const sinceLastActivity = now - agent.lastActivityAt;
      if (sinceLastActivity > this.heartbeatConfig.stallThresholdMs) {
        EventBus.publish('ai:agent:stalled', {
          agentId: agent.id,
          label: agent.label,
          silenceMs: sinceLastActivity,
        });
      }

      // Check for max runtime
      const totalRuntime = now - agent.spawnedAt;
      if (totalRuntime > this.heartbeatConfig.maxRuntimeMs) {
        EventBus.publish('ai:agent:timeout', {
          agentId: agent.id,
          label: agent.label,
          runtimeMs: totalRuntime,
        });
      }
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  /** Stop monitoring and clean up. */
  dispose(): void {
    this.stopHeartbeat();
    for (const unsub of this.eventUnsubscribers) {
      unsub();
    }
    this.eventUnsubscribers = [];
    this.agents.clear();
  }

  /** Reset the singleton (for testing). */
  static resetInstance(): void {
    if (AgentRuntime.instance) {
      AgentRuntime.instance.dispose();
      AgentRuntime.instance = null;
    }
  }
}
