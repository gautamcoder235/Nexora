// ─── Nexora AI Runtime Kernel — Internal Protocol ──────────────────────────
// All internal message types that flow through the AI Runtime.
// Every type here is serializable and replayable for conversation replay.

// ─── Enums & Literals ─────────────────────────────────────────────────────

/** Conversation lifecycle states managed by the StateMachine. */
export type ConversationPhase =
  | 'idle'
  | 'preparing'
  | 'building_context'
  | 'planning'
  | 'waiting_approval'
  | 'executing'
  | 'observing'
  | 'reflecting'
  | 'retrying'
  | 'completed'
  | 'cancelled'
  | 'failed';

/** Risk classification for tool operations. */
export type RiskLevel = 'safe' | 'read' | 'write' | 'terminal' | 'network' | 'browser' | 'dangerous';

/** User-configured permission policy per risk level. */
export type PermissionPolicy = 'always_allow' | 'ask' | 'never';

/** Normalized stream chunk types from any provider. */
export type StreamChunkType = 'thinking' | 'content' | 'tool_proposal' | 'error' | 'done' | 'usage';

/** Priority levels for context budget allocation. */
export type ContextPriority = 'critical' | 'high' | 'medium' | 'low';

/** Memory knowledge categories. */
export type MemoryCategory = 'facts' | 'architecture' | 'decisions' | 'patterns' | 'mistakes' | 'preferences' | 'summaries';

/** Goal node status in the goal graph. */
export type GoalStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

/** Execution node status in the execution DAG. */
export type ExecutionNodeStatus = 'queued' | 'running' | 'waiting_dependency' | 'completed' | 'failed' | 'cancelled' | 'retrying';

/** Agent roles in the planner. */
export type AgentRole = 'scout' | 'builder' | 'reviewer' | 'tester' | 'coordinator';

/** Background job state. */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Circuit breaker states for provider runtime. */
export type CircuitState = 'closed' | 'open' | 'half_open';

// ─── Stream Events ────────────────────────────────────────────────────────

/** A single normalized chunk from any LLM provider. */
export interface StreamChunk {
  type: StreamChunkType;
  content: string;
  /** Model-reported token usage (only on 'usage' or 'done' chunks). */
  usage?: TokenUsage;
  /** Raw provider-specific data for debugging. */
  raw?: unknown;
}

/** Token usage report from a provider response. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated cost in USD (if calculable). */
  estimatedCostUsd?: number;
}

// ─── Conversation Messages ────────────────────────────────────────────────

/** A single message in a conversation. */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  /** Thinking/reasoning content (if provider supports it). */
  thinking?: string;
  /** Tool calls proposed by the assistant. */
  toolProposals?: ToolProposal[];
  /** Tool execution results. */
  toolResults?: ToolResult[];
  /** File attachments. */
  attachments?: MessageAttachment[];
  /** Entity mentions parsed from user input. */
  mentions?: EntityMention[];
  /** Whether this message is still streaming. */
  streaming?: boolean;
  /** Provider/model that generated this message. */
  model?: string;
  /** Token usage for this message. */
  usage?: TokenUsage;
}

/** A file or entity attachment on a message. */
export interface MessageAttachment {
  id: string;
  type: 'file' | 'image' | 'folder' | 'url' | 'diff';
  name: string;
  path?: string;
  content?: string;
  mimeType?: string;
  /** Size in bytes. */
  size?: number;
  /** Whether this attachment is an image. */
  isImage?: boolean;
  /** Base64-encoded image data for vision API transmission. */
  base64?: string;
  /** Text content of non-image file attachments. */
  textContent?: string;
}

/** A parsed @-mention entity. */
export interface EntityMention {
  type: 'file' | 'folder' | 'symbol' | 'terminal' | 'browser' | 'agent' | 'task' | 'memory' | 'diff' | 'commit' | 'workspace';
  /** Raw mention text (e.g., "@App.tsx"). */
  raw: string;
  /** Resolved identifier (path, ID, etc.). */
  resolved?: string;
  /** Resolved content for context injection. */
  content?: string;
}

// ─── Tool Protocol ────────────────────────────────────────────────────────

