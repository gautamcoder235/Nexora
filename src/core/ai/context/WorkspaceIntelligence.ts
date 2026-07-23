import { invoke } from '@tauri-apps/api/core';
import { EventBus } from '../../events';

/**
 * Extends repository intelligence with symbol indexing and architecture graphs.
 */
export class WorkspaceIntelligence {
  private symbolIndex: Map<string, string[]> = new Map();
  private architectureGraph: Map<string, string[]> = new Map();
  private fileDependencies: Map<string, string[]> = new Map();

  /**
   * Indexes the workspace, maintaining an incremental snapshot.
   * @param rootPath The root directory of the workspace.
   */
  async indexWorkspace(rootPath: string): Promise<void> {
    try {
      const files: string[] = await invoke('list_directory', { path: rootPath });
      for (const file of files) {
        // Incremental logic would go here
        this.architectureGraph.set(file, []);
      }
    } catch (error) {
      console.error('Failed to index workspace', error);
    }
  }

  /**
   * Gets locations for a specific symbol.
   * @param name Symbol name.
   */
  getSymbol(name: string): string[] {
    return this.symbolIndex.get(name) || [];
  }

  /**
   * Gets symbols defined in a file.
   * @param path File path.
   */
  getFileSymbols(path: string): string[] {
    const symbols: string[] = [];
    for (const [symbol, files] of this.symbolIndex.entries()) {
      if (files.includes(path)) {
        symbols.push(symbol);
      }
    }
    return symbols;
  }

  /**
   * Gets dependencies for a file.
   * @param path File path.
   */
  getDependencies(path: string): string[] {
    return this.fileDependencies.get(path) || [];
  }

  /**
   * Gets the architecture graph.
   */
  getArchitectureGraph(): Map<string, string[]> {
    return this.architectureGraph;
  }

  /**
   * Invalidates cached data for a file.
   * @param path File path.
   */
  invalidateFile(path: string): void {
    this.fileDependencies.delete(path);
    this.architectureGraph.delete(path);
    for (const files of this.symbolIndex.values()) {
      const idx = files.indexOf(path);
      if (idx > -1) {
        files.splice(idx, 1);
      }
    }
  }
}
