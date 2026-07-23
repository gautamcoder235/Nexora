import { GoalNode } from './GoalGraph';

export type ExecutionNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';

export interface ExecutionNode {
  id: string;
  goalId: string;
  status: ExecutionNodeStatus;
  assignedRole?: string;
  dependencies: string[];
}

/**
 * DAG-based execution graph.
 */
export class ExecutionGraph {
  private nodes: Map<string, ExecutionNode> = new Map();

  addNode(node: ExecutionNode): void {
    this.nodes.set(node.id, node);
  }

  getNode(nodeId: string): ExecutionNode | undefined {
    return this.nodes.get(nodeId);
  }

  getReadyNodes(): ExecutionNode[] {
    return Array.from(this.nodes.values()).filter(n => {
      if (n.status !== 'pending') return false;
      return n.dependencies.every(depId => {
        const dep = this.nodes.get(depId);
        return dep && dep.status === 'completed';
      });
    });
  }

  updateStatus(nodeId: string, status: ExecutionNodeStatus): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
    }
  }

  isComplete(): boolean {
    return Array.from(this.nodes.values()).every(n => n.status === 'completed');
  }

  getProgress(): { completed: number, total: number, failed: number } {
    let completed = 0;
    let failed = 0;
    const total = this.nodes.size;
    
    for (const node of this.nodes.values()) {
      if (node.status === 'completed') completed++;
      if (node.status === 'failed') failed++;
    }
    
    return { completed, total, failed };
  }

  serialize(): ExecutionNode[] {
    return Array.from(this.nodes.values());
  }

  static fromGoals(goals: GoalNode[]): ExecutionGraph {
    const graph = new ExecutionGraph();
    goals.forEach(g => {
      graph.addNode({
        id: `exec_${g.id}`,
        goalId: g.id,
        status: 'pending',
        dependencies: g.dependencies.map(d => `exec_${d}`)
      });
    });
    return graph;
  }
}
