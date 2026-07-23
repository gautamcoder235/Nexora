import { TimelineEvent } from './ActivityTimeline';

export interface RecordedConversation {
  conversationId: string;
  startTime: number;
  endTime?: number;
  events: TimelineEvent[];
}

/**
 * Records and replays full conversation traces.
 */
export class ConversationReplay {
  private recordings: Map<string, RecordedConversation> = new Map();
  private activeRecordings: Set<string> = new Set();

  /**
   * Starts recording a conversation.
   * @param conversationId The ID of the conversation.
   */
  startRecording(conversationId: string): void {
    this.activeRecordings.add(conversationId);
    this.recordings.set(conversationId, {
      conversationId,
      startTime: Date.now(),
      events: []
    });
  }

  /**
   * Stops recording and returns the final trace.
   * @param conversationId The ID of the conversation.
   */
  stopRecording(conversationId: string): RecordedConversation {
    this.activeRecordings.delete(conversationId);
    const recording = this.recordings.get(conversationId);
    if (recording) {
      recording.endTime = Date.now();
      return recording;
    }
    throw new Error('Recording not found');
  }

  /**
   * Gets a specific recording.
   * @param conversationId The ID of the conversation.
   */
  getRecording(conversationId: string): RecordedConversation | undefined {
    return this.recordings.get(conversationId);
  }

  /**
   * Replays a recording.
   * @param recording The recorded conversation trace.
   */
  async replay(recording: RecordedConversation): Promise<void> {
    for (const event of recording.events) {
      // Emit event through EventBus logic here
      await new Promise(resolve => setTimeout(resolve, 50)); // simulate timing
    }
  }
}
