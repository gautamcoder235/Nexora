import { listen } from '@tauri-apps/api/event';

export interface Chunk {
  sequenceId: number;
  timestamp: number;
  data: string;
}

export class ChunkBuffer {
  chunks: Chunk[] = [];
  totalBytes: number = 0;
  nextSequenceId: number = 0;
}

export type TerminalVisibility = 'Visible' | 'Hidden' | 'Background';

export class TerminalBufferManager {
  private static instance: TerminalBufferManager;
  private buffers = new Map<string, ChunkBuffer>();
  // Default to 50MB per session
  public maxBufferBytes: number = 50 * 1024 * 1024;

  private visibilities = new Map<string, TerminalVisibility>();
  
  // Callbacks for components to listen to new chunks (only if visible)
  private subscribers = new Map<string, (chunk: Chunk) => void>();
  
  // Replay queues
  private replayQueues = new Map<string, Chunk[]>();
  private replayAnimFrameIds = new Map<string, number>();

  private isListening = false;

  private constructor() {}

  public static getInstance(): TerminalBufferManager {
    if (!TerminalBufferManager.instance) {
      TerminalBufferManager.instance = new TerminalBufferManager();
      TerminalBufferManager.instance.setupGlobalListeners();
    }
    return TerminalBufferManager.instance;
  }

  private async setupGlobalListeners() {
    if (this.isListening) return;
    this.isListening = true;

    listen<{ sessionId: string; data: string }>(
      'terminal:stdout',
      (event) => {
        const { sessionId, data } = event.payload;
        this.append(sessionId, data);
      }
    );
  }

  public append(sessionId: string, data: string): Chunk {
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = new ChunkBuffer();
      this.buffers.set(sessionId, buffer);
    }

    const chunk: Chunk = {
      sequenceId: buffer.nextSequenceId++,
      timestamp: Date.now(),
      data,
    };

    buffer.chunks.push(chunk);
    buffer.totalBytes += new Blob([data]).size;

    this.trimBuffer(buffer);

    const visibility = this.visibilities.get(sessionId) || 'Visible';

    if (visibility === 'Visible') {
      // If we are currently replaying, queue it up so it stays in order
      const replayQueue = this.replayQueues.get(sessionId);
      if (replayQueue && replayQueue.length > 0) {
        replayQueue.push(chunk);
      } else {
        // Direct dispatch
        const subscriber = this.subscribers.get(sessionId);
        if (subscriber) {
          subscriber(chunk);
        }
      }
    } else {
      // Hoard the chunk, do not dispatch
      let replayQueue = this.replayQueues.get(sessionId);
      if (!replayQueue) {
        replayQueue = [];
        this.replayQueues.set(sessionId, replayQueue);
      }
      replayQueue.push(chunk);
    }

    return chunk;
  }

  private trimBuffer(buffer: ChunkBuffer) {
    while (buffer.totalBytes > this.maxBufferBytes && buffer.chunks.length > 0) {
      const removedChunk = buffer.chunks.shift();
      if (removedChunk) {
        buffer.totalBytes -= new Blob([removedChunk.data]).size;
      }
    }
  }

  public getSnapshot(sessionId: string): string {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return '';
    return buffer.chunks.map((c) => c.data).join('');
  }

  public clear(sessionId: string) {
    this.buffers.delete(sessionId);
    this.replayQueues.delete(sessionId);
    const frameId = this.replayAnimFrameIds.get(sessionId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      this.replayAnimFrameIds.delete(sessionId);
    }
  }

  public subscribe(sessionId: string, callback: (chunk: Chunk) => void) {
    this.subscribers.set(sessionId, callback);
  }

  public unsubscribe(sessionId: string) {
    this.subscribers.delete(sessionId);
  }

  public setVisibility(sessionId: string, visibility: TerminalVisibility) {
    const oldVisibility = this.visibilities.get(sessionId) || 'Visible';
    this.visibilities.set(sessionId, visibility);

    // If becoming visible, schedule a gradual replay
    if (visibility === 'Visible' && oldVisibility !== 'Visible') {
      this.scheduleGradualReplay(sessionId);
    }
  }

  private scheduleGradualReplay(sessionId: string) {
    const queue = this.replayQueues.get(sessionId);
    const subscriber = this.subscribers.get(sessionId);

    if (!queue || queue.length === 0 || !subscriber) return;

    if (this.replayAnimFrameIds.has(sessionId)) return;

    const replayBatch = () => {
      const q = this.replayQueues.get(sessionId);
      if (!q || q.length === 0) {
        this.replayAnimFrameIds.delete(sessionId);
        return;
      }

      // Replay chunks in batches (e.g., up to 256KB or 10 chunks per frame)
      let bytesSent = 0;
      const MAX_BYTES_PER_FRAME = 256 * 1024;
      
      // Combine chunks into a single string for optimal xterm writing
      let combinedData = '';
      
      while (q.length > 0 && bytesSent < MAX_BYTES_PER_FRAME) {
        const chunk = q.shift()!;
        combinedData += chunk.data;
        bytesSent += new Blob([chunk.data]).size;
      }

      if (combinedData.length > 0) {
        // Send as a single chunk to the subscriber to avoid multiple xterm writes
        subscriber({
          sequenceId: -1, // Internal replay marker
          timestamp: Date.now(),
          data: combinedData
        });
      }

      if (q.length > 0) {
        this.replayAnimFrameIds.set(sessionId, requestAnimationFrame(replayBatch));
      } else {
        this.replayAnimFrameIds.delete(sessionId);
      }
    };

    this.replayAnimFrameIds.set(sessionId, requestAnimationFrame(replayBatch));
  }
}
