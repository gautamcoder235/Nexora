import { CapabilityRegistry } from './CapabilityRegistry';
import { ModelCapability } from '../protocol';

export type TaskType = 'fast' | 'complex' | 'vision' | 'long_context' | 'quick_question' | 'rename' | 'refactor' | 'architecture' | 'codebase' | 'image';

export class ModelSelector {
  private registry: CapabilityRegistry;

  constructor(registry: CapabilityRegistry) {
    this.registry = registry;
  }

  public selectModel(taskType: TaskType): ModelCapability {
    switch (taskType) {
      case 'rename':
      case 'refactor':
      case 'fast':
      case 'quick_question': {
        const models = this.registry.getModelsByProvider('openai');
        const fastOpenAi = models.find(m => m.modelId === 'gpt-4o-mini');
        if (fastOpenAi) return fastOpenAi;
        const geminiModels = this.registry.getModelsByProvider('google');
        const fastGemini = geminiModels.find(m => m.modelId === 'gemini-2.5-flash');
        if (fastGemini) return fastGemini;
        return this.registry.getBestModelForTask(taskType);
      }
      
      case 'complex':
      case 'architecture': {
        const anthropicModels = this.registry.getModelsByProvider('anthropic');
        const opus = anthropicModels.find(m => m.modelId === 'claude-opus-4');
        if (opus) return opus;
        const o3 = this.registry.getCapability('o3');
        if (o3) return o3;
        return this.registry.getBestModelForTask(taskType);
      }

      case 'vision':
      case 'image': {
        const geminiPro = this.registry.getCapability('gemini-2.5-pro');
        if (geminiPro) return geminiPro;
        const gpt4o = this.registry.getCapability('gpt-4o');
        if (gpt4o) return gpt4o;
        return this.registry.getBestModelForTask(taskType);
      }

      case 'long_context':
      case 'codebase': {
        const geminiPro = this.registry.getCapability('gemini-2.5-pro');
        if (geminiPro) return geminiPro;
        return this.registry.getBestModelForTask(taskType);
      }

      default:
        return this.registry.getBestModelForTask(taskType);
    }
  }
}
