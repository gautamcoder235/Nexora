import { globalScheduler } from './scheduler';

type EventCallback<T = any> = (data: T) => void;

export class EventBus {
  private static listeners: Record<string, EventCallback[]> = {};
  private static dispatchDepth = 0;
  private static readonly MAX_DEPTH = 50;

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  static subscribe<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  /**
   * Publish an event with optional data payload.
   * Handlers are executed asynchronously via the frame-budgeted EventScheduler.
   */
  static publish<T = any>(event: string, data: T): void {
    if (this.dispatchDepth > this.MAX_DEPTH) {
      console.warn(`[EventBus] Cyclic dispatch detected on event: ${event}. Recursion limit reached. Aborting.`);
      return;
    }
    
    if (!this.listeners[event]) return;
    
    this.dispatchDepth++;
    try {
      // slice() ensures that if a listener unsubscribes during execution, it doesn't break the loop
      const handlers = this.listeners[event].slice();
      handlers.forEach(callback => {
        globalScheduler.schedule(() => {
          try {
            callback(data);
          } catch (error) {
            console.error(`EventBus handler failed for event "${event}":`, error);
          }
        });
      });
    } finally {
      this.dispatchDepth--;
    }
  }
}
