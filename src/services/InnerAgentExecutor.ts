import { AIProvider, AIProviderFactory } from './ai/index.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';

export interface TaskResult {
  success: boolean;
  message: string;
  output: string;
  durationMs: number;
}

export interface ReflectionResult {
  success: boolean;
  output: string;
}

export class InnerAgentExecutor {
  private readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  static async create(db: DatabaseClient): Promise<InnerAgentExecutor> {
    const provider = await AIProviderFactory.createInnerProvider(db);
    return new InnerAgentExecutor(provider);
  }

  async executeTask(prompt: string, timeoutMs: number = 300000): Promise<TaskResult> {
    const startTime = Date.now();
    try {
      const result = await Promise.race([
        this.provider.complete(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), timeoutMs)
        ),
      ]);

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        message: result.content,
        output: result.content,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: errorMessage,
        output: errorMessage,
        durationMs,
      };
    }
  }

  async runReflection(prompt: string): Promise<ReflectionResult> {
    try {
      const result = await this.provider.complete(prompt);
      return {
        success: true,
        output: result.content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('[InnerAgentExecutor] Reflection failed:', errorMessage);
      return {
        success: false,
        output: errorMessage,
      };
    }
  }
}
