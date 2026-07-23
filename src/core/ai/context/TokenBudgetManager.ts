import { ContextPayload, ContextSection } from './ContextBuilder';

export interface AllocatedContext {
  allocatedSections: ContextSection[];
  totalTokens: number;
  omittedSections: string[];
}

/**
 * Priority-based token allocation manager.
 */
export class TokenBudgetManager {
  /**
   * Allocates tokens by priority.
   * @param payload The context payload.
   * @param maxTokens The maximum token budget.
   */
  allocate(payload: ContextPayload, maxTokens: number): AllocatedContext {
    const allocatedSections: ContextSection[] = [];
    let currentTokens = 0;
    const omittedSections: string[] = [];

    const priorities = ['critical', 'high', 'medium', 'low'];

    for (const priority of priorities) {
      const sections = payload.sections.filter(s => s.priority === priority);
      for (const section of sections) {
        if (currentTokens + section.tokenEstimate <= maxTokens) {
          allocatedSections.push(section);
          currentTokens += section.tokenEstimate;
        } else {
          omittedSections.push(section.id);
        }
      }
    }

    return {
      allocatedSections,
      totalTokens: currentTokens,
      omittedSections
    };
  }

  /**
   * Simple word-count heuristic for token estimation.
   * @param text The text to estimate.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
