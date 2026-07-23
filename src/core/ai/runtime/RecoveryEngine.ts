// ─── Nexora AI Runtime — Recovery Engine ───────────────────────────────────
// Handles checkpoint-based recovery from agent crashes, provider failures,
// and execution errors. Implements: Checkpoint → Resume → Retry → Replan.

import type {
  ExecutionCheckpoint,
  ConversationPhase,
  ExecutionNode,
  ExecutionNodeStatus,
} from '../protocol';
import { EventBus } from '../../events';

// ─── Recovery Strategy ────────────────────────────────────────────────────

/** Describes how to recover from a failure. */
export interface RecoveryStrategy {
  type: 'resume' | 'retry' | 'replan' | 'abort';
  /** Which checkpoint to restore from (for resume/retry). */
  checkpointId?: string;
  /** Which execution node failed. */
  failedNodeId?: string;
  /** Max retry attempts. */
  maxRetries: number;
  /** Current retry count. */
  currentRetry: number;
  /** Human-readable reason for this strategy. */
  reason: string;
}

/** Classification of the failure type. */
export type FailureType =
  | 'provider_error'      // LLM API failed (rate limit, server error)
  | 'provider_timeout'    // LLM response timed out
  | 'tool_error'          // Tool execution failed
  | 'tool_timeout'        // Tool execution timed out
  | 'agent_crash'         // PTY agent process crashed
  | 'agent_stall'         // Agent stopped producing output
  | 'validation_failed'   // Reflection/quality gate failed
  | 'budget_exceeded'     // Token or cost budget exhausted
  | 'unknown';

/** A recorded failure event. */
export interface FailureRecord {
  id: string;
  conversationId: string;
  executionNodeId?: string;
  failureType: FailureType;
  error: string;
  timestamp: number;
  /** The recovery strategy that was chosen. */
  strategy: RecoveryStrategy;
  /** Whether recovery succeeded. */
  resolved: boolean;
}

// ─── Recovery Engine ──────────────────────────────────────────────────────

/**
 * Determines and applies recovery strategies for execution failures.
 * Integrates with the AI Kernel's checkpoint system.
 */
export class RecoveryEngine {
  private failureLog: FailureRecord[] = [];
  private readonly MAX_LOG_SIZE = 500;