/** A tool call proposed by the LLM. */
export interface ToolProposal {
  id: string;
  toolId: string;
  arguments: Record<string, unknown>;
  /** The raw text from the model (for display). */
  rawText?: string;
}

/** Result of executing a tool. */
export interface ToolResult {
  proposalId: string;
  toolId: string;
  status: 'success' | 'error' | 'cancelled' | 'denied';
  output: string;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Error details (if status is 'error'). */
  error?: string;
}

/** MCP-style tool definition for the registry. */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  inputSchema: Record<string, unknown>;
  riskLevel: RiskLevel;
  /** Maximum execution time before timeout. */
  timeoutMs: number;
  /** Whether the tool can stream results. */
  streamable: boolean;
  /** Whether the tool supports cancellation. */
  supportsCancel: boolean;
  /** Category for grouping in UI. */
  category: string;
}

// ─── Planner Protocol ─────────────────────────────────────────────────────

/** A node in the goal graph (survives retries). */
export interface GoalNode {
  id: string;
  label: string;
  description: string;
  status: GoalStatus;
  /** Parent goal ID (null for root). */
  parentId: string | null;
  /** Child goal IDs. */
  children: string[];
  /** Assigned agent role. */
  role?: AgentRole;
}

/** A node in the execution DAG (ephemeral, recreated on retry). */
export interface ExecutionNode {
  id: string;
  goalId: string;
  label: string;
  status: ExecutionNodeStatus;
  /** IDs of nodes this depends on. */
  dependencies: string[];
  /** Assigned agent/terminal session ID. */
  assignedTo?: string;
  /** Tool calls made during this execution. */
  toolCalls: string[];
  /** Start timestamp. */
  startedAt?: number;
  /** Completion timestamp. */
  completedAt?: number;
  /** Retry count. */
  retryCount: number;
  /** Error message if failed. */
  error?: string;
}

/** A planner decision (serializable for replay). */
export interface PlannerDecision {
  id: string;
  timestamp: number;
  /** The original user intent. */
  intent: string;
  /** Generated goal graph. */
  goals: GoalNode[];
  /** Generated execution plan. */
  executionNodes: ExecutionNode[];
  /** Model that generated this plan. */
  model: string;
  /** Whether user approval is required. */
  requiresApproval: boolean;
}

// ─── Observation & Reflection ─────────────────────────────────────────────

/** An observation from monitoring agent execution. */
export interface Observation {
  id: string;
  timestamp: number;
  /** Which execution node this observes. */
  executionNodeId: string;
  /** What was observed. */
  summary: string;
  /** Detected state: completed, errored, waiting, progressing. */
  detectedState: 'progressing' | 'completed' | 'errored' | 'waiting_input' | 'stalled';
  /** Raw terminal/tool output that triggered this observation. */
  rawOutput?: string;
}

/** A reflection evaluation (quality gate). */
export interface Reflection {
  id: string;
  timestamp: number;
  /** What was evaluated. */
  executionNodeId: string;
  /** Quality checks performed. */
  checks: ReflectionCheck[];
  /** Overall score 0-1. */
  score: number;
  /** Whether to retry. */
  shouldRetry: boolean;
  /** Correction instructions if retrying. */
  correction?: string;
}

/** A single quality check within a reflection. */
export interface ReflectionCheck {
  name: string;
  passed: boolean;
  detail: string;
}

// ─── Timeline Events ──────────────────────────────────────────────────────

/** A unified timeline event that feeds the activity timeline. */
export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: TimelineEventType;
  /** Human-readable label. */
  label: string;
  /** Detailed description. */
  detail?: string;
  /** Associated conversation ID. */
  conversationId?: string;
  /** Associated agent/session ID. */
  agentId?: string;
  /** Associated tool call ID. */
  toolCallId?: string;
  /** Metadata for UI rendering. */
  metadata?: Record<string, unknown>;
}

export type TimelineEventType =
  | 'user_prompt'
  | 'assistant_response'
  | 'tool_executed'
  | 'agent_spawned'
  | 'agent_completed'
  | 'agent_errored'
  | 'file_modified'
  | 'file_created'
  | 'browser_opened'
  | 'browser_action'
  | 'git_commit'
  | 'git_diff'
  | 'test_run'
  | 'lint_run'
  | 'build_run'
  | 'memory_updated'
  | 'plan_created'
  | 'plan_approved'
  | 'checkpoint_created'
  | 'checkpoint_restored'
  | 'reflection_completed'
  | 'background_job_started'
  | 'background_job_completed';

