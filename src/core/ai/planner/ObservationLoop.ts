import { EventBus } from '../../events';
import { ExecutionGraph } from './ExecutionGraph';

export interface Observation {
  timestamp: number;
  type: string;
  data: any;
}

/**
 * Monitors execution and issues corrections.
 */
export class ObservationLoop {
  private active: boolean = false;

  /**
   * Starts the observation loop on the execution graph.
   * @param executionGraph The execution graph to observe.
   * @param maxIterations The maximum iterations to run.
   */
  async observe(executionGraph: ExecutionGraph, maxIterations: number): Promise<Observation[]> {
    this.active = true;
    const observations: Observation[] = [];
    let iterations = 0;

    while (this.active && !executionGraph.isComplete() && iterations < maxIterations) {
      // Logic for watching terminal output and updating graph goes here
      // Subscribing to EventBus, evaluating goals
      iterations++;
      // Dummy yield
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.active = false;
    return observations;
  }

  /**
   * Stops the observation loop.
   */
  stop(): void {
    this.active = false;
  }
}