  /**
   * Classify a failure and determine the recovery strategy.
   */
  classifyAndRecover(
    conversationId: string,
    failureType: FailureType,
    error: string,
    executionNodeId?: string,
    previousRetries: number = 0,
  ): RecoveryStrategy {
    const strategy = this.determineStrategy(failureType, previousRetries);

    const record: FailureRecord = {
      id: `fail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conversationId,
      executionNodeId,
      failureType,
      error,
      timestamp: Date.now(),
      strategy,
      resolved: false,
    };

    this.failureLog.push(record);
    if (this.failureLog.length > this.MAX_LOG_SIZE) {
      this.failureLog = this.failureLog.slice(-Math.floor(this.MAX_LOG_SIZE * 0.8));
    }

    EventBus.publish('ai:recovery:strategy_chosen', {
      conversationId,
      failureType,
      strategy,
    });

    return strategy;
  }

  /**
   * Mark a failure as resolved after successful recovery.
   */
  markResolved(failureId: string): void {
    const record = this.failureLog.find(f => f.id === failureId);
    if (record) {
      record.resolved = true;
    }
  }

  /**
   * Get the failure log for a conversation.
   */
  getFailures(conversationId?: string): FailureRecord[] {
    if (conversationId) {
      return this.failureLog.filter(f => f.conversationId === conversationId);
    }
    return [...this.failureLog];
  }

  /**
   * Get count of unresolved failures for a conversation.
   */
  getUnresolvedCount(conversationId: string): number {
    return this.failureLog.filter(
      f => f.conversationId === conversationId && !f.resolved
    ).length;
  }

  /**
   * Determine the best phase to recover to based on checkpoint availability.
   */
  findBestCheckpoint(
    checkpoints: ExecutionCheckpoint[],
    failedPhase: ConversationPhase,
  ): ExecutionCheckpoint | undefined {
    // Find the most recent checkpoint before the failed phase
    const phaseOrder: ConversationPhase[] = [
      'idle', 'preparing', 'building_context', 'planning',
      'waiting_approval', 'executing', 'observing', 'reflecting',
    ];

    const failedIndex = phaseOrder.indexOf(failedPhase);
    if (failedIndex <= 0) return undefined;

    // Look for checkpoints at earlier phases, preferring the most recent
    const candidates = checkpoints
      .filter(c => {
        const cpIndex = phaseOrder.indexOf(c.phase);
        return cpIndex >= 0 && cpIndex < failedIndex;
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    return candidates[0];
  }

  /**
   * Determine if an execution node should be retried based on failure history.
   */
  shouldRetryNode(
    conversationId: string,
    nodeId: string,
    maxRetries: number = 3,
  ): boolean {
    const nodeFailures = this.failureLog.filter(
      f => f.conversationId === conversationId &&
           f.executionNodeId === nodeId &&
           !f.resolved
    );
    return nodeFailures.length < maxRetries;
  }

  /** Clear failure log. */
  reset(): void {
    this.failureLog = [];
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private determineStrategy(
    failureType: FailureType,
    previousRetries: number,
  ): RecoveryStrategy {
    const maxRetries = this.getMaxRetries(failureType);

    if (previousRetries >= maxRetries) {
      // Exhausted retries — try replanning or abort
      if (failureType === 'validation_failed' || failureType === 'agent_stall') {
        return {
          type: 'replan',
          maxRetries,
          currentRetry: previousRetries,
          reason: `Exhausted ${maxRetries} retries for ${failureType}. Replanning.`,
        };
      }
      return {
        type: 'abort',
        maxRetries,
        currentRetry: previousRetries,
        reason: `Exhausted ${maxRetries} retries for ${failureType}. Aborting.`,
      };
    }

    switch (failureType) {
      case 'provider_error':
      case 'provider_timeout':
        return {
          type: 'retry',
          maxRetries,
          currentRetry: previousRetries + 1,
          reason: `Provider failure — retrying (${previousRetries + 1}/${maxRetries}).`,
        };

      case 'tool_error':
      case 'tool_timeout':
        return {
          type: 'retry',
          maxRetries,
          currentRetry: previousRetries + 1,
          reason: `Tool execution failed — retrying (${previousRetries + 1}/${maxRetries}).`,
        };

      case 'agent_crash':
        return {
          type: 'resume',
          maxRetries,
          currentRetry: previousRetries + 1,
          reason: `Agent crashed — resuming from last checkpoint.`,
        };

      case 'agent_stall':
        return {
          type: 'retry',
          maxRetries,
          currentRetry: previousRetries + 1,
          reason: `Agent stalled — retrying with fresh prompt.`,
        };

      case 'validation_failed':
        return {
          type: 'retry',
          maxRetries,
          currentRetry: previousRetries + 1,
          reason: `Quality check failed — retrying with corrections.`,
        };

      case 'budget_exceeded':
        return {
          type: 'abort',
          maxRetries: 0,
          currentRetry: 0,
          reason: `Resource budget exceeded. Cannot continue.`,
        };

      default:
        return {
          type: previousRetries < 1 ? 'retry' : 'abort',
          maxRetries: 1,
          currentRetry: previousRetries + 1,
          reason: `Unknown failure — ${previousRetries < 1 ? 'retrying once' : 'aborting'}.`,
        };
    }
  }

  private getMaxRetries(failureType: FailureType): number {
    switch (failureType) {
      case 'provider_error':
      case 'provider_timeout':
        return 3; // Transient — retry aggressively
      case 'tool_error':
      case 'tool_timeout':
        return 2;
      case 'agent_crash':
        return 2;
      case 'agent_stall':
        return 2;
      case 'validation_failed':
        return 3; // Corrections can improve
      case 'budget_exceeded':
        return 0; // No retry
      default:
        return 1;
    }
  }
}
