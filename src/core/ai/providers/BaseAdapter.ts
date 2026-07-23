import { ConversationMessage, StreamChunk, ToolDefinition, ModelCapability } from '../protocol';

export interface StreamOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface ProviderCapabilities {
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
}

export abstract class BaseAdapter {
  abstract readonly providerId: string;
  abstract readonly providerName: string;
  
  abstract stream(messages: ConversationMessage[], options: StreamOptions): AsyncGenerator<StreamChunk>;
  abstract listModels(): Promise<ModelCapability[]>;
  abstract get capabilities(): ProviderCapabilities;
}
