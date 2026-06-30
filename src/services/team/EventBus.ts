import { listen, UnlistenFn } from '@tauri-apps/api/event';

export type EventCallback<T = any> = (payload: T) => void;

class EventBus {
  private listeners: Record<string, EventCallback[]> = {};
  private unlisteners: Record<string, UnlistenFn> = {};

  on<T>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
      this.setupTauriListener(event);
    }
    this.listeners[event].push(callback);

    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      if (this.listeners[event].length === 0) {
        if (this.unlisteners[event]) {
          this.unlisteners[event]();
          delete this.unlisteners[event];
        }
      }
    };
  }

  emit(event: string, payload: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(payload));
    }
  }

  private async setupTauriListener(event: string) {
    try {
      const unlisten = await listen(event, (tauriEvent) => {
        this.emit(event, tauriEvent.payload);
      });
      this.unlisteners[event] = unlisten;
    } catch (e) {
      // Quietly ignore or log in dev mode if Tauri is not available
      console.debug(`Could not register Tauri listener for event: ${event}. Running in fallback mode.`, e);
    }
  }
}

export const eventBus = new EventBus();
