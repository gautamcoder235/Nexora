import { invoke } from '@tauri-apps/api/core';
import { EventBus } from '../../events';

export type MemoryCategory = 'facts' | 'architecture' | 'decisions' | 'patterns' | 'mistakes' | 'preferences' | 'summaries';

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  tags: string[];
  createdAt: number;
  source: string;
  relevanceScore: number;
}

/**
 * Knowledge-based structured memory engine.
 */
export class MemoryEngine {
  private memories: MemoryEntry[] = [];

  /**
   * Stores a memory entry.
   * @param entry The memory entry to store.
   */
  async store(entry: MemoryEntry): Promise<void> {
    this.memories.push(entry);
    // Integration with .nexora/memory/ goes here
  }

  /**
   * Searches for memories.
   * @param query The search query.
   * @param category Optional category filter.
   */
  async search(query: string, category?: MemoryCategory): Promise<MemoryEntry[]> {
    return this.memories.filter(m => {
      const matchCategory = category ? m.category === category : true;
      const matchQuery = m.content.includes(query) || m.tags.includes(query);
      return matchCategory && matchQuery;
    });
  }

  /**
   * Gets recent memories.
   * @param category The category.
   * @param limit The maximum number to return.
   */
  getRecent(category: MemoryCategory, limit: number): MemoryEntry[] {
    return this.memories
      .filter(m => m.category === category)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * Summarizes memories in a category.
   * @param category The category to summarize.
   */
  async summarize(category: MemoryCategory): Promise<string> {
    const entries = this.getRecent(category, 50);
    return entries.map(e => e.content).join('\n');
  }

  /**
   * Prunes old memories to stay within limit.
   * @param maxEntries Maximum number of entries.
   */
  prune(maxEntries: number): void {
    if (this.memories.length > maxEntries) {
      this.memories.sort((a, b) => b.relevanceScore - a.relevanceScore);
      this.memories = this.memories.slice(0, maxEntries);
    }
  }
}
