import { Plugin, TaskContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';

export interface ReflectionConfig {
  reflectOnComplete?: boolean;
  reflectOnFail?: boolean;
  minDurationForReflection?: number;
  createIssueOnPattern?: boolean;
}

interface ReflectionResult {
  success: boolean;
  learning?: string;
  issue?: string;
}

export class ReflectionPlugin implements Plugin {
  name = 'reflection';
  version = '1.0.0';
  description = 'Triggers automatic reflection after task completion';
  config: Required<ReflectionConfig>;

  constructor(config: ReflectionConfig = {}) {
    this.config = {
      reflectOnComplete: config.reflectOnComplete ?? true,
      reflectOnFail: config.reflectOnFail ?? true,
      minDurationForReflection: config.minDurationForReflection ?? 10000,
      createIssueOnPattern: config.createIssueOnPattern ?? true,
    };
  }

  hooks = {
    afterTask: async (context: TaskContext) => {
      if (!this.shouldReflect(context)) return;

      const reflection = await this.reflect(context);

      if (reflection.learning) {
        logger.info(`[Reflection] ${context.taskId}: ${reflection.learning}`);
      }

      if (reflection.issue) {
        logger.warn(`[Reflection] Issue discovered: ${reflection.issue}`);
      }
    },

    onError: async (context: TaskContext, error: Error) => {
      if (!this.config.reflectOnFail) return;

      const reflection = await this.reflectOnError(context, error);

      if (reflection.issue) {
        logger.warn(`[Reflection] Error pattern detected: ${reflection.issue}`);
      }
    },
  };

  private shouldReflect(context: TaskContext): boolean {
    if (context.status === 'COMPLETED' && !this.config.reflectOnComplete) return false;
    if (context.status === 'FAILED' && !this.config.reflectOnFail) return false;

    if (context.startTime && context.endTime) {
      const duration = context.endTime.getTime() - context.startTime.getTime();
      return duration >= this.config.minDurationForReflection;
    }

    return true;
  }

  private async reflect(context: TaskContext): Promise<ReflectionResult> {
    const result: ReflectionResult = { success: true };

    if (context.result) {
      if (typeof context.result === 'string' && context.result.includes('already')) {
        result.learning = `Task "${context.title}" was already completed - system working as intended`;
      }

      if (typeof context.result === 'object' && context.result !== null) {
        const res = context.result as Record<string, unknown>;
        if (res.noChangesNeeded === true) {
          result.learning = `Task "${context.title}" found no changes needed - existing implementation adequate`;
        }
      }
    }

    if (context.title.toLowerCase().includes('fix') && context.status === 'COMPLETED') {
      result.learning = `Fixed issue successfully - remember pattern for future similar issues`;
    }

    return result;
  }

  private async reflectOnError(context: TaskContext, error: Error): Promise<ReflectionResult> {
    const result: ReflectionResult = { success: false };

    if (error.message.includes('ECONNREFUSED') || error.message.includes('connection')) {
      result.issue = `Connection error in ${context.title} - may need retry logic or service check`;
    }

    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      result.issue = `Timeout error in ${context.title} - may need increased timeout or optimization`;
    }

    if (error.message.includes('ENOENT') || error.message.includes('not found')) {
      result.issue = `Resource not found in ${context.title} - check paths and dependencies`;
    }

    return result;
  }
}
