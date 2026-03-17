import { Scheduler } from '../core/Scheduler.js';
import { Agent } from '../core/Agent.js';
import { MemoryService } from '../core/Memory.js';
import { DATABASE_TABLES, TASK_STATUS, MEMORY_CONFIG } from '../config/constants.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import { waitForever } from '../utils/wait.js';
import { createEmbeddingProvider, EmbeddingProvider, EmbeddingConfig } from '../services/embedding/index.js';
import { logger } from '../utils/logger.js';
import { DailyMemoryService, memory_save } from './DailyMemory.js';
import { SelfImprovementService, getSelfImprovement } from './SelfImprovementService.js';
import { CheckpointService } from './CheckpointService.js';

export interface HeartbeatServiceConfig {
  heartbeatIntervalMs?: number;
  workspaceDir?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  embedding?: EmbeddingConfig;
}

export interface HeartbeatHealth {
  isRunning: boolean;
  stats: {
    tasksExecuted: number;
    tasksSucceeded: number;
    tasksFailed: number;
    reconnectAttempts: number;
  };
  lastError: string | null;
}

export class HeartbeatService {
  private readonly scheduler: Scheduler;
  private readonly agent: Agent;
  private readonly memory: MemoryService;
  private readonly dailyMemory: DailyMemoryService;
  private readonly selfImprovement: SelfImprovementService;
  private checkpointService?: CheckpointService;
  private readonly workspaceDir: string;
  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly heartbeatIntervalMs: number;
  private lastError: string | null = null;
  private reconnectAttempts = 0;
  private stats = {
    tasksExecuted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    reconnectAttempts: 0,
  };
  private abortController: AbortController | null = null;
  private memoryCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly memoryCleanupIntervalMs: number;

  setCheckpointService(service: CheckpointService): void {
    this.checkpointService = service;
  }

  constructor(
    private readonly db: DatabaseClient,
    config?: HeartbeatServiceConfig,
    scheduler?: Scheduler
  ) {
    this.scheduler = scheduler ?? new Scheduler(db, config?.heartbeatIntervalMs);
    this.agent = new Agent();
    
    let embeddingProvider: EmbeddingProvider | undefined;
    if (config?.embedding) {
      try {
        embeddingProvider = createEmbeddingProvider(config.embedding);
        logger.info(`Embedding provider initialized: ${config.embedding.provider}`);
      } catch (error) {
        logger.error('Failed to initialize embedding provider:', error);
      }
    }
    
    this.memory = new MemoryService(db, undefined, embeddingProvider);
    this.dailyMemory = new DailyMemoryService();
    this.selfImprovement = getSelfImprovement(db, config?.embedding);
    this.workspaceDir = config?.workspaceDir ?? process.cwd();
    this.autoReconnect = config?.autoReconnect ?? true;
    this.maxReconnectAttempts = config?.maxReconnectAttempts ?? 5;
    this.heartbeatIntervalMs = config?.heartbeatIntervalMs ?? 60000;
    this.memoryCleanupIntervalMs = MEMORY_CONFIG.DEFAULT_CLEANUP_INTERVAL_MS;
    
    // Connect scheduler to task execution
    this.scheduler.onTaskReady = this.executeTask.bind(this);
  }

  async start(): Promise<void> {
    logger.info('Starting HeartbeatService...');
    this.abortController = new AbortController();
    
    this.startMemoryCleanup();
    
    await this.runContinuousLoop();
  }

  private startMemoryCleanup(): void {
    logger.info(`Starting memory cleanup (interval: ${this.memoryCleanupIntervalMs}ms)`);
    this.memoryCleanupTimer = setInterval(async () => {
      try {
        const deleted = await this.memory.deleteOldMemories();
        if (deleted > 0) {
          logger.info(`Cleaned up ${deleted} old memories`);
        }
      } catch (error) {
        logger.error('Memory cleanup failed:', error);
      }
    }, this.memoryCleanupIntervalMs);
  }

