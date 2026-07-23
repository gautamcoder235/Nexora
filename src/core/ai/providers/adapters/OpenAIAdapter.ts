import { BaseAdapter, StreamOptions, ProviderCapabilities } from '../BaseAdapter';
import { ConversationMessage, StreamChunk, ModelCapability } from '../../protocol';
import { StreamingEngine } from '../StreamingEngine';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
}

export class OpenAIAdapter extends BaseAdapter {
  readonly providerId = 'openai';
  readonly providerName = 'OpenAI';
  
  private config: OpenAIConfig;
  private streamingEngine: StreamingEngine;

  constructor(config: OpenAIConfig) {
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
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
    
    // Convert generic messages to OpenAI format
    const apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const body: any = {
      model: options.model,
      messages: apiMessages,
      stream: true
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_completion_tokens = options.maxTokens;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: options.signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI API Error: ${response.statusText}`);
    }

    const extractChunk = (parsed: any): StreamChunk | StreamChunk[] | null => {
      const choice = parsed.choices?.[0];
      if (!choice) return null;

      const chunks: StreamChunk[] = [];
      const delta = choice.delta;

      if (delta?.reasoning_content) {
        chunks.push({ type: 'thinking', content: delta.reasoning_content });
      }
      
      if (delta?.content) {
        chunks.push({ type: 'content', content: delta.content });
      }

      if (parsed.usage) {
        chunks.push({
          type: 'usage',
          content: '',
          usage: {
            promptTokens: parsed.usage.prompt_tokens,
            completionTokens: parsed.usage.completion_tokens,
            totalTokens: parsed.usage.total_tokens
          }
        });
      }

      return chunks.length > 0 ? chunks : null;
    };

    for await (const chunk of this.streamingEngine.parseSSE(response.body, extractChunk)) {
      yield chunk;
    }
  }
}
