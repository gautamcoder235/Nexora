import { EventBus } from '../../events';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: string;
  source: string;
  payload: any;
}

/**
 * Unified chronological event log.
 */
export class ActivityTimeline {
  private events: TimelineEvent[] = [];
  private maxSize: number;
  private subscribers: Array<(event: TimelineEvent) => void> = [];

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Gets events, optionally filtered.
   * @param filter Filter function.
   */
  getEvents(filter?: (e: TimelineEvent) => boolean): TimelineEvent[] {
    return filter ? this.events.filter(filter) : this.events;
  }

  /**
   * Gets events since a specific timestamp.
   * @param timestamp The timestamp to compare against.
   */
  getEventsSince(timestamp: number): TimelineEvent[] {
    return this.events.filter(e => e.timestamp > timestamp);
  }

  /**
   * Clears the timeline.
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Subscribes to timeline events.
   * @param callback The callback function.
   */
  subscribe(callback: (event: TimelineEvent) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  /**
   * Internal method to add and notify.
   */
  addEvent(event: TimelineEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      this.events.shift();
    }
    
    // Publish via EventBus and local subscribers
    this.subscribers.forEach(cb => cb(event));
  }
}
