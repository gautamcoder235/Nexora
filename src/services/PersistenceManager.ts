import { useOrchestratorStore } from "../stores/orchestratorStore";

interface SaveJob {
  id: string;
  timestamp: number;
}

/**
 * PersistenceManager Service
 * 
 * Infrastructure service responsible for decoupling state mutations from heavy 
 * JSON serialization and IPC writes. It implements dirty flag tracking,
 * debouncing, and save failure recovery (retry queue).
 */
export class PersistenceManager {
  private static instance: PersistenceManager;
  
  private isDirty = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isSaving = false;
  private saveQueue: SaveJob[] = [];
  public lastSuccessfulSave: number = 0;
  
  private readonly DEBOUNCE_MS = 2000; // 2 seconds debounce window
  private readonly RETRY_MS = 5000;    // 5 seconds retry on failure

  private constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("blur", () => {
        if (this.isDirty) {
          console.log("[PersistenceManager] Window blurred. Triggering immediate save...");
          this.forceSaveImmediate();
        }
      });
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && this.isDirty) {
          console.log("[PersistenceManager] Window hidden/minimized. Triggering immediate save...");
          this.forceSaveImmediate();
        }
      });
      window.addEventListener("beforeunload", () => {
        if (this.isDirty) {
          console.log("[PersistenceManager] Window unloading. Triggering immediate save...");
          this.forceSaveImmediate();
        }
      });
    }
  }

  static getInstance(): PersistenceManager {
    if (!PersistenceManager.instance) {
      PersistenceManager.instance = new PersistenceManager();
    }
    return PersistenceManager.instance;
  }

  /**
   * Called by the store whenever state mutates.
   * Marks state as dirty and resets the debounce timer.
   */
  public requestSave() {
    this.isDirty = true;
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        (window as any).requestIdleCallback(() => {
          this.enqueueSave();
        }, { timeout: 1000 });
      } else {
        this.enqueueSave();
      }
    }, this.DEBOUNCE_MS);
  }

  /**
   * Immediately queues a save, bypassing the debounce window.
   */
  public forceSaveImmediate() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.enqueueSave();
  }

  private enqueueSave() {
    // Coalesce saves: If queue already has a job, we don't need a new one
    // because the pending job will serialize the absolute latest state when it runs.
    if (this.saveQueue.length === 0) {
      this.saveQueue.push({ id: Math.random().toString(36), timestamp: Date.now() });
      this.processQueue();
    }
  }

  private async processQueue() {
    // If currently saving, the queue will be checked when the current save finishes.
    if (this.isSaving || this.saveQueue.length === 0) return;
    
    this.isSaving = true;
    const job = this.saveQueue.shift()!;
    this.isDirty = false;

    try {
      // Execute the actual snapshot extraction & IPC save logic
      await useOrchestratorStore.getState().performActualSave();
      
      this.lastSuccessfulSave = Date.now();
    } catch (error) {
      console.error("[PersistenceManager] Save failed:", error);
      
      // Save Failure Recovery
      this.isDirty = true; // State is still unsaved
      
      // Telemetry hook can go here in the future
      
      // Re-queue automatically after retry delay
      setTimeout(() => {
        console.warn("[PersistenceManager] Retrying failed save...");
        this.enqueueSave();
      }, this.RETRY_MS);
      
    } finally {
      this.isSaving = false;
      
      // If state mutated again during the async save process, process it
      if (this.isDirty && this.saveQueue.length === 0) {
        this.enqueueSave();
      }
    }
  }
}
