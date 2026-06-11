type Task = () => void;
type ScheduledTask = { fn: Task, queuedAt: number };

export class EventScheduler {
  private queue: ScheduledTask[] = [];
  private isProcessing = false;
  private readonly FRAME_BUDGET_MS = 8; // Target ~120fps (8.3ms), leaving room for React

  public schedule(task: Task): void {
    this.queue.push({ fn: task, queuedAt: performance.now() });
    if (!this.isProcessing) {
      this.isProcessing = true;
      requestAnimationFrame(this.processQueue);
    }
  }

  private processQueue = (now: number): void => {
    const start = performance.now();
    let tasksProcessed = 0;

    while (this.queue.length > 0) {
      const iterStart = performance.now();
      
      // If we've blown our frame budget, yield to the browser
      if (iterStart - start >= this.FRAME_BUDGET_MS) {
        // Log deep queue backlogs
        if (this.queue.length > 50) {
          console.warn(`[EventScheduler] Queue backlogged: ${this.queue.length} tasks remaining. Yielding to browser.`);
        }
        requestAnimationFrame(this.processQueue);
        return;
      }

      const taskObj = this.queue.shift();
      if (taskObj) {
        const waitTime = iterStart - taskObj.queuedAt;
        if (waitTime > 50) {
          console.warn(`[EventScheduler] High INP Warning: Task waited in queue for ${waitTime.toFixed(1)}ms`);
        }

        try {
          taskObj.fn();
        } catch (error) {
          console.error('[EventScheduler] Task failed:', error);
        }

        const duration = performance.now() - iterStart;
        if (duration > 15) {
          console.warn(`[EventScheduler] Long Task Warning: Single task took ${duration.toFixed(1)}ms`);
        }
        tasksProcessed++;
      }
    }

    const totalDuration = performance.now() - start;
    if (totalDuration > 10) {
      console.log(`[EventScheduler] Processed ${tasksProcessed} tasks in ${totalDuration.toFixed(1)}ms`);
    }

    this.isProcessing = false;
  };

  /**
   * Clears all pending tasks. Useful during teardown or extreme recovery.
   */
  public clear(): void {
    this.queue = [];
    this.isProcessing = false;
  }
}

export const globalScheduler = new EventScheduler();
