import { BaseAdapter, StreamOptions, ProviderCapabilities } from '../BaseAdapter';
import { ConversationMessage, StreamChunk, ModelCapability } from '../../protocol';

export class OpenRouterAdapter extends BaseAdapter {
  readonly providerId = 'openrouter';
  readonly providerName = 'OpenRouter';

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
    // TODO: Implement OpenRouter streaming
    yield { type: 'done', content: '' };
  }
}
