import { BaseAdapter, StreamOptions, ProviderCapabilities } from '../BaseAdapter';
import { ConversationMessage, StreamChunk, ModelCapability } from '../../protocol';
import { StreamingEngine } from '../StreamingEngine';

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
  anthropicVersion?: string;
}

export class AnthropicAdapter extends BaseAdapter {
  readonly providerId = 'anthropic';
  readonly providerName = 'Anthropic';
  
  private config: AnthropicConfig;
  private streamingEngine: StreamingEngine;

  constructor(config: AnthropicConfig) {
    super();
    this.config = config;
    this.streamingEngine = new StreamingEngine();
  }

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
    const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com/v1';
    
    // Filter out system messages as Anthropic takes it at the top level
    const apiMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role,
      content: m.content
    }));

    const systemPrompt = options.systemPrompt || messages.find(m => m.role === 'system')?.content;

    const body: any = {
      model: options.model,
      messages: apiMessages,
      stream: true,
      max_tokens: options.maxTokens ?? 8192
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }
    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.anthropicVersion ?? '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: options.signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Anthropic API Error: ${response.statusText}`);
    }

    const extractChunk = (parsed: any): StreamChunk | StreamChunk[] | null => {
      if (parsed.type === 'content_block_delta') {
        const delta = parsed.delta;
        if (delta?.type === 'text_delta') {
          return { type: 'content', content: delta.text };
        } else if (delta?.type === 'thinking_delta') {
          return { type: 'thinking', content: delta.thinking };
        }
      }
      
      if (parsed.type === 'message_stop') {
        return { type: 'done', content: '' };
      }

      if (parsed.type === 'message_start' && parsed.message?.usage) {
         // handle usage if needed
      }

      return null;
    };

    for await (const chunk of this.streamingEngine.parseSSE(response.body, extractChunk)) {
      yield chunk;
    }
  }
}
