import { BaseAdapter, StreamOptions } from './BaseAdapter';
import { ConversationMessage, StreamChunk, CircuitState } from '../protocol';
import { MetricsCollector } from '../metrics/MetricsCollector';
import { CancellationToken } from '../kernel/AIKernel';
import { EventBus } from '../../events';

export interface ProviderRuntimeOptions {
  maxRetries?: number;
  requestsPerMinute?: number;
  failureThreshold?: number;
  cooldownMs?: number;
}

export class ProviderRuntime {
  private primaryAdapter: BaseAdapter;
  private fallbackAdapter?: BaseAdapter;
  private metrics: MetricsCollector;
  
  private circuitState: CircuitState = 'closed';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  
  private readonly maxRetries: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(
    primaryAdapter: BaseAdapter,
    metrics: MetricsCollector,
    fallbackAdapter?: BaseAdapter,
    options?: ProviderRuntimeOptions
  ) {
    this.primaryAdapter = primaryAdapter;
    this.fallbackAdapter = fallbackAdapter;
    this.metrics = metrics;
    this.maxRetries = options?.maxRetries ?? 3;
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.cooldownMs = options?.cooldownMs ?? 30000;
  }

  private checkCircuit(): void {
    if (this.circuitState === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.cooldownMs) {
        this.circuitState = 'half_open';
        EventBus.publish('ai:circuit_breaker_changed', { providerId: this.primaryAdapter.providerId, state: 'half_open' });
      } else {
        throw new Error(`Circuit breaker open for provider ${this.primaryAdapter.providerId}`);
      }
    }
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    if (this.circuitState !== 'closed') {
      this.circuitState = 'closed';
      EventBus.publish('ai:circuit_breaker_changed', { providerId: this.primaryAdapter.providerId, state: 'closed' });
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold && this.circuitState !== 'open') {
      this.circuitState = 'open';
      EventBus.publish('ai:circuit_breaker_changed', { providerId: this.primaryAdapter.providerId, state: 'open' });
    }
  }

  private async sleep(ms: number, token?: CancellationToken): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      if (token) {
        token.onCancelled(() => {
          clearTimeout(timeoutId);
          reject(new Error('Cancelled'));
        });
      }
    });
  }

  public async *stream(
    messages: ConversationMessage[],
    options: StreamOptions,
    token?: CancellationToken
  ): AsyncGenerator<StreamChunk> {
    let adapter = this.primaryAdapter;
    let retries = 0;
    let success = false;

    while (!success && retries <= this.maxRetries) {
      try {
        if (token?.isCancelled) {
          throw new Error('Cancelled');
        }

        if (adapter === this.primaryAdapter) {
          this.checkCircuit();
        }

        const startTime = Date.now();
        const stream = adapter.stream(messages, options);
        
        for await (const chunk of stream) {
          if (token?.isCancelled) {
            throw new Error('Cancelled');
          }
          yield chunk;
        }

        this.metrics.recordProviderCall(adapter.providerId, Date.now() - startTime, true);
        if (adapter === this.primaryAdapter) {
          this.recordSuccess();
        }
        success = true;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage === 'Cancelled') {
          throw error;
        }

        this.metrics.recordProviderCall(adapter.providerId, 0, false);
        
        if (adapter === this.primaryAdapter) {
          this.recordFailure();
        }

        if (retries < this.maxRetries) {
          retries++;
          const jitter = Math.random() * 1000;
          const delay = Math.pow(2, retries) * 1000 + jitter;
          await this.sleep(delay, token);
        } else if (adapter === this.primaryAdapter && this.fallbackAdapter) {
          adapter = this.fallbackAdapter;
          retries = 0;
        } else {
          throw error;
        }
      }
    }
  }
}
