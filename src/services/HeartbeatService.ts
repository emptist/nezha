import { Scheduler } from '../core/Scheduler.js';
import { UnifiedAgent, CliAgent, type UnifiedAgentConfig } from '../core/UnifiedAgent.js';
import { type StreamingCallback } from '../core/transports/index.js';
import { MemoryService } from '../core/Memory.js';
import { DATABASE_TABLES, TASK_STATUS, MEMORY_CONFIG } from '../config/constants.js';
import { Config } from '../config/Config.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import { waitForever } from '../utils/wait.js';
import {
  createEmbeddingProvider,
  EmbeddingProvider,
  EmbeddingConfig,
} from '../services/embedding/index.js';
import { logger } from '../utils/logger.js';
import { DailyMemoryService, memory_save } from './DailyMemory.js';
import { SelfImprovementService, getSelfImprovement } from './SelfImprovementService.js';
import { GitAutoCommitPlugin } from '../plugins/index.js';
import { CheckpointService } from './CheckpointService.js';
import {
  getEncryptionService,
  containsSensitiveData,
  encryptSensitiveFields,
} from './EncryptionService.js';
import { createStandardMetrics } from './MetricsService.js';
import { getPluginManager, type TaskContext } from '../core/PluginManager.js';
import { NotificationPlugin, LoggingPlugin } from '../plugins/index.js';
import { WebhookService, createWebhookConfigFromEnv } from './WebhookService.js';

export type AgentTransportMode = 'http' | 'cli';

const standardMetrics = createStandardMetrics();
const pluginManager = getPluginManager();
const webhookService = new WebhookService(createWebhookConfigFromEnv());

export interface HeartbeatServiceConfig {
  heartbeatIntervalMs?: number;
  workspaceDir?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  embedding?: EmbeddingConfig;
  checkpointIntervalMs?: number;
  agent?: {
    mode?: AgentTransportMode;
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    serverUrl?: string;
    enableLogging?: boolean;
    logDir?: string;
  };
  plugins?: {
    logging?: boolean;
    notification?: {
      enabled?: boolean;
      webhookUrl?: string;
      onTaskStart?: boolean;
      onTaskComplete?: boolean;
      onTaskError?: boolean;
    };
    gitAutoCommit?: {
      autoPush?: boolean;
      commitMessagePrefix?: string;
    };
  };
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
  private readonly agent: UnifiedAgent;
  private readonly memory: MemoryService;
  private readonly dailyMemory: DailyMemoryService;
  private readonly selfImprovement: SelfImprovementService;
  private checkpointService?: CheckpointService;
  private readonly workspaceDir: string;
  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly heartbeatIntervalMs: number;
  private readonly checkpointIntervalMs: number;
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
  private memoryCompactionTimer: ReturnType<typeof setInterval> | null = null;
  private checkpointTimer: ReturnType<typeof setInterval> | null = null;
  private readonly memoryCleanupIntervalMs: number;
  private readonly memoryCompactionIntervalMs: number;
  private readonly defaultMaxRetries: number;
  private readonly defaultRetryDelayMs: number;
  private readonly transportMode: AgentTransportMode;

  setCheckpointService(service: CheckpointService): void {
    this.checkpointService = service;
  }

  constructor(
    private readonly db: DatabaseClient,
    config?: HeartbeatServiceConfig,
    scheduler?: Scheduler
  ) {
    this.scheduler = scheduler ?? new Scheduler(db, config?.heartbeatIntervalMs);
    this.transportMode = config?.agent?.mode ?? 'http';

    const agentConfig: UnifiedAgentConfig = {
      mode: this.transportMode,
      timeout: config?.agent?.timeout,
      maxRetries: config?.agent?.maxRetries,
      retryDelay: config?.agent?.retryDelay,
      serverUrl: config?.agent?.serverUrl,
      enableLogging: config?.agent?.enableLogging ?? true,
      logDir: config?.agent?.logDir,
    };

    if (this.transportMode === 'cli') {
      this.agent = new CliAgent(agentConfig);
    } else {
      this.agent = new UnifiedAgent(agentConfig);
    }

    const taskConfig = Config.getInstance().getTaskConfig();
    this.defaultMaxRetries = config?.agent?.maxRetries ?? taskConfig.maxRetries;
    this.defaultRetryDelayMs = config?.agent?.retryDelay ?? taskConfig.retryDelayMs;

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

    this.initializePlugins(config?.plugins);
    this.heartbeatIntervalMs = config?.heartbeatIntervalMs ?? 60000;
    this.memoryCleanupIntervalMs = MEMORY_CONFIG.DEFAULT_CLEANUP_INTERVAL_MS;
    this.memoryCompactionIntervalMs = MEMORY_CONFIG.DEFAULT_COMPACTION_INTERVAL_MS;
    this.checkpointIntervalMs = config?.checkpointIntervalMs ?? 300000;

    logger.info(`HeartbeatService initialized with ${this.transportMode} transport mode`);

    this.scheduler.onTaskReady = this.executeTask.bind(this);
  }

