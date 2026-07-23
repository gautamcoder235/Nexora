import { GoalGraph } from './GoalGraph';
import { ExecutionGraph } from './ExecutionGraph';
import { AllocatedContext } from '../context/TokenBudgetManager';

export type TaskComplexity = 'trivial' | 'small' | 'medium' | 'large' | 'huge';

export interface PlannerDecision {
  goalGraph: GoalGraph;
  executionGraph: ExecutionGraph;
  roles: string[];
  requiresApproval: boolean;
  complexity: TaskComplexity;
}

/**
 * Intent analysis and plan generation engine.
 */
export class PlannerEngine {
  /**
   * Plans the execution based on user intent and context.
   * @param intent The user intent.
   * @param context The allocated context.
   */
  async plan(intent: string, context: AllocatedContext): Promise<PlannerDecision> {
    const complexity = this.classifyComplexity(intent);
    const goalGraph = new GoalGraph();
    // In a real implementation, the LLM would generate the goals
    const executionGraph = ExecutionGraph.fromGoals(goalGraph.serialize());
    
    return {
      goalGraph,
      executionGraph,
      roles: ['scout', 'builder'],
      requiresApproval: ['large', 'huge'].includes(complexity),
      complexity
    };
  }

  /**
   * Classifies task complexity based on intent string.
   * @param intent The intent to classify.
   */
  classifyComplexity(intent: string): TaskComplexity {
    const length = intent.length;
    if (length < 50) return 'trivial';
    if (length < 200) return 'small';
    if (length < 1000) return 'medium';
    if (length < 3000) return 'large';
    return 'huge';
  }
}
