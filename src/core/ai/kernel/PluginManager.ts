// ─── Nexora AI Runtime Kernel — Plugin Manager ────────────────────────────
// Extension point system for tool packs, provider packs, memory packs,
// and planner packs. Future-proofs the platform without baking everything
// into core.

import { EventBus } from '../../events';

// ─── Plugin Types ─────────────────────────────────────────────────────────

/** Lifecycle hooks for an AI runtime plugin. */
export interface AIPluginLifecycle {
  /** Called when the plugin is registered. */
  onRegister?(): void;
  /** Called when the plugin is unregistered. */
  onUnregister?(): void;
  /** Called when the kernel starts a new conversation. */
  onConversationStart?(conversationId: string): void;
  /** Called when a conversation ends. */
  onConversationEnd?(conversationId: string): void;
}

/** Base interface for all AI runtime plugins. */
export interface AIPlugin extends AIPluginLifecycle {
  /** Unique plugin identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Plugin version. */
  version: string;
  /** Plugin category. */
  category: AIPluginCategory;
  /** Human-readable description. */
  description: string;
}

export type AIPluginCategory = 'tools' | 'providers' | 'memory' | 'planner' | 'observer' | 'ui';

// ─── Plugin Manager ──────────────────────────────────────────────────────

/**
 * Manages AI runtime plugin registration and lifecycle.
 * Singleton — use `AIPluginManager.getInstance()`.
 */
export class AIPluginManager {
  private static instance: AIPluginManager | null = null;
  private plugins: Map<string, AIPlugin> = new Map();

  private constructor() {}

  static getInstance(): AIPluginManager {
    if (!AIPluginManager.instance) {
      AIPluginManager.instance = new AIPluginManager();
    }
    return AIPluginManager.instance;
  }

  /** Register a plugin. */
  register(plugin: AIPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[AIPluginManager] Plugin "${plugin.id}" is already registered. Replacing.`);
      this.unregister(plugin.id);
    }

    this.plugins.set(plugin.id, plugin);
    plugin.onRegister?.();

    EventBus.publish('ai:plugin:registered', {
      pluginId: plugin.id,
      category: plugin.category,
      name: plugin.name,
    });
  }

  /** Unregister a plugin by ID. */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.onUnregister?.();
      this.plugins.delete(pluginId);

      EventBus.publish('ai:plugin:unregistered', { pluginId });
    }
  }

  /** Get a registered plugin by ID. */
  get<T extends AIPlugin>(pluginId: string): T | undefined {
    return this.plugins.get(pluginId) as T | undefined;
  }

  /** Get all plugins, optionally filtered by category. */
  getAll(category?: AIPluginCategory): AIPlugin[] {
    const all = Array.from(this.plugins.values());
    return category ? all.filter(p => p.category === category) : all;
  }

  /** Notify all plugins of a conversation start. */
  notifyConversationStart(conversationId: string): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onConversationStart?.(conversationId);
      } catch (err) {
        console.error(`[AIPluginManager] Plugin "${plugin.id}" error on conversation start:`, err);
      }
    }
  }

  /** Notify all plugins of a conversation end. */
  notifyConversationEnd(conversationId: string): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onConversationEnd?.(conversationId);
      } catch (err) {
        console.error(`[AIPluginManager] Plugin "${plugin.id}" error on conversation end:`, err);
      }
    }
  }

  /** Get count of registered plugins. */
  get count(): number {
    return this.plugins.size;
  }

  /** Clear all plugins (for testing). */
  reset(): void {
    for (const plugin of this.plugins.values()) {
      plugin.onUnregister?.();
    }
    this.plugins.clear();
  }
}
