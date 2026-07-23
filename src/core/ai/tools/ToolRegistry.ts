import { ToolDefinition, ToolResult } from '../protocol';
import { CancellationToken } from '../kernel/AIKernel';

/**
 * Context provided to tool executors during execution.
 */
export interface ExecutionContext {
  conversationId: string;
  workspaceId: string;
  workspacePath: string;
  cancellationToken: CancellationToken;
}

/**
 * Function signature for tool executors.
 */
export type ToolExecutor = (args: Record<string, unknown>, context: ExecutionContext) => Promise<ToolResult>;

/**
 * A registered tool containing its definition and executor.
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

/**
 * Registry for managing tool definitions and their executors.
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Registers a new tool in the registry.
   * @param definition Tool definition metadata
   * @param executor Function to execute the tool
   */
  public register(definition: ToolDefinition, executor: ToolExecutor): void {
    this.tools.set(definition.id, { definition, executor });
  }

  /**
   * Unregisters a tool by ID.
   * @param toolId The ID of the tool to remove
   */
  public unregister(toolId: string): void {
    this.tools.delete(toolId);
  }

  /**
   * Gets a tool by ID.
   * @param toolId The ID of the tool
   * @returns The registered tool or undefined if not found
   */
  public get(toolId: string): RegisteredTool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Gets all registered tools.
   * @returns Array of all registered tools
   */
  public getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Gets tools filtered by category.
   * @param category The category to filter by
   * @returns Array of tools in the specified category
   */
  public getByCategory(category: string): RegisteredTool[] {
    return this.getAll().filter(tool => tool.definition.category === category);
  }

  /**
   * Gets only the tool definitions (for sending to LLM).
   * @returns Array of tool definitions
   */
  public getToolDefinitions(): ToolDefinition[] {
    return this.getAll().map(tool => tool.definition);
  }
}
