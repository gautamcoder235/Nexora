// ─── Nexora AI Runtime Kernel ──────────────────────────────────────────────
// The operating system of AI. Everything AI flows through the kernel.
// Owns: runtime lifecycle, cancellation, checkpoints, recovery,
// provider switching, orchestration policies, and plugin coordination.

import type {
  ConversationSession,
  ConversationMessage,
  ConversationPhase,
  ExecutionCheckpoint,
  ToolProposal,
  ToolResult,
  PlannerDecision,
  StreamChunk,
  TokenUsage,
  ResourceBudget,
  TimelineEvent,
} from '../protocol';
import { ConversationStateMachine } from './StateMachine';
import { AIPluginManager } from './PluginManager';
import { MetricsCollector } from '../metrics/MetricsCollector';
import { EventBus } from '../../events';

// ─── Cancellation Token ───────────────────────────────────────────────────

/** Cooperative cancellation token for async operations. */
export class CancellationToken {
  private _cancelled = false;
  private _listeners: Array<() => void> = [];

  get isCancelled(): boolean {
    return this._cancelled;
  }

  cancel(): void {
    if (this._cancelled) return;
    this._cancelled = true;
    for (const listener of this._listeners) {
      try { listener(); } catch (e) { console.error('[CancellationToken] Listener error:', e); }
    }
    this._listeners = [];
  }

  onCancelled(listener: () => void): void {
    if (this._cancelled) {
      listener();
    } else {
      this._listeners.push(listener);
    }
  }

  /** Throw if cancelled — use at async yield points. */
  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new CancellationError('Operation cancelled');
    }
  }
}

export class CancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancellationError';
  }
}

// ─── Kernel Configuration ─────────────────────────────────────────────────

/** Configuration for the AI Runtime Kernel. */
export interface KernelConfig {
  /** Default model ID for new conversations. */
  defaultModelId: string;
  /** Default provider ID for new conversations. */
  defaultProviderId: string;
  /** Resource budget limits. */
  resourceBudget: ResourceBudget;
  /** Whether to auto-approve simple tool calls (risk level 'safe' or 'read'). */
  autoApproveSafeTools: boolean;
  /** Maximum checkpoints to retain per conversation. */
  maxCheckpoints: number;
  /** Whether the observation loop is enabled. */
  observationLoopEnabled: boolean;
  /** Whether reflection quality gates are enabled. */
  reflectionEnabled: boolean;
  /** Docking position for the AI Chat Panel on screen. */
  chatPanelPosition?: 'left' | 'right';
}

const DEFAULT_KERNEL_CONFIG: KernelConfig = {
  defaultModelId: 'gpt-4o',
  defaultProviderId: 'openai',
  resourceBudget: {
    maxPtySessions: 8,
    maxTokensPerTurn: 128_000,
    maxBackgroundJobs: 6,
  },
  autoApproveSafeTools: true,
  maxCheckpoints: 10,
  observationLoopEnabled: true,
  reflectionEnabled: true,
  chatPanelPosition: 'right',
};

// ─── Kernel Events ────────────────────────────────────────────────────────

/** Events the kernel publishes on the EventBus. */
export const KernelEvents = {
  CONVERSATION_CREATED: 'ai:kernel:conversation_created',
  CONVERSATION_DESTROYED: 'ai:kernel:conversation_destroyed',
  CONVERSATION_UPDATED: 'ai:kernel:conversation_updated',
  MESSAGE_ADDED: 'ai:kernel:message_added',
  STREAM_CHUNK: 'ai:kernel:stream_chunk',
  TOOL_PROPOSED: 'ai:kernel:tool_proposed',
  TOOL_EXECUTED: 'ai:kernel:tool_executed',
  PLAN_CREATED: 'ai:kernel:plan_created',
  CHECKPOINT_CREATED: 'ai:kernel:checkpoint_created',
  CHECKPOINT_RESTORED: 'ai:kernel:checkpoint_restored',
  ERROR: 'ai:kernel:error',
} as const;

// ─── Active Conversation Context ──────────────────────────────────────────

