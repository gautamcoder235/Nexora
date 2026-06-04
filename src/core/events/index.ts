type EventCallback<T = any> = (data: T) => void;

export class EventBus {
  private static listeners: Record<string, EventCallback[]> = {};

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
   */
  static publish<T = any>(event: string, data: T): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`EventBus handler failed for event "${event}":`, error);
      }
    });
  }
}