  private initializePlugins(config?: HeartbeatServiceConfig['plugins']): void {
    if (config?.logging !== false) {
      pluginManager.registerPlugin(new LoggingPlugin());
    }

    if (config?.notification?.enabled) {
      pluginManager.registerPlugin(
        new NotificationPlugin({
          webhookUrl: config.notification.webhookUrl,
          onTaskStart: config.notification.onTaskStart,
          onTaskComplete: config.notification.onTaskComplete,
          onTaskError: config.notification.onTaskError,
        })
      );
    }

    pluginManager.registerPlugin(
      new GitAutoCommitPlugin({
        autoPush: config?.gitAutoCommit?.autoPush ?? true,
        commitMessagePrefix: config?.gitAutoCommit?.commitMessagePrefix ?? 'Task completed:',
      })
    );

    if (pluginManager.listPlugins().length > 0) {
      logger.info(
        `Loaded ${pluginManager.listPlugins().length} plugin(s): ${pluginManager.listPlugins().join(', ')}`
      );
    }
  }

  async start(): Promise<void> {
    logger.info('Starting HeartbeatService...');
    this.abortController = new AbortController();

    this.startMemoryCleanup();
    this.startMemoryCompaction();
    this.startCheckpointTimer();

    // Load checkpoint state and reset orphaned RUNNING tasks
    if (this.checkpointService) {
      const savedState = await this.checkpointService.loadState();
      if (savedState) {
        logger.info(`Resuming from checkpoint (saved: ${savedState.savedAt})`);
        this.stats = { ...this.stats, ...savedState.stats };
        logger.info(`Restored stats: ${this.stats.tasksExecuted} tasks executed`);
      }
      await this.checkpointService.resetRunningTasks(this.db);
    }

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

  private startMemoryCompaction(): void {
    logger.info(`Starting memory compaction (interval: ${this.memoryCompactionIntervalMs}ms)`);
    this.memoryCompactionTimer = setInterval(async () => {
      try {
        const result = await this.memory.compactMemories(MEMORY_CONFIG.DEFAULT_MAX_MEMORIES);
        if (result.archived > 0 || result.deleted > 0) {
          logger.info(
            `Memory compaction: archived ${result.archived}, deleted ${result.deleted}, total ${result.totalAfter}`
          );
        }
      } catch (error) {
        logger.error('Memory compaction failed:', error);
      }
    }, this.memoryCompactionIntervalMs);
  }

  private startCheckpointTimer(): void {
    if (!this.checkpointService) {
      logger.debug('Checkpoint service not configured, skipping periodic saves');
      return;
    }

    logger.info(`Starting checkpoint timer (interval: ${this.checkpointIntervalMs}ms)`);
    this.checkpointTimer = setInterval(async () => {
      try {
        this.checkpointService!.updateStats(this.stats);
        await this.checkpointService!.saveState();
      } catch (error) {
        logger.error('Checkpoint save failed:', error);
      }
    }, this.checkpointIntervalMs);
  }

  private async runContinuousLoop(): Promise<void> {
    while (!this.abortController?.signal.aborted) {
      try {
        await this.scheduler.start();
        logger.info('HeartbeatService running');

        await Promise.race([this.scheduler.waitUntilStopped(), this.waitForAbort()]);

        if (this.abortController?.signal.aborted) {
          break;
        }

        if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.stats.reconnectAttempts++;
          logger.info(
            `Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
          );

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

    return new Promise<void>(resolve => {
      this.abortController!.signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }

  async stop(): Promise<void> {
    logger.info('Stopping HeartbeatService...');

    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
      this.memoryCleanupTimer = null;
    }

    if (this.memoryCompactionTimer) {
      clearInterval(this.memoryCompactionTimer);
      this.memoryCompactionTimer = null;
    }

    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }

    // Save final checkpoint on shutdown
    if (this.checkpointService) {
      this.checkpointService.updateStats(this.stats);
      await this.checkpointService.saveState();
    }

    this.abortController?.abort();

    await this.scheduler.stop();

    await this.db.close();

    logger.info('HeartbeatService stopped');
  }

  async executeTask(
    taskId: string,
    title: string,
    description?: string,
    retryCount: number = 0,
    maxRetries: number = this.defaultMaxRetries,
    timeoutSeconds: number = 300
  ): Promise<void> {
    this.stats.tasksExecuted++;
    standardMetrics.activeTasks.inc(1);

    const startTime = Date.now();
    const taskContext: TaskContext = {
      taskId,
      title,
      description,
      status: 'RUNNING',
      startTime: new Date(startTime),
      metadata: { retryCount, maxRetries, timeoutSeconds },
    };

    await pluginManager.executeBeforeTask(taskContext);

    logger.info(`Executing task: ${title} (attempt ${retryCount + 1}/${maxRetries})`);

    try {
      const result = await this.agent.executeTask(description || title);

      const durationSeconds = (Date.now() - startTime) / 1000;
      standardMetrics.taskDurationSeconds.observe(durationSeconds);
      standardMetrics.activeTasks.dec(1);

      const tableName = DATABASE_TABLES.TASKS;

      if (result.success) {
        logger.info(`Task completed successfully`);

        const resultData = { message: result.message };

        if (containsSensitiveData(resultData as Record<string, unknown>)) {
          const encryption = getEncryptionService();
          if (encryption.isInitialized()) {
            const encrypted = encryptSensitiveFields(
              resultData as Record<string, unknown>,
              encryption
            );
            await this.db.query(
              `UPDATE ${tableName} SET status = $1, result = $2, encrypted_result = $3, encrypted_at = NOW(), retry_count = 0, next_retry_at = NULL WHERE id = $4`,
              [
                TASK_STATUS.COMPLETED,
                JSON.stringify({ message: result.message }),
                JSON.stringify(encrypted),
                taskId,
              ]
            );
          } else {
            await this.db.query(
              `UPDATE ${tableName} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0, next_retry_at = NULL WHERE id = $3`,
              [TASK_STATUS.COMPLETED, JSON.stringify(resultData), taskId]
            );
          }
        } else {
          await this.db.query(
            `UPDATE ${tableName} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0, next_retry_at = NULL WHERE id = $3`,
            [TASK_STATUS.COMPLETED, JSON.stringify(resultData), taskId]
          );
        }

        await this.db.query(
          `INSERT INTO task_audit_log (task_id, task_title, previous_status, new_status, reason, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            taskId,
            title,
            TASK_STATUS.RUNNING,
            TASK_STATUS.COMPLETED,
            'Task completed successfully',
            JSON.stringify({ retryCount, maxRetries }),
          ]
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

        await pluginManager.executeAfterTask({
          ...taskContext,
          status: TASK_STATUS.COMPLETED,
          result: result.message,
          endTime: new Date(),
        });

        webhookService.sendTaskCompleted(taskId, title, description, result.message || 'Completed');

        await this.runReflection(title, result.message || 'Completed');

        return;
      }

      this.stats.tasksFailed++;

      await pluginManager.executeAfterTask({
        ...taskContext,
        status: TASK_STATUS.FAILED,
        error: result.message,
        endTime: new Date(),
      });

      logger.error(`Task failed (attempt ${retryCount + 1}/${maxRetries}):`, result.message);
      this.lastError = result.message || 'Unknown error';

      if (retryCount + 1 >= maxRetries) {
        webhookService.sendTaskFailed(
          taskId,
          title,
          description,
          result.message || 'Unknown error'
        );
        await this.moveToDeadLetter(
          taskId,
          title,
          description,
          result.message || 'Unknown error',
          retryCount,
          maxRetries
        );
        return;
      }

      const delayMs = Math.min(
        this.defaultRetryDelayMs * Math.pow(2, retryCount),
        this.defaultRetryDelayMs * 10 // max 10x the base delay
      );
      const nextRetryAt = new Date(Date.now() + delayMs);

      logger.info(
        `Scheduling retry ${retryCount + 2}/${maxRetries} at ${nextRetryAt.toISOString()} (delay: ${delayMs / 1000}s)`
      );

      await this.db.query(
        `UPDATE ${tableName} SET status = $1, retry_count = $2, next_retry_at = $3, error = $4, updated_at = NOW() WHERE id = $5`,
        [TASK_STATUS.PENDING, retryCount + 1, nextRetryAt, result.message, taskId]
      );
    } catch (error) {
      standardMetrics.activeTasks.dec(1);
      await pluginManager.executeOnError(
        taskContext,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  private async moveToDeadLetter(
    taskId: string,
    title: string,
    description: string | undefined,
    error: string,
    retryCount: number,
    maxRetries: number
  ): Promise<void> {
    logger.error(`Task failed after ${maxRetries} attempts, moving to dead letter queue`);

    const tableName = DATABASE_TABLES.TASKS;
    await this.db.query(
      `UPDATE ${tableName} SET status = $1, error = $2, retry_count = $3 WHERE id = $4`,
      [TASK_STATUS.FAILED, `Max retries (${maxRetries}) exceeded: ${error}`, retryCount, taskId]
    );

    await this.db.query(
      `INSERT INTO dead_letter_queue (original_task_id, title, description, error_message, retry_count, max_retries)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [taskId, title, description || '', error, retryCount, maxRetries]
    );

    await this.db.query(
      `INSERT INTO task_audit_log (task_id, task_title, previous_status, new_status, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        taskId,
        title,
        TASK_STATUS.RUNNING,
        TASK_STATUS.FAILED,
        `Max retries (${maxRetries}) exceeded: ${error}`,
        JSON.stringify({ retryCount, maxRetries, movedToDLQ: true }),
      ]
    );

    this.stats.tasksFailed++;
  }

  private async runReflection(taskTitle: string, taskResult: string): Promise<void> {
    try {
      const reflectionPrompt = await this.selfImprovement.getReflectionPrompt(
        taskTitle,
        taskResult
      );

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

  getTransportMode(): AgentTransportMode {
    return this.transportMode;
  }

  isStreamingSupported(): boolean {
    return this.transportMode === 'cli';
  }

  async executeTaskStreaming(
    taskId: string,
    title: string,
    description: string | undefined,
    onChunk: StreamingCallback,
    retryCount: number = 0,
    maxRetries: number = this.defaultMaxRetries,
    timeoutSeconds: number = 300
  ): Promise<void> {
    if (!this.isStreamingSupported()) {
      throw new Error('Streaming is only supported in CLI transport mode');
    }

    this.stats.tasksExecuted++;
    standardMetrics.activeTasks.inc(1);

    const startTime = Date.now();
    const taskContext: TaskContext = {
      taskId,
      title,
      description,
      status: 'RUNNING',
      startTime: new Date(startTime),
      metadata: { retryCount, maxRetries, timeoutSeconds, streaming: true },
    };

    await pluginManager.executeBeforeTask(taskContext);

    logger.info(
      `Executing task with streaming: ${title} (attempt ${retryCount + 1}/${maxRetries})`
    );

    try {
      const result = await (this.agent as UnifiedAgent).executeTaskStreaming(
        description || title,
        onChunk
      );

      const durationSeconds = (Date.now() - startTime) / 1000;
      standardMetrics.taskDurationSeconds.observe(durationSeconds);
      standardMetrics.activeTasks.dec(1);

      const tableName = DATABASE_TABLES.TASKS;
      const resultMessage = result.message || result.output || '';

      if (result.success) {
        logger.info(`Task completed successfully`);

        const resultData = { message: resultMessage };

        if (containsSensitiveData(resultData as Record<string, unknown>)) {
          const encryption = getEncryptionService();
          if (encryption.isInitialized()) {
            const encrypted = encryptSensitiveFields(
              resultData as Record<string, unknown>,
              encryption
            );
            await this.db.query(
              `UPDATE ${tableName} SET status = $1, result = $2, encrypted_result = $3, encrypted_at = NOW(), retry_count = 0, next_retry_at = NULL WHERE id = $4`,
              [
                TASK_STATUS.COMPLETED,
                JSON.stringify({ message: resultMessage }),
                JSON.stringify(encrypted),
                taskId,
              ]
            );
          } else {
            await this.db.query(
              `UPDATE ${tableName} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0, next_retry_at = NULL WHERE id = $3`,
              [TASK_STATUS.COMPLETED, JSON.stringify(resultData), taskId]
            );
          }
        } else {
          await this.db.query(
            `UPDATE ${tableName} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0, next_retry_at = NULL WHERE id = $3`,
            [TASK_STATUS.COMPLETED, JSON.stringify(resultData), taskId]
          );
        }

        await this.db.query(
          `INSERT INTO task_audit_log (task_id, task_title, previous_status, new_status, reason, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            taskId,
            title,
            TASK_STATUS.RUNNING,
            TASK_STATUS.COMPLETED,
            'Task completed successfully',
            JSON.stringify({ retryCount, maxRetries, streaming: true }),
          ]
        );

        await this.memory.save({
          id: crypto.randomUUID(),
          projectId: undefined,
          content: `Task: ${title}\nResult: ${resultMessage}`,
          metadata: { type: 'task_result', success: true, streaming: true },
        });

        await this.dailyMemory.save({
          task: title,
          result: resultMessage || 'Completed',
        });

        this.stats.tasksSucceeded++;

        await pluginManager.executeAfterTask({
          ...taskContext,
          status: TASK_STATUS.COMPLETED,
          result: resultMessage,
          endTime: new Date(),
        });

        webhookService.sendTaskCompleted(taskId, title, description, resultMessage || 'Completed');

        await this.runReflection(title, resultMessage || 'Completed');

        return;
      }

      this.stats.tasksFailed++;

      await pluginManager.executeAfterTask({
        ...taskContext,
        status: TASK_STATUS.FAILED,
        error: resultMessage,
        endTime: new Date(),
      });

      logger.error(`Task failed (attempt ${retryCount + 1}/${maxRetries}):`, resultMessage);
      this.lastError = resultMessage || 'Unknown error';

      if (retryCount + 1 >= maxRetries) {
        webhookService.sendTaskFailed(taskId, title, description, resultMessage || 'Unknown error');
        await this.moveToDeadLetter(
          taskId,
          title,
          description,
          resultMessage || 'Unknown error',
          retryCount,
          maxRetries
        );
        return;
      }

      const delayMs = Math.min(
        this.defaultRetryDelayMs * Math.pow(2, retryCount),
        this.defaultRetryDelayMs * 10
      );
      const nextRetryAt = new Date(Date.now() + delayMs);

      logger.info(
        `Scheduling retry ${retryCount + 2}/${maxRetries} at ${nextRetryAt.toISOString()} (delay: ${delayMs / 1000}s)`
      );

      await this.db.query(
        `UPDATE ${tableName} SET status = $1, retry_count = $2, next_retry_at = $3, error = $4, updated_at = NOW() WHERE id = $5`,
        [TASK_STATUS.PENDING, retryCount + 1, nextRetryAt, resultMessage, taskId]
      );
    } catch (error) {
      standardMetrics.activeTasks.dec(1);
      await pluginManager.executeOnError(
        taskContext,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  async getTaskResult(
    taskId: string,
    userRole?: string
  ): Promise<{ result?: unknown; encrypted: boolean; accessDenied?: boolean }> {
    const tableName = DATABASE_TABLES.TASKS;

    const taskResult = await this.db.query<{
      id: string;
      result: string;
      encrypted_result: string | null;
      encrypted_at: Date | null;
    }>(`SELECT id, result, encrypted_result, encrypted_at FROM ${tableName} WHERE id = $1`, [
      taskId,
    ]);

    if (taskResult.rows.length === 0) {
      return { result: undefined, accessDenied: true, encrypted: false };
    }

    const task = taskResult.rows[0];

    if (!task.encrypted_result) {
      return { result: task.result ? JSON.parse(task.result) : undefined, encrypted: false };
    }

    if (userRole !== 'admin' && userRole !== 'superadmin') {
      return { encrypted: true, accessDenied: true };
    }

    const encryption = getEncryptionService();
    if (!encryption.isInitialized()) {
      logger.warn('Encryption not initialized, cannot decrypt');
      return { encrypted: true, accessDenied: true };
    }

    try {
      const encryptedObj = JSON.parse(task.encrypted_result);
      const decrypted = encryption.decryptString(encryptedObj);
      return { result: JSON.parse(decrypted), encrypted: true };
    } catch (error) {
      logger.error('Failed to decrypt task result:', error);
      return { encrypted: true, accessDenied: true };
    }
  }
}
