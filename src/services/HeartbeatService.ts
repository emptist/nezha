import { Scheduler } from '../core/Scheduler.js';
import { EventBus } from '../core/EventBus.js';
import { UnifiedAgent, CliAgent, type UnifiedAgentConfig } from '../core/UnifiedAgent.js';
import { type StreamingCallback } from '../core/transports/index.js';
import { MemoryService } from '../core/Memory.js';
import { LearningAnalysisService } from '../core/LearningAnalysis.js';
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
import { DailyMemoryService } from './DailyMemory.js';
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
import { ContextBuilder } from './ContextBuilder.js';
import { EnhancedCircuitBreaker } from '../utils/EnhancedCircuitBreaker.js';
import { TaskWatchdogService, WatchdogEvent } from './TaskWatchdogService.js';
import { FailureAlertService, AlertType, type FailureAlert } from './FailureAlertService.js';
import { LongTaskManager } from './LongTaskManager.js';
import { InterReviewService, type ReviewResult } from './InterReviewService.js';
import { AutoReviewService } from './AutoReviewService.js';

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
    enableMemoryContext?: boolean;
    circuitBreakerThreshold?: number;
    circuitBreakerResetMs?: number;
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
  private readonly learning: LearningAnalysisService;
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
  private insightTimer: ReturnType<typeof setInterval> | null = null;
  private readonly memoryCleanupIntervalMs: number;
  private readonly memoryCompactionIntervalMs: number;
  private readonly defaultMaxRetries: number;
  private readonly defaultRetryDelayMs: number;
  private readonly transportMode: AgentTransportMode;
  private readonly contextBuilder: ContextBuilder;
  private enableMemoryContext: boolean;
  private readonly agentCircuitBreaker: EnhancedCircuitBreaker;
  private isAgentAvailable: boolean = true;
  private readonly insightIntervalMs: number;
  private readonly watchdogService: TaskWatchdogService;
  private readonly alertService: FailureAlertService;
  private readonly longTaskManager: LongTaskManager;
  private readonly interReviewService: InterReviewService;
  private readonly autoReviewService: AutoReviewService;

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
    this.learning = new LearningAnalysisService(db, embeddingProvider);
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
    this.insightIntervalMs = 3600000;
    this.enableMemoryContext = config?.agent?.enableMemoryContext ?? true;

    this.contextBuilder = new ContextBuilder(db, {
      memoryDir: this.workspaceDir + '/.tmp/nezha-memory',
      embedding: config?.embedding,
    });

    this.agentCircuitBreaker = new EnhancedCircuitBreaker({
      failureThreshold: config?.agent?.circuitBreakerThreshold ?? 5,
      resetTimeoutMs: config?.agent?.circuitBreakerResetMs ?? 60000,
      successThreshold: 2,
      onStateChange: (from, to) => {
        logger.warn(`Agent circuit breaker state: ${from} -> ${to}`);
        this.isAgentAvailable = to !== 'open';
      },
    });

    this.watchdogService = new TaskWatchdogService(db);
    this.alertService = new FailureAlertService(db);
    this.longTaskManager = new LongTaskManager(db);

    this.interReviewService = new InterReviewService(db);

    if (typeof this.scheduler.getEventBus === 'function') {
      this.autoReviewService = new AutoReviewService(this.scheduler.getEventBus(), db, {
        enabled: true,
        reviewOnSuccess: true,
        reviewOnFailure: true,
        reviewerId: `nezha-heartbeat-${Date.now()}`,
      });
    } else {
      this.autoReviewService = new AutoReviewService(new EventBus(db), db, {
        enabled: false,
        reviewOnSuccess: false,
        reviewOnFailure: false,
        reviewerId: `nezha-heartbeat-${Date.now()}`,
      });
    }

    this.alertService.setWebhookCallback(async (alert: FailureAlert) => {
      webhookService.sendAlert(alert).catch(err => {
        logger.error('Failed to send alert webhook:', err);
      });
    });

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

    await this.dailyMemory.initialize();
    logger.info('Memory system initialized');

    this.startMemoryCleanup();
    this.startMemoryCompaction();
    this.startCheckpointTimer();
    this.startInsightGeneration();

    this.watchdogService.start();
    this.alertService.start();
    this.longTaskManager.start();
    this.autoReviewService.start();

    this.setupWatchdogListeners();
    this.setupLongTaskListeners();

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

  private startInsightGeneration(): void {
    logger.info(`Starting insight generation (interval: ${this.insightIntervalMs}ms)`);
    this.insightTimer = setInterval(async () => {
      try {
        const insights = await this.learning.autoGenerateInsights();
        if (insights.length > 0) {
          logger.info(`Generated ${insights.length} new insights`);
        }
      } catch (error) {
        logger.error('Insight generation failed:', error);
      }
    }, this.insightIntervalMs);
  }

  private setupWatchdogListeners(): void {
    this.watchdogService.on(WatchdogEvent.TASK_STUCK, async task => {
      logger.warn(`Watchdog detected stuck task: ${task.title} (${task.taskId})`);
      await this.alertService.createAlert(AlertType.STUCK_TASK, `Stuck task: ${task.title}`, {
        taskId: task.taskId,
        metadata: { elapsedMs: Date.now() - task.lastHeartbeat.getTime() },
      });
    });

    this.watchdogService.on(WatchdogEvent.TASK_KILLED, async result => {
      logger.warn(`Watchdog killed task: ${result.taskId} (reason: ${result.reason})`);
      await this.alertService.createAlert(
        AlertType.WATCHDOG_KILL,
        `Watchdog kill: ${result.taskId}`,
        {
          taskId: result.taskId,
          metadata: { reason: result.reason, processId: result.processId },
        }
      );
    });

    this.watchdogService.on(WatchdogEvent.HEARTBEAT_MISSED, async data => {
      logger.debug(`Task approaching timeout: ${data.task.title}`);
    });
  }

  private setupLongTaskListeners(): void {
    this.longTaskManager.on('maxRuntimeExceeded', async task => {
      logger.warn(`Long task exceeded max runtime: ${task.title} (${task.taskId})`);
      await this.alertService.createAlert(
        AlertType.REPEATED_FAILURE,
        `Long task timeout: ${task.title}`,
        {
          taskId: task.taskId,
          metadata: {
            elapsedSeconds: task.elapsedSeconds,
            maxRuntimeSeconds: task.maxRuntimeSeconds,
          },
        }
      );
    });

    this.longTaskManager.on('progressStalled', async data => {
      logger.warn(`Task progress stalled: ${data.task.title} (${data.task.taskId})`);
    });

    this.longTaskManager.on('paused', async data => {
      logger.info(`Long task paused: ${data.taskId} (reason: ${data.reason})`);
    });

    this.longTaskManager.on('resumed', async data => {
      logger.info(`Long task resumed: ${data.taskId}`);
    });
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

    if (this.insightTimer) {
      clearInterval(this.insightTimer);
      this.insightTimer = null;
    }

    this.watchdogService.stop();
    this.alertService.stop();
    this.longTaskManager.stop();
    this.autoReviewService.stop();

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

    await this.watchdogService.trackTask(taskId, title, undefined, timeoutSeconds);
    await this.longTaskManager.registerTask(taskId, title, { maxRuntimeSeconds: timeoutSeconds });

    logger.info(`Executing task: ${title} (attempt ${retryCount + 1}/${maxRetries})`);

    let taskPrompt = description || title;

    if (this.enableMemoryContext) {
      try {
        const context = await this.contextBuilder.buildContext({
          taskId,
          title,
          description,
        });
        taskPrompt = context.combinedPrompt;

        logger.debug(
          `Task context built with ${context.relevantMemories.length} relevant memories`
        );
      } catch (error) {
        logger.warn('Failed to build task context, using original prompt:', error);
      }
    }

    const learningPrompt = `${taskPrompt}

---

## Learning Reminder
After completing this task:
1. Reflect on what you learned
2. If you discovered something valuable, save it to memory using memory_save
3. Consider how this knowledge could help in future tasks`;

    if (!this.agentCircuitBreaker.isAvailable()) {
      logger.warn('Agent circuit breaker is not available, skipping task execution');
      throw new Error('Agent service temporarily unavailable (circuit breaker open)');
    }

    try {
      const result = await this.agent.executeTask(learningPrompt);

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

        await this.learning.recordOutcome(taskId, 'COMPLETED', {
          taskDescription: title,
          executionTimeMs: Date.now() - startTime,
          attempts: retryCount + 1,
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

        await this.watchdogService.untrackTask(taskId);
        await this.longTaskManager.unregisterTask(taskId);

        return;
      }

      this.stats.tasksFailed++;

      const errorMessage = result.message || 'Unknown error';
      await this.alertService.categorizeAndRecordFailure(taskId, title, errorMessage, retryCount);

      await this.learning.recordOutcome(taskId, 'FAILED', {
        taskDescription: title,
        errorMessage: errorMessage,
        attempts: retryCount + 1,
      });

      await this.dailyMemory.save({
        task: title,
        result: 'Task failed',
        errors: result.message ? [result.message] : undefined,
      });

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
      await this.watchdogService.untrackTask(taskId);
      await this.longTaskManager.unregisterTask(taskId);
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

    const categorized = await this.alertService.categorizeAndRecordFailure(
      taskId,
      title,
      error,
      retryCount
    );

    const tableName = DATABASE_TABLES.TASKS;
    await this.db.query(
      `UPDATE ${tableName} SET status = $1, error = $2, retry_count = $3, error_category = $4 WHERE id = $5`,
      [
        TASK_STATUS.FAILED,
        `Max retries (${maxRetries}) exceeded: ${error}`,
        retryCount,
        categorized,
        taskId,
      ]
    );

    await this.db.query(
      `INSERT INTO dead_letter_queue (original_task_id, title, description, error_message, error_category, retry_count, max_retries)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [taskId, title, description || '', error, categorized, retryCount, maxRetries]
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
        JSON.stringify({ retryCount, maxRetries, movedToDLQ: true, errorCategory: categorized }),
      ]
    );

    await this.alertService.createAlert(AlertType.DLQ_THRESHOLD, `DLQ entry: ${title}`, {
      taskId,
      errorCategory: categorized,
      errorMessage: error,
      failureCount: retryCount,
      metadata: { maxRetries, movedToDLQ: true },
    });

    await this.watchdogService.untrackTask(taskId);
    await this.longTaskManager.unregisterTask(taskId);

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
        await this.parseReflectionOutput(reflectionResult.output, taskTitle);
      } else {
        logger.warn('Reflection failed:', reflectionResult.message);
      }
    } catch (error) {
      logger.warn('Reflection error (non-fatal):', error);
    }
  }

  private async parseReflectionOutput(
    output: string | undefined,
    taskTitle: string
  ): Promise<void> {
    if (!output) return;

    const learnPattern = /\[LEARN\]\s*insight:\s*(.+?)(?:\s*context:\s*(.+?))?\s*(?=\[|$)/gis;
    const promptPattern =
      /\[PROMPT_UPDATE\]\s*current:\s*(.+?)\s*suggested:\s*(.+?)\s*reason:\s*(.+?)\s*(?=\[|$)/gis;

    let match;
    let count = 0;

    while ((match = learnPattern.exec(output)) !== null) {
      const insight = match[1]?.trim();
      const context = match[2]?.trim() || null;

      if (insight) {
        await this.db.query(
          `INSERT INTO memory (content, tags, source, importance, metadata) 
           VALUES ($1, ARRAY['learning', 'reflection'], 'reflection-parser', $2, $3)`,
          [insight, 5, JSON.stringify({ taskTitle, context })]
        );
        count++;
      }
    }

    while ((match = promptPattern.exec(output)) !== null) {
      const currentPrompt = match[1]?.trim();
      const suggestedPrompt = match[2]?.trim();
      const reason = match[3]?.trim();

      if (currentPrompt && suggestedPrompt) {
        await this.db.query(
          `INSERT INTO prompt_suggestions (current_prompt, suggested_prompt, reason, status)
           VALUES ($1, $2, $3, 'pending')`,
          [currentPrompt, suggestedPrompt, reason]
        );
        count++;
      }
    }

    if (count > 0) {
      logger.info(`[Reflection] Parsed ${count} items from reflection for task: ${taskTitle}`);
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

  async getReviewLearningsForContext(topic?: string): Promise<string> {
    return this.interReviewService.getLearningsForAIContext(topic);
  }

  async requestInterReview(
    taskId: string,
    title: string,
    commitHash?: string,
    branch?: string
  ): Promise<string> {
    const { execSync } = await import('child_process');
    const currentCommit =
      commitHash ||
      (() => {
        try {
          return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
        } catch {
          return undefined;
        }
      })();
    const currentBranch =
      branch ||
      (() => {
        try {
          return execSync('git branch --show-current', { encoding: 'utf-8' }).trim() || 'main';
        } catch {
          return 'main';
        }
      })();

    const request = {
      taskId,
      commitHash: currentCommit,
      branch: currentBranch,
      reviewerId: `nezha-${Date.now()}`,
      context: {
        taskDescription: title,
        message: 'Manual inter-review requested from HeartbeatService',
      },
    };

    return this.interReviewService.requestReview(request);
  }

  async performInterReview(reviewId: string, prompt: string): Promise<ReviewResult> {
    return this.interReviewService.performReview(reviewId, prompt);
  }

  async getInterReviewStats(): Promise<{
    pendingCount: number;
    completedCount: number;
    avgScore: number | null;
  }> {
    const stats = await this.interReviewService.getReviewStats();
    return {
      pendingCount: stats.pendingCount,
      completedCount: stats.completedCount,
      avgScore: stats.avgScore,
    };
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

    let taskPrompt = description || title;

    if (this.enableMemoryContext) {
      try {
        const context = await this.contextBuilder.buildContext({
          taskId,
          title,
          description,
        });
        taskPrompt = context.combinedPrompt;
      } catch (error) {
        logger.warn('Failed to build task context for streaming:', error);
      }
    }

    const learningPrompt = `${taskPrompt}

---

## Learning Reminder
After completing this task:
1. Reflect on what you learned
2. If you discovered something valuable, save it to memory using memory_save
3. Consider how this knowledge could help in future tasks`;

    if (!this.agentCircuitBreaker.isAvailable()) {
      logger.warn('Agent circuit breaker is not available (streaming), skipping task execution');
      throw new Error('Agent service temporarily unavailable (circuit breaker open)');
    }

    try {
      const result = await (this.agent as UnifiedAgent).executeTaskStreaming(
        learningPrompt,
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

        await this.learning.recordOutcome(taskId, 'COMPLETED', {
          taskDescription: title,
          executionTimeMs: Date.now() - startTime,
          attempts: retryCount + 1,
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

      await this.learning.recordOutcome(taskId, 'FAILED', {
        taskDescription: title,
        errorMessage: resultMessage || 'Unknown error',
        attempts: retryCount + 1,
      });

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
    if (!task) {
      return { result: undefined, accessDenied: true, encrypted: false };
    }

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
