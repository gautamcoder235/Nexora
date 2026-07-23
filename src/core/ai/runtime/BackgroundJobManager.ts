// ─── Nexora AI Runtime — Background Job Manager ───────────────────────────
// Persistent queue for long-running tasks that survive the chat panel
// closing. Examples: git clone, npm install, cargo build, test suites.

import type { BackgroundJob, JobStatus } from '../protocol';
import { EventBus } from '../../events';

// ─── Job Request ──────────────────────────────────────────────────────────

/** Request to create a new background job. */
export interface JobRequest {
  label: string;
  command: string;
  cwd: string;
  conversationId?: string;
  /** Environment variables to set. */
  env?: Record<string, string>;
  /** Maximum runtime in ms before auto-kill (default: 30 minutes). */
  timeoutMs?: number;
  /** Callback when job completes. */
  onComplete?: (job: BackgroundJob) => void;
}

// ─── Background Job Manager ──────────────────────────────────────────────

/**
 * Manages background jobs that persist beyond the chat panel lifecycle.
 * Jobs are tracked in memory and publish events on completion/failure.
 *
 * Actual process spawning is delegated to the Tauri backend via EventBus
 * events that the orchestratorStore handles.
 *
 * Singleton — use `BackgroundJobManager.getInstance()`.
 */
export class BackgroundJobManager {
  private static instance: BackgroundJobManager | null = null;

  private jobs: Map<string, BackgroundJob> = new Map();
  private timeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private callbacks: Map<string, (job: BackgroundJob) => void> = new Map();
  private maxConcurrent: number;

  private constructor(maxConcurrent = 6) {
    this.maxConcurrent = maxConcurrent;
  }

  static getInstance(maxConcurrent?: number): BackgroundJobManager {
    if (!BackgroundJobManager.instance) {
      BackgroundJobManager.instance = new BackgroundJobManager(maxConcurrent);
    }
    return BackgroundJobManager.instance;
  }

  // ─── Job Lifecycle ────────────────────────────────────────────────────

  /**
   * Submit a new background job.
   * Returns the job ID, or undefined if budget is exceeded.
   */
  submit(request: JobRequest): string | undefined {
    const running = this.getJobsByStatus('running').length +
                    this.getJobsByStatus('queued').length;

    if (running >= this.maxConcurrent) {
      console.warn(`[BackgroundJobManager] Max concurrent jobs (${this.maxConcurrent}) reached.`);
      EventBus.publish('ai:background_job:budget_exceeded', {
        label: request.label,
        currentJobs: running,
        maxJobs: this.maxConcurrent,
      });
      return undefined;
    }

    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const job: BackgroundJob = {
      id,
      label: request.label,
      command: request.command,
      cwd: request.cwd,
      status: 'queued',
      conversationId: request.conversationId,
      startedAt: Date.now(),
    };

    this.jobs.set(id, job);

    if (request.onComplete) {
      this.callbacks.set(id, request.onComplete);
    }

    // Set timeout if configured
    const timeoutMs = request.timeoutMs || 30 * 60 * 1000; // 30 min default
    const timeoutHandle = setTimeout(() => {
      this.markFailed(id, 'Timed out');
    }, timeoutMs);
    this.timeouts.set(id, timeoutHandle);

    EventBus.publish('ai:background_job:submitted', {
      jobId: id,
      label: request.label,
      command: request.command,
      cwd: request.cwd,
    });

    return id;
  }

  /**
   * Mark a job as running (called when the actual process starts).
   */
  markRunning(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.startedAt = Date.now();

    EventBus.publish('ai:background_job:started', {
      jobId,
      label: job.label,
    });
  }

  /**
   * Update job progress.
   */
  updateProgress(jobId: string, progress: number, lastOutput?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.progress = Math.min(100, Math.max(0, progress));
    if (lastOutput !== undefined) {
      job.lastOutput = lastOutput;
    }
  }

  /**
   * Mark a job as completed successfully.
   */
  markCompleted(jobId: string, exitCode: number = 0, output?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.completedAt = Date.now();
    job.exitCode = exitCode;
    job.progress = 100;
    if (output !== undefined) {
      job.lastOutput = output;
    }

    this.clearTimeout(jobId);
    this.invokeCallback(jobId);

    EventBus.publish('ai:background_job:completed', {
      jobId,
      label: job.label,
      exitCode,
      durationMs: job.completedAt - job.startedAt,
    });
  }

  /**
   * Mark a job as failed.
   */
  markFailed(jobId: string, error?: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'cancelled') return;

    job.status = 'failed';
    job.completedAt = Date.now();
    if (error) {
      job.lastOutput = error;
    }

    this.clearTimeout(jobId);
    this.invokeCallback(jobId);

    EventBus.publish('ai:background_job:failed', {
      jobId,
      label: job.label,
      error,
    });
  }

  /**
   * Cancel a running or queued job.
   */
  cancel(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'cancelled';
    job.completedAt = Date.now();

    this.clearTimeout(jobId);

    EventBus.publish('ai:background_job:cancelled', {
      jobId,
      label: job.label,
    });
  }

  // ─── Queries ──────────────────────────────────────────────────────────

  /** Get a job by ID. */
  getJob(jobId: string): BackgroundJob | undefined {
    return this.jobs.get(jobId);
  }

  /** Get all jobs. */
  getAllJobs(): BackgroundJob[] {
    return Array.from(this.jobs.values());
  }

  /** Get jobs filtered by status. */
  getJobsByStatus(status: JobStatus): BackgroundJob[] {
    return this.getAllJobs().filter(j => j.status === status);
  }

  /** Get jobs for a specific conversation. */
  getJobsByConversation(conversationId: string): BackgroundJob[] {
    return this.getAllJobs().filter(j => j.conversationId === conversationId);
  }

  /** Get count of active (running + queued) jobs. */
  get activeCount(): number {
    return this.getJobsByStatus('running').length +
           this.getJobsByStatus('queued').length;
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  /** Remove completed/failed/cancelled jobs older than the given age (ms). */
  prune(maxAgeMs: number = 3600_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, job] of this.jobs) {
      if (
        (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
        (job.completedAt || job.startedAt) < cutoff
      ) {
        this.jobs.delete(id);
        this.callbacks.delete(id);
      }
    }
  }

  /** Reset all state (for testing). */
  reset(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.jobs.clear();
    this.callbacks.clear();
  }

  static resetInstance(): void {
    if (BackgroundJobManager.instance) {
      BackgroundJobManager.instance.reset();
      BackgroundJobManager.instance = null;
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private clearTimeout(jobId: string): void {
    const handle = this.timeouts.get(jobId);
    if (handle) {
      clearTimeout(handle);
      this.timeouts.delete(jobId);
    }
  }

  private invokeCallback(jobId: string): void {
    const callback = this.callbacks.get(jobId);
    const job = this.jobs.get(jobId);
    if (callback && job) {
      try {
        callback(job);
      } catch (e) {
        console.error(`[BackgroundJobManager] Callback error for job ${jobId}:`, e);
      }
      this.callbacks.delete(jobId);
    }
  }
}
