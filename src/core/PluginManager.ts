// Plugin system for Nezha - allows extending functionality via plugins

import { logger } from '../utils/logger.js';

export interface TaskContext {
  taskId: string;
  title: string;
  description?: string;
  status: string;
  result?: string;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
}

export interface WebhookContext {
  path: string;
  payload: unknown;
  headers: Record<string, string | string[] | undefined>;
  timestamp: Date;
  source: string;
}

export interface CommitContext {
  commitHash: string;
  message: string;
  files: string[];
  author: string;
  timestamp: Date;
}

export interface NextStepSuggestion {
  type: 'task' | 'commit' | 'review' | 'test' | 'refactor' | 'docs';
  priority: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  action?: string;
}

export interface PluginHooks {
  beforeTask?: (context: TaskContext) => Promise<void> | void;
  afterTask?: (context: TaskContext) => Promise<void> | void;
  onError?: (context: TaskContext, error: Error) => Promise<void> | void;
  onStartup?: () => Promise<void> | void;
  onShutdown?: () => Promise<void> | void;
  onHeartbeat?: () => Promise<void> | void;
  onWebhook?: (context: WebhookContext) => Promise<void> | void;
  onWake?: (context: WebhookContext & { message?: string }) => Promise<void> | void;
  onWebhookTask?: (context: WebhookContext, task: { id: string }) => Promise<void> | void;
  afterCommit?: (context: CommitContext, suggestions: NextStepSuggestion[]) => Promise<void> | void;
  afterTaskWithChanges?: (
    context: TaskContext,
    suggestions: NextStepSuggestion[]
  ) => Promise<void> | void;
}

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  hooks: PluginHooks;
  config?: Record<string, unknown>;
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private taskContexts: Map<string, TaskContext> = new Map();

  registerPlugin(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      logger.warn(`Plugin ${plugin.name} already registered, skipping`);
      return;
    }

    this.plugins.set(plugin.name, plugin);
    logger.info(`Plugin registered: ${plugin.name} v${plugin.version}`);
  }

  unregisterPlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      this.plugins.delete(name);
      logger.info(`Plugin unregistered: ${name}`);
      return true;
    }
    return false;
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  // Task lifecycle hooks
  async executeBeforeTask(context: TaskContext): Promise<void> {
    this.taskContexts.set(context.taskId, context);

    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.beforeTask?.(context);
      } catch (error) {
        logger.error(`Plugin ${plugin.name} beforeTask error:`, error);
      }
    }
  }

  async executeAfterTask(context: TaskContext): Promise<void> {
    const stored = this.taskContexts.get(context.taskId);
    const fullContext = { ...stored, ...context, endTime: new Date() };

    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.afterTask?.(fullContext);
      } catch (error) {
        logger.error(`Plugin ${plugin.name} afterTask error:`, error);
      }
    }

    this.taskContexts.delete(context.taskId);
  }

  async executeAfterTaskWithChanges(
    context: TaskContext,
    suggestions: NextStepSuggestion[] = []
  ): Promise<void> {
    const stored = this.taskContexts.get(context.taskId);
    const fullContext = { ...stored, ...context, endTime: new Date() };

    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.afterTaskWithChanges?.(fullContext, suggestions);
      } catch (error) {
        logger.error(`Plugin ${plugin.name} afterTaskWithChanges error:`, error);
      }
    }
  }

  async executeOnError(context: TaskContext, error: Error): Promise<void> {
    const stored = this.taskContexts.get(context.taskId);
    const fullContext = { ...stored, ...context, error: error.message, endTime: new Date() };

    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.onError?.(fullContext, error);
      } catch (err) {
        logger.error(`Plugin ${plugin.name} onError error:`, err);
      }
    }
  }

  // System lifecycle hooks
  async executeOnStartup(): Promise<void> {
    logger.info('Executing onStartup hooks...');
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.onStartup?.();
      } catch (error) {
        logger.error(`Plugin ${plugin.name} onStartup error:`, error);
      }
    }
  }

  async executeOnShutdown(): Promise<void> {
    logger.info('Executing onShutdown hooks...');
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.onShutdown?.();
      } catch (error) {
        logger.error(`Plugin ${plugin.name} onShutdown error:`, error);
      }
    }
  }

  async executeOnHeartbeat(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.onHeartbeat?.();
      } catch (error) {
        logger.error(`Plugin ${plugin.name} onHeartbeat error:`, error);
      }
    }
  }

  async executeOnWebhook(context: WebhookContext): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.onWebhook?.(context);
      } catch (error) {
        logger.error(`Plugin ${plugin.name} onWebhook error:`, error);
      }
    }
  }

  async executeOnWake(context: WebhookContext & { message?: string }): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.onWake?.(context);
      } catch (error) {
        logger.error(`Plugin ${plugin.name} onWake error:`, error);
      }
    }
  }

  async executeOnWebhookTask(context: WebhookContext, task: { id: string }): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.hooks.onWebhookTask?.(context, task);
      } catch (error) {
        logger.error(`Plugin ${plugin.name} onWebhookTask error:`, error);
      }
    }
  }
}

// Global plugin manager instance
let pluginManagerInstance: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager();
  }
  return pluginManagerInstance;
}
