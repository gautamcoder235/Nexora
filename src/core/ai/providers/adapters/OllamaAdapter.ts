import { BaseAdapter, StreamOptions, ProviderCapabilities } from '../BaseAdapter';
import { ConversationMessage, StreamChunk, ModelCapability } from '../../protocol';

export class OllamaAdapter extends BaseAdapter {
  readonly providerId = 'ollama';
  readonly providerName = 'Ollama';

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
    // TODO: Implement Ollama streaming (using NDJSON parsing)
    yield { type: 'done', content: '' };
  }
}
