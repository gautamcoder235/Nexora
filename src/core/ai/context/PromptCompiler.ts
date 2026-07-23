import { AllocatedContext } from './TokenBudgetManager';
import { MemoryEntry } from './MemoryEngine';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompileRequest {
  systemPrompt: string;
  context: AllocatedContext;
  memory: MemoryEntry[];
  skills: string[];
  userMessage: string;
  tools: ToolDefinition[];
  conversationHistory: ConversationMessage[];
}

export interface CompiledPrompt {
  messages: Array<{role: string, content: string}>;
  toolDefinitions?: ToolDefinition[];
  estimatedTokens: number;
}

/**
 * Deterministic prompt assembly.
 */
export class PromptCompiler {
  /**
   * Compiles components into a final prompt array.
   * @param request The compilation request parameters.
   */
  compile(request: CompileRequest): CompiledPrompt {
    const messages: Array<{role: string, content: string}> = [];

    let systemContent = request.systemPrompt + '\n\n';
    
    // Append Context
    if (request.context.allocatedSections.length > 0) {
      systemContent += 'Context:\n' + request.context.allocatedSections.map(s => s.content).join('\n') + '\n\n';
    }

    // Append Memory
    if (request.memory.length > 0) {
      systemContent += 'Memory:\n' + request.memory.map(m => m.content).join('\n') + '\n\n';
    }

    // Append Skills
    if (request.skills.length > 0) {
      systemContent += 'Skills:\n' + request.skills.join('\n') + '\n\n';
    }

    messages.push({ role: 'system', content: systemContent });

    // Append History
    messages.push(...request.conversationHistory);

    // Append User Message
    messages.push({ role: 'user', content: request.userMessage });

    return {
      messages,
      toolDefinitions: request.tools,
      estimatedTokens: request.context.totalTokens // Simplification
    };
  }
}
