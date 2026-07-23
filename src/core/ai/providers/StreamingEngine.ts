import { StreamChunk, TokenUsage } from '../protocol';

export class StreamingEngine {
  /**
   * Parses an SSE stream into normalized stream chunks.
   * Assumes the typical "data: {...}" format.
   */
  public async *parseSSE(
    stream: ReadableStream<Uint8Array>,
    extractChunk: (data: any) => StreamChunk | StreamChunk[] | null
  ): AsyncGenerator<StreamChunk> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);
            const chunks = extractChunk(parsed);
            if (chunks) {
              if (Array.isArray(chunks)) {
                for (const chunk of chunks) yield chunk;
              } else {
                yield chunks;
              }
            }
          } catch (e) {
            // Ignore parse errors on partial chunks if any
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parses an NDJSON (Newline Delimited JSON) stream into normalized stream chunks.
   * Commonly used by Ollama.
   */
  public async *parseNDJSON(
    stream: ReadableStream<Uint8Array>,
    extractChunk: (data: any) => StreamChunk | StreamChunk[] | null
  ): AsyncGenerator<StreamChunk> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed);
            const chunks = extractChunk(parsed);
            if (chunks) {
              if (Array.isArray(chunks)) {
                for (const chunk of chunks) yield chunk;
              } else {
                yield chunks;
              }
            }
          } catch (e) {
            // Error parsing line
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
