/**
 * System resources managed by the budget enforcer.
 */
export type ResourceType = 'pty_sessions' | 'api_calls' | 'background_jobs' | 'tokens_per_turn' | 'cost_per_session';

interface ResourceState {
  current: number;
  max: number;
}

/**
 * Budget enforcement for system resources.
 */
export class ResourceManager {
  private resources: Record<ResourceType, ResourceState> = {
    pty_sessions: { current: 0, max: 4 },
    api_calls: { current: 0, max: 100 },
    background_jobs: { current: 0, max: 10 },
    tokens_per_turn: { current: 0, max: 100000 },
    cost_per_session: { current: 0, max: 5.0 }
  };

  /**
   * Attempts to acquire a certain amount of a resource.
   * @param resource The resource type
   * @param amount The amount to acquire
   * @returns true if successful, false if limit would be exceeded
   */
  public acquire(resource: ResourceType, amount: number): boolean {
    const state = this.resources[resource];
    if (state.current + amount > state.max) {
      return false;
    }
    state.current += amount;
    return true;
  }

  /**
   * Releases a certain amount of a resource.
   * @param resource The resource type
   * @param amount The amount to release
   */
  public release(resource: ResourceType, amount: number): void {
    const state = this.resources[resource];
    state.current = Math.max(0, state.current - amount);
  }

  /**
   * Gets the current usage for a specific resource.
   * @param resource The resource type
   * @returns Current and max values
   */
  public getUsage(resource: ResourceType): { current: number; max: number } {
    return { ...this.resources[resource] };
  }

  /**
   * Gets the usage of all resources.
   * @returns Record of all resource usages
   */
  public getAllUsage(): Record<ResourceType, { current: number; max: number }> {
    return JSON.parse(JSON.stringify(this.resources));
  }

  /**
   * Sets the maximum limit for a resource.
   * @param resource The resource type
   * @param max The new maximum limit
   */
  public setLimit(resource: ResourceType, max: number): void {
    this.resources[resource].max = max;
  }
}
