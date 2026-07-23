// ─── Nexora AI Runtime Kernel — Metrics Collector ──────────────────────────
// Tracks latency, token usage, cost, retries, failures across the AI runtime.
// All metrics are queryable and exportable for performance optimization.

import type { MetricDataPoint, TokenUsage } from '../protocol';
import { EventBus } from '../../events';

// ─── Metric Categories ────────────────────────────────────────────────────

export type MetricCategory =
  | 'provider'     // LLM API latency, errors
  | 'context'      // Context building time
  | 'planning'     // Planning/goal decomposition time
  | 'tool'         // Tool execution time
  | 'streaming'    // Chunk processing time
  | 'observation'  // Observation loop time
  | 'reflection'   // Reflection evaluation time
  | 'recovery'     // Recovery/retry time
  | 'kernel';      // Overall kernel cycle time

// ─── Aggregated Metrics ───────────────────────────────────────────────────

/** Aggregated metrics snapshot for a given time window. */
export interface MetricsSnapshot {
  /** Total conversations processed. */
  totalConversations: number;
  /** Total tool calls executed. */
  totalToolCalls: number;
  /** Total tokens consumed (input + output). */
  totalTokens: number;
  /** Total estimated cost in USD. */
  totalCostUsd: number;
  /** Total provider errors. */
  totalErrors: number;
  /** Total retries. */
  totalRetries: number;
  /** Average latency per category (ms). */
  averageLatency: Record<MetricCategory, number>;
  /** P95 latency per category (ms). */
  p95Latency: Record<MetricCategory, number>;
  /** Per-provider breakdown. */
  providerMetrics: Record<string, ProviderMetrics>;
  /** Per-tool breakdown. */
  toolMetrics: Record<string, ToolMetrics>;
}

/** Per-provider metrics. */
export interface ProviderMetrics {
  providerId: string;
  totalCalls: number;
  totalErrors: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  circuitBreakerTrips: number;
}

/** Per-tool metrics. */
export interface ToolMetrics {
  toolId: string;
  totalCalls: number;
  totalErrors: number;
  averageLatencyMs: number;
  totalDenied: number;
}

// ─── Collector ────────────────────────────────────────────────────────────

/**
 * Central metrics collector for the AI Runtime Kernel.
 * Records data points in memory and publishes aggregated snapshots on demand.
 * Singleton — use `MetricsCollector.getInstance()`.
 */
export class MetricsCollector {
  private static instance: MetricsCollector | null = null;

  private dataPoints: MetricDataPoint[] = [];
  private tokenUsageLog: Array<TokenUsage & { providerId: string; timestamp: number }> = [];
  private toolExecutionLog: Array<{ toolId: string; durationMs: number; success: boolean; denied: boolean; timestamp: number }> = [];
  private providerCallLog: Array<{ providerId: string; durationMs: number; success: boolean; timestamp: number }> = [];
  private retryCount = 0;
  private errorCount = 0;
  private conversationCount = 0;

  /** Maximum data points to retain in memory (rolling window). */
  private readonly MAX_DATA_POINTS = 10_000;

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  // ─── Recording Methods ────────────────────────────────────────────────

  /** Record a latency measurement for a given category. */
  recordLatency(category: MetricCategory, durationMs: number, tags?: Record<string, string>): void {
    this.pushDataPoint({
      name: `latency.${category}`,
      value: durationMs,
      unit: 'ms',
      timestamp: Date.now(),
      tags,
    });
  }

  /** Record token usage from a provider call. */
  recordTokenUsage(providerId: string, usage: TokenUsage): void {
    this.tokenUsageLog.push({
      ...usage,
      providerId,
      timestamp: Date.now(),
    });

    this.pushDataPoint({
      name: 'tokens.total',
      value: usage.totalTokens,
      unit: 'tokens',
      timestamp: Date.now(),
      tags: { providerId },
    });

    if (usage.estimatedCostUsd !== undefined) {
      this.pushDataPoint({
        name: 'cost.usd',
        value: usage.estimatedCostUsd,
        unit: 'usd',
        timestamp: Date.now(),
        tags: { providerId },
      });
    }

    EventBus.publish('ai:metrics:token_usage', { providerId, usage });
  }

  /** Record a tool execution. */
  recordToolExecution(toolId: string, durationMs: number, success: boolean, denied: boolean = false): void {
    this.toolExecutionLog.push({ toolId, durationMs, success, denied, timestamp: Date.now() });

    this.pushDataPoint({
      name: `tool.${toolId}.duration`,
      value: durationMs,
      unit: 'ms',
      timestamp: Date.now(),
    });

    if (!success) {
      this.errorCount++;
    }
  }

