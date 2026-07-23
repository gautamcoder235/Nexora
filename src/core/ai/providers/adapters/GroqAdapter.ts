import { BaseAdapter, StreamOptions, ProviderCapabilities } from '../BaseAdapter';
import { ConversationMessage, StreamChunk, ModelCapability } from '../../protocol';

export class GroqAdapter extends BaseAdapter {
  readonly providerId = 'groq';
  readonly providerName = 'Groq';

  get capabilities(): ProviderCapabilities {
    return {
      supportsThinking: false,
      supportsVision: true, // Depending on model
      supportsToolCalling: true,
      supportsJsonMode: true,
      supportsStreaming: true,
    };
  }

  async listModels(): Promise<ModelCapability[]> {
    return [];
  }

  async *stream(messages: ConversationMessage[], options: StreamOptions): AsyncGenerator<StreamChunk> {
    // TODO: Implement Groq streaming (similar to OpenAI)
    yield { type: 'done', content: '' };
  }
}