/** Internal runtime context for an active conversation. */
interface ActiveConversation {
  session: ConversationSession;
  stateMachine: ConversationStateMachine;
  cancellationToken: CancellationToken;
  checkpoints: ExecutionCheckpoint[];
  activePlan?: PlannerDecision;
  /** Pending tool proposals awaiting user approval. */
  pendingToolApprovals: ToolProposal[];
}

// ─── AI Runtime Kernel ────────────────────────────────────────────────────

/**
 * The AI Runtime Kernel — central singleton that orchestrates all AI operations.
 *
 * Responsibilities:
 * - Conversation lifecycle management
 * - Cancellation token distribution
 * - Execution checkpointing and recovery
 * - Provider/model switching
 * - Orchestration policy enforcement
 * - Plugin coordination
 * - Metrics collection delegation
 *
 * The kernel does NOT contain UI logic, LLM communication, or tool execution.
 * Those are delegated to registered subsystems (providers, tool runtime, planner)
 * that the kernel coordinates.
 */
export class AIKernel {
  private static instance: AIKernel | null = null;

  private conversations: Map<string, ActiveConversation> = new Map();
  private config: KernelConfig;
  private readonly metrics: MetricsCollector;
  private readonly plugins: AIPluginManager;

  private constructor(config: Partial<KernelConfig> = {}) {
    this.config = { ...DEFAULT_KERNEL_CONFIG, ...config };
    this.metrics = MetricsCollector.getInstance();
    this.plugins = AIPluginManager.getInstance();
  }

  static getInstance(config?: Partial<KernelConfig>): AIKernel {
    if (!AIKernel.instance) {
      AIKernel.instance = new AIKernel(config);
    }
    return AIKernel.instance;
  }