  /** Record a provider API call. */
  recordProviderCall(providerId: string, durationMs: number, success: boolean): void {
    this.providerCallLog.push({ providerId, durationMs, success, timestamp: Date.now() });

    if (!success) {
      this.errorCount++;
    }
  }

  /** Record a retry event. */
  recordRetry(): void {
    this.retryCount++;
  }

  /** Record a new conversation started. */
  recordConversationStart(): void {
    this.conversationCount++;
  }

  // ─── Query Methods ────────────────────────────────────────────────────

  /** Get an aggregated metrics snapshot. */
  getSnapshot(): MetricsSnapshot {
    const categories: MetricCategory[] = [
      'provider', 'context', 'planning', 'tool', 'streaming',
      'observation', 'reflection', 'recovery', 'kernel',
    ];

    const averageLatency: Record<string, number> = {};
    const p95Latency: Record<string, number> = {};

    for (const cat of categories) {
      const points = this.dataPoints
        .filter(dp => dp.name === `latency.${cat}`)
        .map(dp => dp.value);

      averageLatency[cat] = points.length > 0
        ? points.reduce((a, b) => a + b, 0) / points.length
        : 0;
      p95Latency[cat] = this.percentile(points, 0.95);
    }

    // Provider metrics
    const providerMetrics: Record<string, ProviderMetrics> = {};
    for (const call of this.providerCallLog) {
      if (!providerMetrics[call.providerId]) {
        providerMetrics[call.providerId] = {
          providerId: call.providerId,
          totalCalls: 0, totalErrors: 0, totalTokens: 0,
          totalCostUsd: 0, averageLatencyMs: 0, circuitBreakerTrips: 0,
        };
      }
      const pm = providerMetrics[call.providerId];
      pm.totalCalls++;
      if (!call.success) pm.totalErrors++;
      pm.averageLatencyMs = ((pm.averageLatencyMs * (pm.totalCalls - 1)) + call.durationMs) / pm.totalCalls;
    }
    for (const usage of this.tokenUsageLog) {
      if (providerMetrics[usage.providerId]) {
        providerMetrics[usage.providerId].totalTokens += usage.totalTokens;
        providerMetrics[usage.providerId].totalCostUsd += usage.estimatedCostUsd || 0;
      }
    }

    // Tool metrics
    const toolMetrics: Record<string, ToolMetrics> = {};
    for (const exec of this.toolExecutionLog) {
      if (!toolMetrics[exec.toolId]) {
        toolMetrics[exec.toolId] = {
          toolId: exec.toolId, totalCalls: 0, totalErrors: 0,
          averageLatencyMs: 0, totalDenied: 0,
        };
      }
      const tm = toolMetrics[exec.toolId];
      tm.totalCalls++;
      if (!exec.success) tm.totalErrors++;
      if (exec.denied) tm.totalDenied++;
      tm.averageLatencyMs = ((tm.averageLatencyMs * (tm.totalCalls - 1)) + exec.durationMs) / tm.totalCalls;
    }

    return {
      totalConversations: this.conversationCount,
      totalToolCalls: this.toolExecutionLog.length,
      totalTokens: this.tokenUsageLog.reduce((sum, u) => sum + u.totalTokens, 0),
      totalCostUsd: this.tokenUsageLog.reduce((sum, u) => sum + (u.estimatedCostUsd || 0), 0),
      totalErrors: this.errorCount,
      totalRetries: this.retryCount,
      averageLatency: averageLatency as Record<MetricCategory, number>,
      p95Latency: p95Latency as Record<MetricCategory, number>,
      providerMetrics,
      toolMetrics,
    };
  }

  /** Get raw data points (for export/charting). */
  getDataPoints(filter?: { name?: string; since?: number }): MetricDataPoint[] {
    let result = this.dataPoints;
    if (filter?.name) {
      result = result.filter(dp => dp.name.startsWith(filter.name!));
    }
    if (filter?.since) {
      result = result.filter(dp => dp.timestamp >= filter.since!);
    }
    return result;
  }

  /** Clear all recorded metrics. */
  reset(): void {
    this.dataPoints = [];
    this.tokenUsageLog = [];
    this.toolExecutionLog = [];
    this.providerCallLog = [];
    this.retryCount = 0;
    this.errorCount = 0;
    this.conversationCount = 0;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private pushDataPoint(dp: MetricDataPoint): void {
    this.dataPoints.push(dp);
    // Rolling window
    if (this.dataPoints.length > this.MAX_DATA_POINTS) {
      this.dataPoints = this.dataPoints.slice(-Math.floor(this.MAX_DATA_POINTS * 0.8));
    }
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
