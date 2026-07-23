import { BaseAdapter, StreamOptions, ProviderCapabilities } from '../BaseAdapter';
import { ConversationMessage, StreamChunk, ModelCapability } from '../../protocol';

export class DeepSeekAdapter extends BaseAdapter {
  readonly providerId = 'deepseek';
  readonly providerName = 'DeepSeek';

  get capabilities(): ProviderCapabilities {
    return {
      supportsThinking: true,
      supportsVision: false,
      supportsToolCalling: true,
      supportsJsonMode: true,
      supportsStreaming: true,
    };
  }

  async listModels(): Promise<ModelCapability[]> {
    return [];
  }

  async *stream(messages: ConversationMessage[], options: StreamOptions): AsyncGenerator<StreamChunk> {
    // TODO: Implement DeepSeek streaming (similar to OpenAI)
    yield { type: 'done', content: '' };
  }
}
