// ─── Nexora AI Runtime — Barrel Export ──────────────────────────────────────
// Central re-export for the AI Runtime Kernel module.

// ── Protocol Types ─────────────────────────────────────────────────────────
export type {
  ConversationPhase,
  RiskLevel,
  PermissionPolicy,
  StreamChunkType,
  ContextPriority,
  MemoryCategory,
  GoalStatus,
  ExecutionNodeStatus,
  AgentRole,
  JobStatus,
  CircuitState,
  StreamChunk,
  TokenUsage,
  ConversationMessage,
  MessageAttachment,
  EntityMention,
  ToolProposal,
  ToolResult,
  ToolDefinition,
  GoalNode,
  ExecutionNode,
  PlannerDecision,
  Observation,
  Reflection,
  ReflectionCheck,
  TimelineEvent,
  TimelineEventType,
  MetricDataPoint,
  ExecutionCheckpoint,
  ModelCapability,
  ResourceBudget,
  BackgroundJob,
  ConversationSession,
} from './protocol';

// ── Kernel ─────────────────────────────────────────────────────────────────
export { AIKernel, CancellationToken, CancellationError, KernelEvents } from './kernel/AIKernel';
export type { KernelConfig } from './kernel/AIKernel';
export { ConversationStateMachine } from './kernel/StateMachine';
export type { StateTransitionEvent } from './kernel/StateMachine';
export { AIPluginManager } from './kernel/PluginManager';
export type { AIPlugin, AIPluginCategory, AIPluginLifecycle } from './kernel/PluginManager';

// ── Metrics ────────────────────────────────────────────────────────────────
export { MetricsCollector } from './metrics/MetricsCollector';
export type { MetricsSnapshot, ProviderMetrics, ToolMetrics, MetricCategory } from './metrics/MetricsCollector';

// ── Runtime ────────────────────────────────────────────────────────────────
export { AgentRuntime } from './runtime/AgentRuntime';
export type { ManagedAgent, ManagedAgentStatus, HeartbeatConfig } from './runtime/AgentRuntime';
export { BackgroundJobManager } from './runtime/BackgroundJobManager';
export type { JobRequest } from './runtime/BackgroundJobManager';
export { RecoveryEngine } from './runtime/RecoveryEngine';
export type { RecoveryStrategy, FailureType, FailureRecord } from './runtime/RecoveryEngine';
