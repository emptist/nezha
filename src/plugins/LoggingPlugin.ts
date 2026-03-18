// Logging Plugin - logs all task events to console/file

import { Plugin, TaskContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';

export interface LoggingConfig {
  logTaskStart?: boolean;
  logTaskComplete?: boolean;
  logTaskError?: boolean;
  includeMetadata?: boolean;
}

export class LoggingPlugin implements Plugin {
  name = 'logging';
  version = '1.0.0';
  description = 'Logs all task events';
  config: Record<string, unknown>;

  constructor(config: LoggingConfig = {}) {
    this.config = {
      logTaskStart: config.logTaskStart ?? true,
      logTaskComplete: config.logTaskComplete ?? true,
      logTaskError: config.logTaskError ?? true,
      includeMetadata: config.includeMetadata ?? false,
    };
  }

  hooks = {
    beforeTask: async (context: TaskContext) => {
      if (!this.config.logTaskStart) return;

      logger.info(`[Task] Starting: "${context.title}" (${context.taskId})`);

      if (this.config.includeMetadata && context.metadata) {
        logger.debug(`[Task] Metadata:`, context.metadata);
      }
    },

    afterTask: async (context: TaskContext) => {
      if (!this.config.logTaskComplete) return;

      const duration =
        context.startTime && context.endTime
          ? ` (${(context.endTime.getTime() - context.startTime.getTime()) / 1000}s)`
          : '';

      const statusEmoji = context.status === 'COMPLETED' ? '✅' : '⚠️';
      logger.info(`[Task] ${statusEmoji} "${context.title}"${duration}`);

      if (this.config.includeMetadata && context.metadata) {
        logger.debug(`[Task] Result metadata:`, context.metadata);
      }
    },

    onError: async (context: TaskContext, error: Error) => {
      if (!this.config.logTaskError) return;

      logger.error(`[Task] ❌ "${context.title}" failed:`, error.message);
    },

    onStartup: async () => {
      logger.info('[LoggingPlugin] Task logging plugin initialized');
    },

    onShutdown: async () => {
      logger.info('[LoggingPlugin] Task logging plugin shutting down');
    },
  };
}
