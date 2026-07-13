import { invoke } from "@tauri-apps/api/core";

interface SystemMetrics {
  cpu: number;
  ram_gb: number;
}

type MetricsSubscriber = (metrics: SystemMetrics) => void;

/**
 * SystemMetricsService — Singleton poller for system CPU/RAM metrics.
 *
 * Replaces two parallel polling loops (App.tsx + PerformanceOverlay.tsx)
 * with a single shared source-of-truth. Subscribers receive updates
 * without triggering additional IPC calls.
 *
 * Auto-stops polling when no subscribers remain; auto-starts when first
 * subscriber registers (demand-driven polling).
 */
class SystemMetricsServiceClass {
  private static instance: SystemMetricsServiceClass | null = null;
  private subscribers = new Set<MetricsSubscriber>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastMetrics: SystemMetrics = { cpu: 0, ram_gb: 0 };
  private readonly POLL_INTERVAL_MS = 2000;

  static getInstance(): SystemMetricsServiceClass {
    if (!SystemMetricsServiceClass.instance) {
      SystemMetricsServiceClass.instance = new SystemMetricsServiceClass();
    }
    return SystemMetricsServiceClass.instance;
  }

  /** Subscribe to metric updates. Returns an unsubscribe function. */
  subscribe(fn: MetricsSubscriber): () => void {
    this.subscribers.add(fn);
    // Immediately deliver last known metrics so UI doesn't wait for first poll
    fn(this.lastMetrics);
    if (!this.timer) {
      this.startPolling();
    }
    return () => {
      this.subscribers.delete(fn);
      if (this.subscribers.size === 0) {
        this.stopPolling();
      }
    };
  }

  /** Get the last fetched metrics synchronously (no IPC call). */
  getLatest(): SystemMetrics {
    return this.lastMetrics;
  }

  private startPolling() {
    this.poll(); // Immediate first fetch
    this.timer = setInterval(() => this.poll(), this.POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll() {
    try {
      const metrics = await invoke<SystemMetrics>("get_system_metrics");
      this.lastMetrics = metrics;
      this.subscribers.forEach(fn => fn(metrics));
    } catch (e) {
      // Silently fail — stale metrics are acceptable
    }
  }
}

export const SystemMetricsService = SystemMetricsServiceClass.getInstance();
