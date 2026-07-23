import { BaseAdapter, StreamOptions, ProviderCapabilities } from '../BaseAdapter';
import { ConversationMessage, StreamChunk, ModelCapability } from '../../protocol';

export class GeminiAdapter extends BaseAdapter {
  readonly providerId = 'google';
  readonly providerName = 'Google Gemini';

  get capabilities(): ProviderCapabilities {
    return {
      supportsThinking: true,
      supportsVision: true,
      supportsToolCalling: true,
      supportsJsonMode: true,
      supportsStreaming: true,
    };
  }

  async listModels(): Promise<ModelCapability[]> {
    return [];
  }

  async *stream(messages: ConversationMessage[], options: StreamOptions): AsyncGenerator<StreamChunk> {
    // TODO: Implement Gemini streaming
    yield { type: 'done', content: '' };
  }
}
