/**
 * Multi Vibe — Memory Type Definitions
 * For BridgeMemory knowledge graph (local Markdown files)
 */

/** Unique identifier for a memory entry */
export type MemoryId = string;

/** Memory entry tags for categorization */
export type MemoryTag = string;

/**
 * A single memory entry — corresponds to one Markdown file
 * in the project's .multivibe/memory/ directory.
 */
export interface MemoryEntry {
  /** Unique entry identifier */
  id: MemoryId;
  /** Entry title (from Markdown H1 or filename) */
  title: string;
  /** Full Markdown content */
  content: string;
  /** Categorization tags */
  tags: MemoryTag[];
  /** Links to other memory entries */
  links: MemoryId[];
  /** Who created this entry (user or agent ID) */
  author: string;
  /** When the entry was created */
  createdAt: Date;
  /** When the entry was last modified */
  updatedAt: Date;
  /** Source session or swarm that created this */
  source: string | null;
  /** File path relative to .multivibe/memory/ */
  filePath: string;
}

/** Knowledge graph edge (link between entries) */
export interface MemoryLink {
  /** Source entry ID */
  from: MemoryId;
  /** Target entry ID */
  to: MemoryId;
}

/** Knowledge graph state */
export interface KnowledgeGraph {
  /** All memory entries */
  entries: MemoryEntry[];
  /** All links between entries */
  links: MemoryLink[];
}

/** Search result */
export interface MemorySearchResult {
  entry: MemoryEntry;
  /** Match score (0-1) */
  score: number;
  /** Matched text snippet */
  snippet: string;
}
