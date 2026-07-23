export type GoalStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface GoalNode {
  id: string;
  description: string;
  status: GoalStatus;
  dependencies: string[];
}

/**
 * Goal DAG that survives retries.
 */
export class GoalGraph {
  private goals: Map<string, GoalNode> = new Map();

  addGoal(goal: GoalNode): void {
    this.goals.set(goal.id, goal);
  }

  removeGoal(goalId: string): void {
    this.goals.delete(goalId);
  }

  getGoal(goalId: string): GoalNode | undefined {
    return this.goals.get(goalId);
  }

  getRootGoals(): GoalNode[] {
    return Array.from(this.goals.values()).filter(g => g.dependencies.length === 0);
  }

  getChildren(goalId: string): GoalNode[] {
    return Array.from(this.goals.values()).filter(g => g.dependencies.includes(goalId));
  }

  updateStatus(goalId: string, status: GoalStatus): void {
    const goal = this.goals.get(goalId);
    if (goal) {
      goal.status = status;
    }
  }

  isComplete(): boolean {
    return Array.from(this.goals.values()).every(g => g.status === 'completed');
  }

  serialize(): GoalNode[] {
    return Array.from(this.goals.values());
  }

  static deserialize(nodes: GoalNode[]): GoalGraph {
    const graph = new GoalGraph();
    nodes.forEach(n => graph.addGoal(n));
    return graph;
  }
}