  private async runContinuousLoop(): Promise<void> {
    while (!this.abortController?.signal.aborted) {
      try {
        await this.scheduler.start();
        logger.info('HeartbeatService running');
        
        await Promise.race([
          this.scheduler.waitUntilStopped(),
          this.waitForAbort(),
        ]);
        
        if (this.abortController?.signal.aborted) {
          break;
        }
        
        if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.stats.reconnectAttempts++;
          logger.info(`Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          
          const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          continue;
        } else {
          logger.info('Stopping (auto-reconnect disabled or max attempts reached)');
          break;
        }
      } catch (error) {
        logger.error('Error in continuous loop:', error);
        this.lastError = error instanceof Error ? error.message : 'Unknown error';
        
        if (!this.autoReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    logger.info('HeartbeatService stopped');
  }

  private async waitForAbort(): Promise<void> {
    if (!this.abortController) {
      return waitForever();
    }
    
    return new Promise<void>((resolve) => {
      this.abortController!.signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }

  async stop(): Promise<void> {
    logger.info('Stopping HeartbeatService...');
    
    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
      this.memoryCleanupTimer = null;
    }
    
    this.abortController?.abort();
    
    await this.scheduler.stop();
    
    await this.db.close();
    
    logger.info('HeartbeatService stopped');
  }

  async executeTask(taskId: string, title: string, description?: string): Promise<void> {
    const maxRetries = 3;
    const retryDelayMs = 30000;
    
    this.stats.tasksExecuted++;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Executing task: ${title} (attempt ${attempt}/${maxRetries})`);
      
      const result = await this.agent.executeTask(description || title);
      
      const tableName = DATABASE_TABLES.TASKS;
      
      if (result.success) {
        logger.info(`Task completed successfully`);
        
        await this.db.query(
          `UPDATE ${tableName} SET status = $1, result = $2, completed_at = NOW() WHERE id = $3`,
          [TASK_STATUS.COMPLETED, JSON.stringify({ message: result.message }), taskId]
        );
        
        await this.memory.save({
          id: crypto.randomUUID(),
          projectId: undefined,
          content: `Task: ${title}\nResult: ${result.message}`,
          metadata: { type: 'task_result', success: true },
        });

        await this.dailyMemory.save({
          task: title,
          result: result.message || 'Completed',
        });
        
        this.stats.tasksSucceeded++;
        
        // Run reflection for self-improvement
        await this.runReflection(title, result.message || 'Completed');
        
        return;
      } else {
        logger.error(`Task failed (attempt ${attempt}/${maxRetries}):`, result.message);
        this.lastError = result.message || 'Unknown error';
        
        if (attempt < maxRetries) {
          logger.info(`Waiting ${retryDelayMs / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    
    logger.error(`Task failed after ${maxRetries} attempts`);
    const tableName = DATABASE_TABLES.TASKS;
    await this.db.query(
      `UPDATE ${tableName} SET status = $1, error = $2 WHERE id = $3`,
      [TASK_STATUS.FAILED, 'Max retries exceeded', taskId]
    );
    
    this.stats.tasksFailed++;
  }

  private async runReflection(taskTitle: string, taskResult: string): Promise<void> {
    try {
      const reflectionPrompt = await this.selfImprovement.getReflectionPrompt(taskTitle, taskResult);
      
      const reflectionResult = await this.agent.executeTask(reflectionPrompt);
      
      if (reflectionResult.success) {
        logger.debug('Reflection completed for task:', taskTitle);
      } else {
        logger.warn('Reflection failed:', reflectionResult.message);
      }
    } catch (error) {
      logger.warn('Reflection error (non-fatal):', error);
    }
  }

  isRunning(): boolean {
    return this.scheduler.isActive();
  }

  getHealth(): HeartbeatHealth {
    return {
      isRunning: this.isRunning(),
      stats: { ...this.stats },
      lastError: this.lastError,
    };
  }
}
