// ─── Nexora AI Runtime Kernel — State Machine ─────────────────────────────
// Explicit conversation lifecycle states with guarded transitions.
// Every conversation has exactly one state at any time.

import type { ConversationPhase } from '../protocol';
import { EventBus } from '../../events';

// ─── Transition Definition ────────────────────────────────────────────────

/** A valid state transition with optional guard condition. */
interface StateTransition {
  from: ConversationPhase;
  to: ConversationPhase;
  /** Event name that triggers this transition. */
  trigger: string;
}

/** All valid transitions in the conversation lifecycle. */
const TRANSITIONS: StateTransition[] = [
  // Normal flow
  { from: 'idle',              to: 'preparing',         trigger: 'start' },
  { from: 'preparing',         to: 'building_context',  trigger: 'context_ready' },
  { from: 'building_context',  to: 'planning',          trigger: 'context_built' },
  { from: 'planning',          to: 'waiting_approval',  trigger: 'plan_needs_approval' },
  { from: 'planning',          to: 'executing',         trigger: 'plan_auto_approved' },
  { from: 'waiting_approval',  to: 'executing',         trigger: 'plan_approved' },
  { from: 'waiting_approval',  to: 'planning',          trigger: 'plan_rejected' },
  { from: 'executing',         to: 'observing',         trigger: 'execution_dispatched' },
  { from: 'observing',         to: 'reflecting',        trigger: 'execution_finished' },
  { from: 'reflecting',        to: 'completed',         trigger: 'reflection_passed' },
  { from: 'reflecting',        to: 'retrying',          trigger: 'reflection_failed' },
  { from: 'retrying',          to: 'planning',          trigger: 'replan' },
  { from: 'retrying',          to: 'executing',         trigger: 'retry_execute' },

  // Simple tasks bypass planning
  { from: 'building_context',  to: 'executing',         trigger: 'simple_task' },

  // Direct completion (simple question/answer, no tools)
  { from: 'building_context',  to: 'completed',         trigger: 'direct_answer' },
  { from: 'executing',         to: 'completed',         trigger: 'execution_complete' },

  // Cancellation from any active state
  { from: 'preparing',         to: 'cancelled',         trigger: 'cancel' },
  { from: 'building_context',  to: 'cancelled',         trigger: 'cancel' },
  { from: 'planning',          to: 'cancelled',         trigger: 'cancel' },
  { from: 'waiting_approval',  to: 'cancelled',         trigger: 'cancel' },
  { from: 'executing',         to: 'cancelled',         trigger: 'cancel' },
  { from: 'observing',         to: 'cancelled',         trigger: 'cancel' },
  { from: 'reflecting',        to: 'cancelled',         trigger: 'cancel' },
  { from: 'retrying',          to: 'cancelled',         trigger: 'cancel' },

  // Failure from active states
  { from: 'preparing',         to: 'failed',            trigger: 'error' },
  { from: 'building_context',  to: 'failed',            trigger: 'error' },
  { from: 'planning',          to: 'failed',            trigger: 'error' },
  { from: 'executing',         to: 'failed',            trigger: 'error' },
  { from: 'observing',         to: 'failed',            trigger: 'error' },
  { from: 'reflecting',        to: 'failed',            trigger: 'error' },
  { from: 'retrying',          to: 'failed',            trigger: 'error' },

  // Reset from terminal states
  { from: 'completed',         to: 'idle',              trigger: 'reset' },
  { from: 'cancelled',         to: 'idle',              trigger: 'reset' },
  { from: 'failed',            to: 'idle',              trigger: 'reset' },
];

// ─── Transition Event Payload ─────────────────────────────────────────────

/** Payload emitted on every state transition. */
export interface StateTransitionEvent {
  conversationId: string;
  from: ConversationPhase;
  to: ConversationPhase;
  trigger: string;
  timestamp: number;
  /** Optional error message (on 'error' trigger). */
  error?: string;
}

// ─── State Machine ────────────────────────────────────────────────────────

/**
 * Manages the lifecycle state of a single conversation.
 * Enforces valid transitions and emits events on the global EventBus.
 */
export class ConversationStateMachine {
  private _phase: ConversationPhase = 'idle';
  private _history: StateTransitionEvent[] = [];
  private readonly _conversationId: string;

  constructor(conversationId: string, initialPhase: ConversationPhase = 'idle') {
    this._conversationId = conversationId;
    this._phase = initialPhase;
  }

  /** Current conversation phase. */
  get phase(): ConversationPhase {
    return this._phase;
  }

  /** Full transition history for this conversation (for replay/debugging). */
  get history(): ReadonlyArray<StateTransitionEvent> {
    return this._history;
  }

  /** Conversation ID this machine manages. */
  get conversationId(): string {
    return this._conversationId;
  }

  /**
   * Attempt a state transition.
   * @returns true if the transition was valid and executed, false otherwise.
   */
  transition(trigger: string, error?: string): boolean {
    const valid = TRANSITIONS.find(
      t => t.from === this._phase && t.trigger === trigger
    );

    if (!valid) {
      console.warn(
        `[StateMachine] Invalid transition: ${this._phase} --${trigger}--> ? ` +
        `(conversation: ${this._conversationId})`
      );
      return false;
    }

    const event: StateTransitionEvent = {
      conversationId: this._conversationId,
      from: this._phase,
      to: valid.to,
      trigger,
      timestamp: Date.now(),
      error,
    };

    this._phase = valid.to;
    this._history.push(event);

    // Publish on the global EventBus so any subscriber can react
    EventBus.publish('ai:state_transition', event);

    return true;
  }

  /**
   * Check whether a given trigger is valid from the current state.
   */
  canTransition(trigger: string): boolean {
    return TRANSITIONS.some(t => t.from === this._phase && t.trigger === trigger);
  }

  /**
   * Get all valid triggers from the current state.
   */
  validTriggers(): string[] {
    return TRANSITIONS
      .filter(t => t.from === this._phase)
      .map(t => t.trigger);
  }

  /** Whether the conversation is in a terminal state (completed/cancelled/failed). */
  get isTerminal(): boolean {
    return this._phase === 'completed' || this._phase === 'cancelled' || this._phase === 'failed';
  }

  /** Whether the conversation is actively processing (not idle or terminal). */
  get isActive(): boolean {
    return this._phase !== 'idle' && !this.isTerminal;
  }

  /**
   * Serialize for checkpointing/replay.
   */
  serialize(): { phase: ConversationPhase; history: StateTransitionEvent[] } {
    return {
      phase: this._phase,
      history: [...this._history],
    };
  }

  /**
   * Restore from a checkpoint.
   */
  static restore(
    conversationId: string,
    data: { phase: ConversationPhase; history: StateTransitionEvent[] }
  ): ConversationStateMachine {
    const sm = new ConversationStateMachine(conversationId, data.phase);
    sm._history = [...data.history];
    return sm;
  }
}