// ─── Metrics ──────────────────────────────────────────────────────────────

/** A timestamped metric data point. */
export interface MetricDataPoint {
  name: string;
  value: number;
  unit: 'ms' | 'tokens' | 'usd' | 'count' | 'bytes' | 'percent';
  timestamp: number;
  tags?: Record<string, string>;
}

// ─── Checkpoints & Recovery ───────────────────────────────────────────────

/** A serializable checkpoint of conversation state for recovery. */
export interface ExecutionCheckpoint {
  id: string;
  conversationId: string;
  timestamp: number;
  phase: ConversationPhase;
  /** Snapshot of the message history. */
  messages: ConversationMessage[];
  /** Active goals. */
  goals: GoalNode[];
  /** Active execution nodes. */
  executionNodes: ExecutionNode[];
  /** Context that was assembled. */
  contextSnapshot?: string;
  /** Reason for creating this checkpoint. */
  reason: string;
}

// ─── Provider Capabilities ────────────────────────────────────────────────

/** Capability descriptor for a model/provider. */
export interface ModelCapability {
  modelId: string;
  providerId: string;
  displayName: string;
  /** Maximum context window in tokens. */
  maxContextTokens: number;
  /** Maximum output tokens. */
  maxOutputTokens: number;
  /** Supports extended thinking/reasoning. */
  supportsThinking: boolean;
  /** Supports vision (image input). */
  supportsVision: boolean;
  /** Supports video input. */
  supportsVideo: boolean;
  /** Supports native tool/function calling. */
  supportsToolCalling: boolean;
  /** Supports structured JSON output. */
  supportsJsonMode: boolean;
  /** Supports streaming. */
  supportsStreaming: boolean;
  /** Cost per million input tokens in USD. */
  inputCostPerMillion?: number;
  /** Cost per million output tokens in USD. */
  outputCostPerMillion?: number;
  /** Speed tier for model selection. */
  speedTier: 'fast' | 'medium' | 'slow';
  /** Quality tier for model selection. */
  qualityTier: 'basic' | 'standard' | 'advanced' | 'frontier';
}

// ─── Resource Budgets ─────────────────────────────────────────────────────

/** Resource budget limits for the runtime. */
export interface ResourceBudget {
  /** Maximum concurrent PTY sessions. */
  maxPtySessions: number;
  /** Maximum tokens per conversation turn. */
  maxTokensPerTurn: number;
  /** Maximum background jobs. */
  maxBackgroundJobs: number;
}

// ─── Background Jobs ──────────────────────────────────────────────────────

/** A background job descriptor. */
export interface BackgroundJob {
  id: string;
  label: string;
  command: string;
  cwd: string;
  status: JobStatus;
  /** Associated conversation ID. */
  conversationId?: string;
  startedAt: number;
  completedAt?: number;
  /** Exit code if completed. */
  exitCode?: number;
  /** Last output snapshot. */
  lastOutput?: string;
  /** Progress percentage 0-100 (if determinable). */
  progress?: number;
}

// ─── Conversation Session ─────────────────────────────────────────────────

/** A conversation session managed by the kernel. */
export interface ConversationSession {
  id: string;
  /** Workspace this conversation belongs to. */
  workspaceId: string;
  /** Display name (auto-generated or user-set). */
  name: string;
  /** Current lifecycle phase. */
  phase: ConversationPhase;
  /** All messages in this conversation. */
  messages: ConversationMessage[];
  /** Active model ID. */
  activeModelId: string;
  /** Active provider ID. */
  activeProviderId: string;
  /** Context window summary (rolling). */
  contextWindow: string;
  /** Created timestamp. */
  createdAt: number;
  /** Last activity timestamp. */
  lastActivityAt: number;
  /** Active execution checkpoint ID. */
  activeCheckpointId?: string;
  /** Accumulated token usage. */
  totalUsage: TokenUsage;
}