  /** Update kernel configuration at runtime. */
  updateConfig(updates: Partial<KernelConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /** Get current kernel configuration. */
  getConfig(): Readonly<KernelConfig> {
    return this.config;
  }

  // ─── Conversation Lifecycle ───────────────────────────────────────────

  /**
   * Create a new conversation session.
   * @returns The created conversation session.
   */
  createConversation(workspaceId: string, name?: string): ConversationSession {
    const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const session: ConversationSession = {
      id,
      workspaceId,
      name: name || `Chat ${new Date(now).toLocaleTimeString()}`,
      phase: 'idle',
      messages: [],
      activeModelId: this.config.defaultModelId,
      activeProviderId: this.config.defaultProviderId,
      contextWindow: '',
      createdAt: now,
      lastActivityAt: now,
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };

    const active: ActiveConversation = {
      session,
      stateMachine: new ConversationStateMachine(id),
      cancellationToken: new CancellationToken(),
      checkpoints: [],
      pendingToolApprovals: [],
    };

    this.conversations.set(id, active);
    this.metrics.recordConversationStart();
    this.plugins.notifyConversationStart(id);

    EventBus.publish(KernelEvents.CONVERSATION_CREATED, { session });

    return session;
  }

  /**
   * Destroy a conversation and clean up resources.
   */
  destroyConversation(conversationId: string): void {
    const active = this.conversations.get(conversationId);
    if (!active) return;

    // Cancel any running operations
    active.cancellationToken.cancel();

    this.plugins.notifyConversationEnd(conversationId);
    this.conversations.delete(conversationId);

    EventBus.publish(KernelEvents.CONVERSATION_DESTROYED, { conversationId });
  }

  /**
   * Rename a conversation session.
   */
  renameConversation(conversationId: string, newName: string): void {
    const active = this.conversations.get(conversationId);
    if (!active) return;

    active.session.name = newName;
    EventBus.publish(KernelEvents.CONVERSATION_UPDATED, { session: active.session });
  }

  /**
   * Get a conversation session by ID.
   */
  getConversation(conversationId: string): ConversationSession | undefined {
    return this.conversations.get(conversationId)?.session;
  }

  /**
   * Get all active conversation sessions.
   */
  getAllConversations(): ConversationSession[] {
    return Array.from(this.conversations.values()).map(ac => ac.session);
  }

  // ─── Message Management ───────────────────────────────────────────────

  /**
   * Add a message to a conversation.
   */
  addMessage(conversationId: string, message: ConversationMessage): void {
    const active = this.conversations.get(conversationId);
    if (!active) {
      console.warn(`[AIKernel] Conversation ${conversationId} not found`);
      return;
    }

    active.session.messages.push(message);
    active.session.lastActivityAt = Date.now();

    // Accumulate token usage
    if (message.usage) {
      active.session.totalUsage.promptTokens += message.usage.promptTokens;
      active.session.totalUsage.completionTokens += message.usage.completionTokens;
      active.session.totalUsage.totalTokens += message.usage.totalTokens;
    }

    EventBus.publish(KernelEvents.MESSAGE_ADDED, {
      conversationId,
      message,
    });
  }

  /**
   * Update a streaming message in place.
   */
  updateStreamingMessage(conversationId: string, messageId: string, chunk: StreamChunk): void {
    const active = this.conversations.get(conversationId);
    if (!active) return;

    const message = active.session.messages.find(m => m.id === messageId);
    if (!message) return;

    if (chunk.type === 'content') {
      message.content += chunk.content;
    } else if (chunk.type === 'thinking') {
      message.thinking = (message.thinking || '') + chunk.content;
    } else if (chunk.type === 'done') {
      message.streaming = false;
      if (chunk.usage) {
        message.usage = chunk.usage;
      }
    }

    EventBus.publish(KernelEvents.STREAM_CHUNK, {
      conversationId,
      messageId,
      chunk,
    });
  }

  // ─── State Machine Access ─────────────────────────────────────────────

  /**
   * Transition the conversation state machine.
   */
  transition(conversationId: string, trigger: string, error?: string): boolean {
    const active = this.conversations.get(conversationId);
    if (!active) return false;

    const result = active.stateMachine.transition(trigger, error);
    if (result) {
      active.session.phase = active.stateMachine.phase;
    }
    return result;
  }

  /**
   * Get the current phase of a conversation.
   */
  getPhase(conversationId: string): ConversationPhase | undefined {
    return this.conversations.get(conversationId)?.stateMachine.phase;
  }

  /**
   * Get valid triggers for the current state of a conversation.
   */
  getValidTriggers(conversationId: string): string[] {
    return this.conversations.get(conversationId)?.stateMachine.validTriggers() || [];
  }

  // ─── Cancellation ─────────────────────────────────────────────────────

  /**
   * Get the cancellation token for a conversation.
   * Subsystems should check this token at async yield points.
   */
  getCancellationToken(conversationId: string): CancellationToken | undefined {
    return this.conversations.get(conversationId)?.cancellationToken;
  }

  /**
   * Cancel all running operations for a conversation.
   */
  cancelConversation(conversationId: string): void {
    const active = this.conversations.get(conversationId);
    if (!active) return;

    active.cancellationToken.cancel();
    active.stateMachine.transition('cancel');
    active.session.phase = active.stateMachine.phase;

    // Issue a fresh token for potential recovery
    active.cancellationToken = new CancellationToken();
  }

  // ─── Checkpointing & Recovery ─────────────────────────────────────────

  /**
   * Create a checkpoint of the current conversation state.
   */
  createCheckpoint(conversationId: string, reason: string): ExecutionCheckpoint | undefined {
    const active = this.conversations.get(conversationId);
    if (!active) return undefined;

    const checkpoint: ExecutionCheckpoint = {
      id: `ckpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conversationId,
      timestamp: Date.now(),
      phase: active.stateMachine.phase,
      messages: [...active.session.messages],
      goals: active.activePlan?.goals || [],
      executionNodes: active.activePlan?.executionNodes || [],
      contextSnapshot: active.session.contextWindow,
      reason,
    };

    active.checkpoints.push(checkpoint);
    active.session.activeCheckpointId = checkpoint.id;

    // Enforce max checkpoints
    while (active.checkpoints.length > this.config.maxCheckpoints) {
      active.checkpoints.shift();
    }

    EventBus.publish(KernelEvents.CHECKPOINT_CREATED, { checkpoint });

    return checkpoint;
  }

  /**
   * Restore a conversation from a checkpoint.
   */
  restoreCheckpoint(conversationId: string, checkpointId: string): boolean {
    const active = this.conversations.get(conversationId);
    if (!active) return false;

    const checkpoint = active.checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) return false;

    // Cancel current operations
    active.cancellationToken.cancel();
    active.cancellationToken = new CancellationToken();

    // Restore state
    active.session.messages = [...checkpoint.messages];
    active.session.phase = checkpoint.phase;
    active.session.contextWindow = checkpoint.contextSnapshot || '';
    active.stateMachine = ConversationStateMachine.restore(conversationId, {
      phase: checkpoint.phase,
      history: [],
    });

    EventBus.publish(KernelEvents.CHECKPOINT_RESTORED, { checkpoint });

    return true;
  }

  /**
   * Get all checkpoints for a conversation.
   */
  getCheckpoints(conversationId: string): ExecutionCheckpoint[] {
    return this.conversations.get(conversationId)?.checkpoints || [];
  }

  // ─── Model & Provider Switching ───────────────────────────────────────

  /**
   * Switch the active model/provider for a conversation.
   */
  switchModel(conversationId: string, modelId: string, providerId: string): void {
    const active = this.conversations.get(conversationId);
    if (!active) return;

    active.session.activeModelId = modelId;
    active.session.activeProviderId = providerId;
  }

  // ─── Plan Management ──────────────────────────────────────────────────

  /**
   * Set the active plan for a conversation.
   */
  setPlan(conversationId: string, plan: PlannerDecision): void {
    const active = this.conversations.get(conversationId);
    if (!active) return;

    active.activePlan = plan;
    EventBus.publish(KernelEvents.PLAN_CREATED, { conversationId, plan });
  }

  /**
   * Get the active plan for a conversation.
   */
  getPlan(conversationId: string): PlannerDecision | undefined {
    return this.conversations.get(conversationId)?.activePlan;
  }

  // ─── Tool Approval Queue ─────────────────────────────────────────────

  /**
   * Queue tool proposals that require user approval.
   */
  queueToolApproval(conversationId: string, proposals: ToolProposal[]): void {
    const active = this.conversations.get(conversationId);
    if (!active) return;

    active.pendingToolApprovals.push(...proposals);
    EventBus.publish(KernelEvents.TOOL_PROPOSED, { conversationId, proposals });
  }

  /**
   * Get pending tool proposals.
   */
  getPendingApprovals(conversationId: string): ToolProposal[] {
    return this.conversations.get(conversationId)?.pendingToolApprovals || [];
  }

  /**
   * Clear pending approvals (after user approves/rejects).
   */
  clearPendingApprovals(conversationId: string): void {
    const active = this.conversations.get(conversationId);
    if (active) {
      active.pendingToolApprovals = [];
    }
  }

  // ─── Resource Budget ──────────────────────────────────────────────────

  /**
   * Check if a resource budget allows an operation.
   */
  checkBudget(resource: keyof ResourceBudget, currentUsage: number): boolean {
    return currentUsage < this.config.resourceBudget[resource];
  }

  // ─── Metrics & Diagnostics ────────────────────────────────────────────

  /** Get the metrics collector. */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /** Get the plugin manager. */
  getPlugins(): AIPluginManager {
    return this.plugins;
  }

  /** Get count of active conversations. */
  get activeConversationCount(): number {
    return this.conversations.size;
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  /**
   * Destroy all conversations and reset the kernel.
   * WARNING: This cancels all running operations.
   */
  reset(): void {
    for (const [id] of this.conversations) {
      this.destroyConversation(id);
    }
    this.conversations.clear();
  }

  /** Reset the singleton (for testing). */
  static resetInstance(): void {
    if (AIKernel.instance) {
      AIKernel.instance.reset();
      AIKernel.instance = null;
    }
  }
}
