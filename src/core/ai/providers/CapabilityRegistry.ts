import { ModelCapability } from '../protocol';

export class CapabilityRegistry {
  private models: Map<string, ModelCapability> = new Map();

  constructor() {
    this.registerDefaultModels();
  }

  private registerDefaultModels() {
    const defaultModels: ModelCapability[] = [
      {
        modelId: 'gpt-4o',
        providerId: 'openai',
        displayName: 'GPT-4o',
        maxContextTokens: 128000,
        maxOutputTokens: 4096,
        supportsThinking: false,
        supportsVision: true,
        supportsVideo: false,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'medium',
        qualityTier: 'frontier'
      },
      {
        modelId: 'gpt-4o-mini',
        providerId: 'openai',
        displayName: 'GPT-4o Mini',
        maxContextTokens: 128000,
        maxOutputTokens: 16384,
        supportsThinking: false,
        supportsVision: true,
        supportsVideo: false,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'fast',
        qualityTier: 'standard'
      },
      {
        modelId: 'o3',
        providerId: 'openai',
        displayName: 'o3',
        maxContextTokens: 200000,
        maxOutputTokens: 100000,
        supportsThinking: true,
        supportsVision: false,
        supportsVideo: false,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'slow',
        qualityTier: 'frontier'
      },
      {
        modelId: 'o4-mini',
        providerId: 'openai',
        displayName: 'o4-mini',
        maxContextTokens: 200000,
        maxOutputTokens: 100000,
        supportsThinking: true,
        supportsVision: false,
        supportsVideo: false,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'fast',
        qualityTier: 'standard'
      },
      {
        modelId: 'claude-sonnet-4',
        providerId: 'anthropic',
        displayName: 'Claude Sonnet 4',
        maxContextTokens: 200000,
        maxOutputTokens: 8192,
        supportsThinking: true,
        supportsVision: true,
        supportsVideo: false,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'medium',
        qualityTier: 'advanced'
      },
      {
        modelId: 'claude-opus-4',
        providerId: 'anthropic',
        displayName: 'Claude Opus 4',
        maxContextTokens: 200000,
        maxOutputTokens: 8192,
        supportsThinking: true,
        supportsVision: true,
        supportsVideo: false,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'slow',
        qualityTier: 'frontier'
      },
      {
        modelId: 'gemini-2.5-pro',
        providerId: 'google',
        displayName: 'Gemini 2.5 Pro',
        maxContextTokens: 2000000,
        maxOutputTokens: 8192,
        supportsThinking: true,
        supportsVision: true,
        supportsVideo: true,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'medium',
        qualityTier: 'frontier'
      },
      {
        modelId: 'gemini-2.5-flash',
        providerId: 'google',
        displayName: 'Gemini 2.5 Flash',
        maxContextTokens: 1000000,
        maxOutputTokens: 8192,
        supportsThinking: false,
        supportsVision: true,
        supportsVideo: true,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'fast',
        qualityTier: 'standard'
      },
      {
        modelId: 'deepseek-chat',
        providerId: 'deepseek',
        displayName: 'DeepSeek Chat',
        maxContextTokens: 64000,
        maxOutputTokens: 8192,
        supportsThinking: false,
        supportsVision: false,
        supportsVideo: false,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'fast',
        qualityTier: 'standard'
      },
      {
        modelId: 'deepseek-reasoner',
        providerId: 'deepseek',
        displayName: 'DeepSeek Reasoner',
        maxContextTokens: 64000,
        maxOutputTokens: 8192,
        supportsThinking: true,
        supportsVision: false,
        supportsVideo: false,
        supportsToolCalling: true,
        supportsJsonMode: true,
        supportsStreaming: true,
        speedTier: 'slow',
        qualityTier: 'advanced'
      }
    ];

    for (const model of defaultModels) {
      this.registerModel(model);
    }
  }

  public getCapability(modelId: string): ModelCapability | undefined {
    return this.models.get(modelId);
  }

  public registerModel(capability: ModelCapability): void {
    this.models.set(capability.modelId, capability);
  }

  public getModelsByProvider(providerId: string): ModelCapability[] {
    return Array.from(this.models.values()).filter(m => m.providerId === providerId);
  }

  public getBestModelForTask(taskType: string): ModelCapability {
    const models = Array.from(this.models.values());
    if (models.length === 0) {
      throw new Error("No models registered");
    }

    if (taskType === 'rename' || taskType === 'refactor' || taskType === 'fast' || taskType === 'quick_question') {
      const fastModels = models.filter(m => m.speedTier === 'fast');
      return fastModels.length > 0 ? fastModels[0] : models[0];
    }
    
    if (taskType === 'complex' || taskType === 'architecture') {
      const frontierModels = models.filter(m => m.qualityTier === 'frontier');
      return frontierModels.length > 0 ? frontierModels[0] : models[0];
    }
    
    if (taskType === 'vision' || taskType === 'image') {
      const visionModels = models.filter(m => m.supportsVision);
      return visionModels.length > 0 ? visionModels[0] : models[0];
    }
    
    if (taskType === 'long_context' || taskType === 'codebase') {
      const sortedByContext = [...models].sort((a, b) => b.maxContextTokens - a.maxContextTokens);
      return sortedByContext[0];
    }
    
    return models[0];
  }
}
