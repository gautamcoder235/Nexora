import { ToolResult, ToolProposal, TimelineEventType } from '../protocol';
import { ToolRegistry, ExecutionContext } from './ToolRegistry';
import { PermissionEngine } from './PermissionEngine';
import { MetricsCollector } from '../metrics/MetricsCollector';
import { EventBus } from '../../events';
import { CancellationToken } from '../kernel/AIKernel';

export interface ToolRuntimeConfig {
  concurrency?: number;
  maxRetries?: number;
}

export interface ExecutionAuditLog {
  executionId: string;
  toolId: string;
  proposalId: string;
  timestamp: number;
  durationMs: number;
  status: 'success' | 'error' | 'cancelled' | 'denied';
}

export class ToolRuntime {
  private registry: ToolRegistry;
  private permissionEngine: PermissionEngine;
  private metrics: MetricsCollector;
  private concurrency: number;
  private maxRetries: number;
  
  private activeExecutions = 0;
  private queue: Array<() => Promise<void>> = [];
  private cache: Map<string, ToolResult> = new Map();
  private auditLog: ExecutionAuditLog[] = [];

  constructor(
    registry: ToolRegistry, 
    permissionEngine: PermissionEngine,
    metrics: MetricsCollector,
    config?: ToolRuntimeConfig
  ) {
    this.registry = registry;
    this.permissionEngine = permissionEngine;
    this.metrics = metrics;
    this.concurrency = config?.concurrency || 4;
    this.maxRetries = config?.maxRetries ?? 1;
  }

  private generateExecutionId(): string {
    return Math.random().toString(36).substring(2, 9);
  }

  private async processQueue(): Promise<void> {
    if (this.activeExecutions >= this.concurrency || this.queue.length === 0) {
      return;
    }
    this.activeExecutions++;
    const task = this.queue.shift();
    if (task) {
      try {
        await task();
      } finally {
        this.activeExecutions--;
        this.processQueue();
      }
    } else {
      this.activeExecutions--;
    }
  }

  public async executeTool(
    proposal: ToolProposal,
    context: ExecutionContext
  ): Promise<ToolResult> {
    return new Promise((resolve) => {
      this.queue.push(async () => {
        const result = await this.doExecute(proposal, context);
        resolve(result);
      });
      this.processQueue();
    });
  }

  private async doExecute(proposal: ToolProposal, context: ExecutionContext): Promise<ToolResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();
    const tool = this.registry.get(proposal.toolId);

    if (!tool) {
      return this.createErrorResult(proposal, `Tool ${proposal.toolId} not found.`, startTime);
    }

    const permission = this.permissionEngine.checkPermission(tool.definition);
    if (permission === 'denied') {
      const result: ToolResult = {
        proposalId: proposal.id,
        toolId: proposal.toolId,
        status: 'denied',
        output: 'Permission denied by policy.',
        durationMs: Date.now() - startTime
      };
      this.logExecution(executionId, result);
      return result;
    }

    if (permission === 'needs_approval') {
      // For this implementation, we assume needs_approval is handled upstream or rejected
      const result: ToolResult = {
        proposalId: proposal.id,
        toolId: proposal.toolId,
        status: 'denied',
        output: 'Tool execution requires user approval.',
        durationMs: Date.now() - startTime
      };
      this.logExecution(executionId, result);
      return result;
    }

    // Check cache
    const cacheKey = `${proposal.toolId}:${JSON.stringify(proposal.arguments)}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return { ...cached, proposalId: proposal.id, durationMs: Date.now() - startTime };
    }

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        if (context.cancellationToken?.isCancelled) {
          return this.createErrorResult(proposal, 'Cancelled', startTime, 'cancelled');
        }

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Tool execution timed out')), tool.definition.timeoutMs);
        });

        const executePromise = tool.executor(proposal.arguments, context);
        
        const result = await Promise.race([executePromise, timeoutPromise]) as ToolResult;
        
        result.durationMs = Date.now() - startTime;
        
        this.cache.set(cacheKey, result);
        this.logExecution(executionId, result);
        
        EventBus.publish('timeline:event', {
          id: executionId,
          timestamp: Date.now(),
          type: 'tool_executed' as TimelineEventType,
          label: `Executed tool ${proposal.toolId}`,
          toolCallId: proposal.id,
          conversationId: context.conversationId
        });
        
        this.metrics.recordToolExecution(
          proposal.toolId,
          result.durationMs,
          result.status === 'success',
          result.status === 'denied'
        );

        return result;
      } catch (error: any) {
        attempt++;
        if (attempt > this.maxRetries) {
          const result = this.createErrorResult(proposal, error.message || String(error), startTime);
          this.logExecution(executionId, result);
          return result;
        }
      }
    }
    
    return this.createErrorResult(proposal, 'Failed after retries', startTime);
  }

  private createErrorResult(proposal: ToolProposal, errorMsg: string, startTime: number, status: 'error'|'cancelled' = 'error'): ToolResult {
    return {
      proposalId: proposal.id,
      toolId: proposal.toolId,
      status,
      output: '',
      error: errorMsg,
      durationMs: Date.now() - startTime
    };
  }

  private logExecution(executionId: string, result: ToolResult): void {
    this.auditLog.push({
      executionId,
      toolId: result.toolId,
      proposalId: result.proposalId,
      timestamp: Date.now(),
      durationMs: result.durationMs,
      status: result.status
    });
  }

  public getAuditLog(): ExecutionAuditLog[] {
    return this.auditLog;
  }
}
