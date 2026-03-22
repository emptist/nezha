import { Scheduler } from '../core/Scheduler.js';
import { EventBus } from '../core/EventBus.js';
import { UnifiedAgent, CliAgent, type UnifiedAgentConfig } from '../core/UnifiedAgent.js';
import { type StreamingCallback } from '../core/transports/index.js';
import { MemoryService } from '../core/Memory.js';
import { LearningAnalysisService } from '../core/LearningAnalysis.js';
import { ImprovementIdentifier } from '../core/ImprovementIdentifier.js';
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
import { getGitInfo } from '../utils/git.js';
import { CheckpointService } from './CheckpointService.js';
import {
  getEncryptionService,
  containsSensitiveData,
  encryptSensitiveFields,
} from './EncryptionService.js';
import { createStandardMetrics } from './MetricsService.js';
import { getPluginManager, type TaskContext } from '../core/PluginManager.js';
import { NotificationPlugin, LoggingPlugin, ReflectionPlugin } from '../plugins/index.js';
import { WebhookService, createWebhookConfigFromEnv } from './WebhookService.js';
import { ContextBuilder } from './ContextBuilder.js';
import { EnhancedCircuitBreaker } from '../utils/EnhancedCircuitBreaker.js';
import { TaskWatchdogService, WatchdogEvent } from './TaskWatchdogService.js';
import { FailureAlertService, AlertType, type FailureAlert } from './FailureAlertService.js';
import { LongTaskManager } from './LongTaskManager.js';
import { InterReviewService, type ReviewResult } from './InterReviewService.js';
import { AutoReviewService } from './AutoReviewService.js';
import { MeetingHandler } from './MeetingHandler.js';
import { MarkdownKnowledgeLoader } from './MarkdownKnowledgeLoader.js';
import * as path from 'path';
import { ReviewService } from './ReviewService.js';
import { FailureAnalysisService } from './FailureAnalysisService.js';
import { BroadcastService } from './BroadcastService.js';
import { getAgentSessionService, getCurrentSessionId } from './AgentSessionService.js';
import { IssueTrackingService } from './IssueTrackingService.js';

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
  insightIntervalMs?: number;
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

const SKIP_REFLECTION_PATTERNS = [
  /inter-?review/i,
  /^discussion$/i,
  /discussion participation/i,
  /^meeting$/i,
  /^participate/i,
  /participation in/i,
];

function shouldSkipReflection(title: string): boolean {
  return SKIP_REFLECTION_PATTERNS.some(p => p.test(title));
}

export { shouldSkipReflection };

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
  private scheduledTaskTimer: ReturnType<typeof setInterval> | null = null;
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
  private readonly scheduledTaskIntervalMs: number;
  private readonly watchdogService: TaskWatchdogService;
  private readonly alertService: FailureAlertService;
  private readonly longTaskManager: LongTaskManager;
  private readonly interReviewService: InterReviewService;
  private readonly autoReviewService: AutoReviewService;
  private readonly reviewService: ReviewService;
  private readonly failureAnalysisService: FailureAnalysisService;
  private readonly broadcastService: BroadcastService;
  private readonly issueTrackingService: IssueTrackingService;
  private isInsightCheckRunning: boolean = false;

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
    this.insightIntervalMs = config?.insightIntervalMs ?? 1800000; // 30 minutes default (was 5 min)
    this.scheduledTaskIntervalMs = 60000; // 1 minute default for scheduled tasks
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
    this.reviewService = new ReviewService(db);
    this.failureAnalysisService = new FailureAnalysisService(db);
    this.broadcastService = new BroadcastService(db);
    this.issueTrackingService = new IssueTrackingService(db);

    const sessionId = getCurrentSessionId() || `nezha-heartbeat-${Date.now()}`;

    if (typeof this.scheduler.getEventBus === 'function') {
      this.autoReviewService = new AutoReviewService(this.scheduler.getEventBus(), db, {
        enabled: true,
        reviewOnSuccess: true,
        reviewOnFailure: true,
        reviewerId: sessionId,
      });
    } else {
      this.autoReviewService = new AutoReviewService(new EventBus(db), db, {
        enabled: false,
        reviewOnSuccess: false,
        reviewOnFailure: false,
        reviewerId: sessionId,
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

    pluginManager.registerPlugin(
      new ReflectionPlugin({
        reflectOnComplete: true,
        reflectOnFail: true,
        createIssueOnPattern: true,
      })
    );

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
        remindOnUncommitted: true,
        logGitStatus: true,
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

    await this.runBootstrap();
    this.startMemoryCleanup();
    this.startMemoryCompaction();
    this.startCheckpointTimer();
    this.startInsightGeneration();
    this.startScheduledTaskProcessing();

    const agentSession = getAgentSessionService(this.db);
    await agentSession.registerSession('nezha-daemon');
    this.startSessionHeartbeat();

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

  private sessionHeartbeatTimer: NodeJS.Timeout | null = null;
  private readonly sessionHeartbeatIntervalMs = 60000;

  private startSessionHeartbeat(): void {
    const sessionService = getAgentSessionService(this.db);
    const runHeartbeat = async (): Promise<void> => {
      try {
        await sessionService.heartbeat();
        const sessions = await sessionService.getActiveSessions();
        logger.debug(`Session heartbeat: ${sessions.length} active session(s)`);
      } catch (error) {
        logger.error('Session heartbeat failed:', error);
      }
    };
    runHeartbeat().catch(err => logger.error('Initial session heartbeat failed:', err));
    this.sessionHeartbeatTimer = setInterval(runHeartbeat, this.sessionHeartbeatIntervalMs);
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
    const runInsightChecks = async (): Promise<void> => {
      if (this.isInsightCheckRunning) {
        logger.warn('[InsightCheck] Previous check still running, skipping this cycle');
        return;
      }
      this.isInsightCheckRunning = true;
      try {
        const insights = await this.learning.autoGenerateInsights();
        if (insights.length > 0) {
          logger.info(`Generated ${insights.length} new insights`);
        }

        await this.checkDocConsistency();
        await this.checkReviewFollowUps();
        await this.checkMeetingInvites();
        await this.checkFailurePatterns();
        await this.checkBroadcasts();

        const sessionService = getAgentSessionService(this.db);
        await sessionService.cleanupStaleSessions(5);
        await this.checkCommunications();
        await this.checkDLQToIssues();
        await this.checkIssueTaskLinks();
        await this.checkDocsImport();
        await this.checkReflectionSummaryScheduledTask();
        await this.generateDailyReflectionSummary();
      } catch (error) {
        logger.error('Insight generation failed:', error);
      } finally {
        this.isInsightCheckRunning = false;
      }
    };
    runInsightChecks().catch(err => logger.error('Initial insight check failed:', err));
    this.insightTimer = setInterval(runInsightChecks, this.insightIntervalMs);
  }

  private startScheduledTaskProcessing(): void {
    logger.info(`Starting scheduled task processing (interval: ${this.scheduledTaskIntervalMs}ms)`);
    const processScheduledTasks = async (): Promise<void> => {
      try {
        const processed = await this.scheduler.processScheduledTasks();
        if (processed > 0) {
          logger.info(`Processed ${processed} scheduled task(s)`);
        }
      } catch (error) {
        logger.error('Scheduled task processing failed:', error);
      }
    };
    processScheduledTasks().catch(err => logger.error('Initial scheduled task check failed:', err));
    this.scheduledTaskTimer = setInterval(processScheduledTasks, this.scheduledTaskIntervalMs);
  }

  private async checkReflectionSummaryScheduledTask(): Promise<void> {
    try {
      const dueTask = await this.db.query<{
        id: string;
        name: string;
        cron_expression: string;
      }>(
        `SELECT id, name, cron_expression 
         FROM scheduled_tasks 
         WHERE enabled = true 
           AND next_run <= NOW() 
           AND (description LIKE '%reflection%' OR name LIKE '%reflection%')
         LIMIT 1`
      );

      if (dueTask.rows.length === 0) {
        return;
      }

      const task = dueTask.rows[0];
      if (!task) {
        return;
      }

      logger.info(`[Reflection] Triggering scheduled task: ${task.name}`);

      await this.generateDailyReflectionSummary();

      const { Scheduler } = await import('../core/Scheduler.js');
      const nextRun = Scheduler.calculateNextRun(task.cron_expression, new Date());
      await this.db.query(
        `UPDATE scheduled_tasks SET last_run = NOW(), next_run = $1, updated_at = NOW() WHERE id = $2`,
        [nextRun, task.id]
      );

      logger.info(`[Reflection] Next run scheduled for: ${nextRun.toISOString()}`);
    } catch (error) {
      logger.warn('[Reflection] Scheduled task check failed:', error);
    }
  }

  private async checkMeetingInvites(): Promise<void> {
    try {
      const result = await this.db.query<{
        id: string;
        content: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT id, content, metadata FROM project_communications
         WHERE message_type = 'notification'
           AND content LIKE '%Discussion:%'
           AND read_at IS NULL
         ORDER BY created_at DESC
         LIMIT 5`
      );

      for (const invite of result.rows) {
        const taskId = (invite.metadata as Record<string, string>)?.taskId;
        if (taskId) {
          const existingTask = await this.db.query<{ id: string }>(
            `SELECT id FROM tasks WHERE id = $1`,
            [taskId]
          );

          if (existingTask.rows.length === 0) {
            const titleMatch = invite.content.match(/Discussion:\s*(.+)/);
            if (titleMatch?.[1]) {
              await this.db.query(
                `INSERT INTO tasks (id, title, description, status, priority, type, category)
                 VALUES ($1, $2, $3, 'PENDING', 6, 'discussion', 'collaboration')`,
                [taskId, `Discussion: ${titleMatch[1]}`, `Join the discussion: ${invite.content}`]
              );
              logger.info(`[Meeting] Created discussion task from invite: ${taskId}`);
            }
          }
        }

        await this.db.query(`UPDATE project_communications SET read_at = NOW() WHERE id = $1`, [
          invite.id,
        ]);
      }
    } catch (error) {
      logger.warn('[Meeting] Failed to check meeting invites:', error);
    }
  }

  private async checkReviewFollowUps(): Promise<void> {
    try {
      const overdue = await this.reviewService.markOverdueFollowUps();
      if (overdue > 0) {
        logger.info(`[Review] Found ${overdue} overdue follow-ups`);
      }

      const pendingFollowUps = await this.reviewService.getPendingFollowUps();
      for (const review of pendingFollowUps.slice(0, 5)) {
        await this.db.query(
          `INSERT INTO ${DATABASE_TABLES.TASKS}
           (id, title, description, status, priority, type, category)
           VALUES ($1, $2, $3, 'PENDING', 7, 'review-followup', 'quality')`,
          [
            crypto.randomUUID(),
            `Review Follow-up: ${review.title}`,
            `Complete pending action items for review: ${review.title}`,
          ]
        );
        logger.info(`[Review] Created follow-up task for review: ${review.id}`);
      }
    } catch (error) {
      logger.warn('[Review] Follow-up check failed:', error);
    }
  }

  private async checkDocConsistency(): Promise<void> {
    try {
      const identifier = new ImprovementIdentifier();
      const improvements = await identifier.identify();

      const agentId = Config.getInstance().getAgentId();
      const gitInfo = this.getGitInfo();
      const environment = this.getEnvironment();
      let issuesCreated = 0;

      for (const imp of improvements) {
        if (imp.priority >= 7 && imp.type !== 'optimization') {
          await this.db.query(
            `INSERT INTO issues (title, description, issue_type, severity, discovered_by, tags, metadata, git_hash, git_branch, environment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT DO NOTHING`,
            [
              imp.title,
              imp.description,
              imp.category === 'documentation' ? 'inconsistency' : 'improvement',
              imp.type === 'critical' ? 'high' : 'medium',
              agentId,
              [imp.category],
              JSON.stringify({ source: 'auto-check', priority: imp.priority }),
              gitInfo.hash,
              gitInfo.branch,
              environment,
            ]
          );
          issuesCreated++;
        }
      }

      if (issuesCreated > 0) {
        logger.info(`[AutoCheck] Created ${issuesCreated} issues from doc consistency check`);
      }
    } catch (error) {
      logger.error('[AutoCheck] Doc consistency check failed:', error);
    }
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

    if (this.scheduledTaskTimer) {
      clearInterval(this.scheduledTaskTimer);
      this.scheduledTaskTimer = null;
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

  getStats(): {
    tasksExecuted: number;
    tasksSucceeded: number;
    tasksFailed: number;
    reconnectAttempts: number;
  } {
    return { ...this.stats };
  }

  async executeTask(
    taskId: string,
    title: string,
    description?: string,
    taskType?: string,
    retryCount: number = 0,
    maxRetries: number = this.defaultMaxRetries,
    timeoutSeconds: number = 300
  ): Promise<void> {
    if (taskType === 'discussion') {
      return this.executeDiscussionTask(
        taskId,
        title,
        description,
        retryCount,
        maxRetries,
        timeoutSeconds
      );
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
      metadata: { retryCount, maxRetries, timeoutSeconds },
    };

    await pluginManager.executeBeforeTask(taskContext);

    await this.watchdogService.trackTask(taskId, title, undefined, timeoutSeconds);
    await this.longTaskManager.registerTask(taskId, title, { maxRuntimeSeconds: timeoutSeconds });

    logger.info(`Executing task: ${title} (attempt ${retryCount + 1}/${maxRetries})`);

    let taskPrompt = description || title;

    await this.issueTrackingService.checkAndWarnRelatedIssues(title);

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

    const sessionId = getCurrentSessionId();
    const learningPrompt = `${taskPrompt}

---

## AGENT CONTEXT
Agent ID: nezha-daemon
Agent Session: ${sessionId || 'unknown'}

## AUTO-EXECUTION INSTRUCTION
When given choices or asked to confirm actions:
- ALWAYS select the RECOMMENDED option (typically option 1)
- NEVER wait for user input - proceed autonomously
- If asked to "Select one answer", automatically pick the first/recommended option
- Execute the recommended action without asking for confirmation

## Learning Reminder
After completing this task, use reflection markers:
- [LEARN] insight: <what you learned> context: <optional context>
- [ISSUE] title: <issue> type: <bug|improvement> severity: <low|medium|high|critical>
- [PROMPT_UPDATE] current: <old> suggested: <new> reason: <why>

Save via: node dist/cli/index.js auto-reflect "[LEARN] insight: ... context: ..."`;

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

        if (!shouldSkipReflection(title)) {
          await this.runReflection(title, result.message || 'Completed');
        }

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

    await this.runFailureAnalysis(taskId);

    this.stats.tasksFailed++;
  }

  private async runBootstrap(): Promise<void> {
    try {
      const result = await this.db.query<{ needs_bootstrap: boolean }>(`SELECT needs_bootstrap()`);

      if (result.rows[0]?.needs_bootstrap) {
        logger.info('[Bootstrap] Running essential knowledge bootstrap...');

        await this.db.query(`SELECT load_essential_knowledge()`);

        logger.info('[Bootstrap] Essential knowledge loaded');
      } else {
        logger.debug('[Bootstrap] Bootstrap already completed, skipping');
      }

      await this.initializeDefaultScheduledTasks();
    } catch (error) {
      logger.warn('[Bootstrap] Bootstrap failed (non-fatal):', error);
    }
  }

  private async initializeDefaultScheduledTasks(): Promise<void> {
    try {
      const existingTask = await this.db.query<{ id: string }>(
        `SELECT id FROM scheduled_tasks WHERE name = 'Daily Reflection Summary' LIMIT 1`
      );

      if (existingTask.rows.length > 0) {
        logger.debug('[Bootstrap] Reflection summary scheduled task already exists');
        return;
      }

      const { Scheduler } = await import('../core/Scheduler.js');
      const cronExpression = '0 9 * * *';
      const validation = Scheduler.validateCronExpression(cronExpression);

      if (!validation.valid || !validation.nextRun) {
        logger.warn('[Bootstrap] Invalid cron expression for reflection summary task');
        return;
      }

      await this.db.query(
        `INSERT INTO scheduled_tasks (name, description, cron_expression, priority, next_run) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'Daily Reflection Summary',
          'Generate and broadcast daily reflection summary',
          cronExpression,
          8,
          validation.nextRun,
        ]
      );

      logger.info(
        '[Bootstrap] Created daily reflection summary scheduled task (runs at 9:00 AM UTC)'
      );
    } catch (error) {
      logger.warn('[Bootstrap] Failed to initialize scheduled tasks:', error);
    }
  }

  private async runFailureAnalysis(taskId: string): Promise<void> {
    try {
      const analysis = await this.failureAnalysisService.analyzeFailure(taskId);
      if (analysis) {
        logger.info(
          `[FailureAnalysis] Analyzed failure for task ${taskId}: ${analysis.errorCategory}`
        );

        if (analysis.isMissionImpossible) {
          logger.warn(`[FailureAnalysis] Task ${taskId} marked as potentially impossible`);
          await this.alertService.createAlert(
            AlertType.REPEATED_FAILURE,
            `Potentially impossible task: ${taskId}`,
            { taskId, metadata: { reasons: analysis.missionImpossibleReasons } }
          );
        }
      }
    } catch (error) {
      logger.warn('[FailureAnalysis] Analysis failed (non-fatal):', error);
    }
  }

  private async checkFailurePatterns(): Promise<void> {
    try {
      const stats = await this.failureAnalysisService.getFailureStats();
      if (stats.missionImpossibleTasks > 0) {
        logger.info(
          `[FailureAnalysis] Found ${stats.missionImpossibleTasks} potentially impossible tasks`
        );
      }

      for (const pattern of stats.topPatterns.slice(0, 3)) {
        if (pattern.occurrenceCount > 10 && pattern.successRate < 0.3) {
          await this.alertService.createAlert(
            AlertType.DLQ_THRESHOLD,
            `Recurring failure pattern: ${pattern.errorPattern}`,
            {
              threshold: pattern.occurrenceCount,
              metadata: { patternId: pattern.id, successRate: pattern.successRate },
            }
          );
        }
      }
    } catch (error) {
      logger.warn('[FailureAnalysis] Pattern check failed (non-fatal):', error);
    }
  }

  private async checkDLQToIssues(): Promise<void> {
    try {
      const dlqItems = await this.db.query<{
        id: string;
        title: string;
        error_message: string;
        failure_count: number;
        created_at: Date;
      }>(
        `SELECT id, title, error_message, retry_count as failure_count, failed_at as created_at
         FROM dead_letter_queue
         WHERE resolved = false
           AND retry_count >= 3
           AND issue_id IS NULL
         ORDER BY retry_count DESC
         LIMIT 10`
      );

      for (const item of dlqItems.rows) {
        const existingIssue = await this.db.query<{ id: string }>(
          `SELECT id FROM issues WHERE dlq_id = $1`,
          [item.id]
        );

        if (existingIssue.rows.length === 0) {
          const agentId = Config.getInstance().getAgentId();
          await this.db.query(
            `INSERT INTO issues (title, description, issue_type, severity, discovered_by, dlq_id, tags, task_id, metadata)
             VALUES ($1, $2, 'bug', 'high', $3, $4, $5, NULL, $6)`,
            [
              `DLQ: ${item.title || 'Unknown task'}`,
              `Failed ${item.failure_count} times.\n\nLast error:\n${item.error_message}`,
              agentId,
              item.id,
              ['dlq', 'auto-created'],
              JSON.stringify({ dlqId: item.id, firstFailed: item.created_at }),
            ]
          );
          logger.info(`[DLQ] Created issue from DLQ item: ${item.id}`);
        }
      }
    } catch (error) {
      logger.warn('[DLQ] DLQ to issues check failed (non-fatal):', error);
    }
  }

  private async checkIssueTaskLinks(): Promise<void> {
    try {
      const result = await this.db.query<{ id: string; title: string }>(
        `SELECT id, title FROM issues 
         WHERE task_id IS NULL 
           AND status IN ('open', 'in_progress')
         LIMIT 10`
      );

      for (const issue of result.rows) {
        const matchingTask = await this.db.query<{ id: string }>(
          `SELECT id FROM tasks 
           WHERE status = 'COMPLETED' 
             AND (
               title ILIKE '%' || $1 || '%'
               OR description ILIKE '%' || $1 || '%'
             )
           ORDER BY completed_at DESC
           LIMIT 1`,
          [issue.title.substring(0, 50)]
        );

        if (matchingTask.rows.length > 0 && matchingTask.rows[0]) {
          await this.db.query(`UPDATE issues SET task_id = $2 WHERE id = $1`, [
            issue.id,
            matchingTask.rows[0].id,
          ]);
          logger.info(`[Issues] Linked issue ${issue.id} to task ${matchingTask.rows[0].id}`);
        }
      }
    } catch (error) {
      logger.warn('[Issues] Issue-task link check failed:', error);
    }
  }

  private async checkDocsImport(): Promise<void> {
    try {
      const loader = new MarkdownKnowledgeLoader();
      loader.setDatabaseClient(this.db);
      const docsDir = path.join(process.cwd(), 'docs');

      const files = await loader.scanDirectory(docsDir);
      let imported = 0;
      let skipped = 0;

      for (const file of files.slice(0, 10)) {
        const existing = await this.db.query<{ id: string }>(
          `SELECT id FROM memory WHERE metadata->>'filepath' = $1`,
          [file.path]
        );

        if (existing.rows.length === 0) {
          await loader.importFile(file);
          imported++;
          logger.info(`[Docs] Imported: ${file.path}`);
        } else {
          skipped++;
        }
      }

      if (imported > 0) {
        logger.info(
          `[Docs] Imported ${imported} new doc(s) to memory (${skipped} already imported)`
        );
      }
    } catch (error) {
      logger.warn('[Docs] Docs import check failed:', error);
    }
  }

  async importAllDocs(): Promise<{ imported: number; skipped: number }> {
    const loader = new MarkdownKnowledgeLoader();
    loader.setDatabaseClient(this.db);
    const docsDir = path.join(process.cwd(), 'docs');

    const files = await loader.scanDirectory(docsDir);
    let imported = 0;
    let skipped = 0;

    for (const file of files) {
      const existing = await this.db.query<{ id: string }>(
        `SELECT id FROM memory WHERE metadata->>'filepath' = $1`,
        [file.path]
      );

      if (existing.rows.length === 0) {
        await loader.importFile(file);
        imported++;
      } else {
        skipped++;
      }
    }

    logger.info(`[Docs] Full import complete: ${imported} imported, ${skipped} skipped`);
    return { imported, skipped };
  }

  private async checkBroadcasts(): Promise<void> {
    try {
      const broadcasts = await this.broadcastService.getUnreadBroadcasts();

      if (broadcasts.length === 0) {
        return;
      }

      const criticalCount = broadcasts.filter(b => b.priority === 'critical').length;

      if (criticalCount > 0) {
        logger.warn(`[Broadcast] ${criticalCount} critical broadcast(s) unread`);
      }

      for (const broadcast of broadcasts.slice(0, 10)) {
        if (broadcast.priority === 'critical' || broadcast.priority === 'high') {
          const taskId = crypto.randomUUID();
          await this.db.query(
            `INSERT INTO tasks (id, title, description, status, priority, type, category)
             VALUES ($1, $2, $3, 'PENDING', $4, 'announcement', 'communication')`,
            [
              taskId,
              `[Broadcast ${broadcast.priority}] ${broadcast.message.substring(0, 80)}...`,
              broadcast.message,
              broadcast.priority === 'critical' ? 9 : 7,
            ]
          );
          logger.info(
            `[Broadcast] Created task from ${broadcast.priority} broadcast: ${broadcast.id}`
          );
        }

        await this.broadcastService.markAsRead(broadcast.id);
      }

      if (broadcasts.length > 0) {
        logger.info(`[Broadcast] Processed ${Math.min(broadcasts.length, 10)} unread broadcasts`);
      }
    } catch (error) {
      logger.warn('[Broadcast] Check failed (non-fatal):', error);
    }
  }

  private async checkCommunications(): Promise<void> {
    try {
      const agentId = Config.getInstance().getAgentId();

      const result = await this.db.query<{
        id: string;
        from_ai: string;
        message_type: string;
        content: string;
        priority: string;
        created_at: Date;
      }>(
        `SELECT id, from_ai, message_type, content, priority, created_at
         FROM project_communications
         WHERE read_at IS NULL
           AND created_at > NOW() - INTERVAL '7 days'
           AND (
             to_ai IN ($1, 'all-ais', 'all')
             OR message_type IN ('broadcast', 'meeting', 'discussion', 'notification')
           )
         ORDER BY 
           CASE WHEN priority = 'critical' THEN 1 
                WHEN priority = 'high' THEN 2 
                WHEN priority = 'normal' THEN 3 
                ELSE 4 END,
           created_at DESC
         LIMIT 20`,
        [agentId]
      );

      if (result.rows.length === 0) {
        return;
      }

      logger.info(`[Communications] ${result.rows.length} unread message(s)`);

      for (const comm of result.rows) {
        const taskId = crypto.randomUUID();
        const priority = comm.priority === 'critical' ? 9 : comm.priority === 'high' ? 7 : 5;

        await this.db.query(
          `INSERT INTO tasks (id, title, description, status, priority, type, category, tags)
           VALUES ($1, $2, $3, 'PENDING', $4, 'discussion', 'inter-ai-communication', $5)`,
          [
            taskId,
            `[${comm.message_type} ${comm.from_ai || 'system'}] ${comm.content.substring(0, 60)}...`,
            `From: ${comm.from_ai || 'system'}\nType: ${comm.message_type}\n\n${comm.content}`,
            priority,
            ['communication', comm.message_type],
          ]
        );

        await this.db.query(`UPDATE project_communications SET read_at = NOW() WHERE id = $1`, [
          comm.id,
        ]);

        logger.info(`[Communications] Created task for message from ${comm.from_ai}`);
      }
    } catch (error) {
      logger.warn('[Communications] Check failed (non-fatal):', error);
    }
  }

  private async executeDiscussionTask(
    taskId: string,
    title: string,
    description?: string,
    _retryCount: number = 0,
    _maxRetries: number = this.defaultMaxRetries,
    _timeoutSeconds: number = 300
  ): Promise<void> {
    logger.info(`[MeetingHandler] Processing discussion task: ${title}`);

    try {
      const meetingHandler = new MeetingHandler(this.db, this.agent);

      const task = {
        id: taskId,
        title,
        description: description || title,
        status: 'RUNNING',
        priority: 5,
      };

      await meetingHandler.createMeetingFromTask(task);
      await meetingHandler.handleDiscussionTask(task);
    } catch (error) {
      logger.error('[MeetingHandler] Discussion task failed:', error);
      this.stats.tasksFailed++;
    }
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
    const issuePattern =
      /\[ISSUE\]\s*title:\s*(.+?)(?:\s*description:\s*(.+?))?(?:\s*type:\s*(\w+))?(?:\s*severity:\s*(\w+))?(?:\s*tags:\s*(.+?))?\s*(?=\[|$)/gis;

    const whatWorkedPattern = /(?:\d+\.\s*)?\*\*What worked well:\*\*(.+?)(?=\n\d+\.|\n\*\*|$)/gis;
    const whatCouldImprovePattern =
      /(?:\d+\.\s*)?\*\*What could be improved:\*\*(.+?)(?=\n\d+\.|\n\*\*|$)/gis;
    const novelSolutionsPattern =
      /(?:\d+\.\s*)?\*\*Novel solutions:\*\*(.+?)(?=\n\d+\.|\n\*\*|$)/gis;
    const worthRememberingPattern =
      /(?:\d+\.\s*)?\*\*Worth remembering:\*\*(.+?)(?=\n\d+\.|\n\*\*|$)/gis;

    let match;
    let count = 0;

    while ((match = learnPattern.exec(output)) !== null) {
      const insight = match[1]?.trim();
      const context = match[2]?.trim() || null;

      if (insight) {
        const importance = insight.length > 100 ? 7 : 5;
        await this.db.query(
          `INSERT INTO memory (content, tags, source, importance, metadata) 
           VALUES ($1, ARRAY['learning', 'reflection'], 'reflection-parser', $2, $3)`,
          [insight, importance, JSON.stringify({ taskTitle, context })]
        );
        count++;

        if (importance >= 7) {
          await this.broadcastService.sendBroadcast(
            `**Learning:** ${insight.substring(0, 200)}${insight.length > 200 ? '...' : ''}`,
            { priority: 'normal' }
          );
        }
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

    while ((match = issuePattern.exec(output)) !== null) {
      const title = match[1]?.trim();
      const description = match[2]?.trim() || null;
      const issueType = match[3]?.trim() || 'bug';
      const severity = match[4]?.trim() || 'medium';
      const tagsStr = match[5]?.trim();
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];

      if (title) {
        const agentId = Config.getInstance().getAgentId();
        const gitInfo = this.getGitInfo();
        const environment = this.getEnvironment();
        await this.db.query(
          `INSERT INTO issues (title, description, issue_type, severity, discovered_by, tags, task_id, metadata, git_hash, git_branch, environment)
           VALUES ($1, $2, $3, $4, $5, $6, (
             SELECT id FROM tasks WHERE title = $7 ORDER BY created_at DESC LIMIT 1
           ), $8, $9, $10, $11)`,
          [
            title,
            description,
            issueType,
            severity,
            agentId,
            tags,
            taskTitle,
            JSON.stringify({ source: 'reflection', reflectionOutput: output.substring(0, 1000) }),
            gitInfo.hash,
            gitInfo.branch,
            environment,
          ]
        );
        count++;
        logger.info(`[Reflection] Created issue from reflection: ${title}`);
      }
    }

    while ((match = whatWorkedPattern.exec(output)) !== null) {
      const content = match[1]?.trim();
      if (content && content !== 'None.' && content !== 'None') {
        await this.db.query(
          `INSERT INTO memory (content, tags, source, importance, metadata) 
           VALUES ($1, ARRAY['reflection', 'what-worked'], 'reflection-parser', $2, $3)`,
          [content, 5, JSON.stringify({ taskTitle, reflectionType: 'what-worked' })]
        );
        count++;
      }
    }

    while ((match = whatCouldImprovePattern.exec(output)) !== null) {
      const content = match[1]?.trim();
      if (content && content !== 'None.' && content !== 'None') {
        await this.db.query(
          `INSERT INTO memory (content, tags, source, importance, metadata) 
           VALUES ($1, ARRAY['reflection', 'improvement'], 'reflection-parser', $2, $3)`,
          [content, 6, JSON.stringify({ taskTitle, reflectionType: 'improvement' })]
        );
        count++;
      }
    }

    while ((match = novelSolutionsPattern.exec(output)) !== null) {
      const content = match[1]?.trim();
      if (content && content !== 'None.' && content !== 'None') {
        await this.db.query(
          `INSERT INTO memory (content, tags, source, importance, metadata) 
           VALUES ($1, ARRAY['reflection', 'novel-solution'], 'reflection-parser', $2, $3)`,
          [content, 7, JSON.stringify({ taskTitle, reflectionType: 'novel-solution' })]
        );
        count++;
      }
    }

    while ((match = worthRememberingPattern.exec(output)) !== null) {
      const content = match[1]?.trim();
      if (content && content !== 'None.' && content !== 'None') {
        await this.db.query(
          `INSERT INTO memory (content, tags, source, importance, metadata) 
           VALUES ($1, ARRAY['reflection', 'worth-remembering'], 'reflection-parser', $2, $3)`,
          [content, 7, JSON.stringify({ taskTitle, reflectionType: 'worth-remembering' })]
        );
        count++;
      }
    }

    const actionPatterns = [
      /(?:should|must|need to|next step|action):?\s*(.+?)(?:\n|$)/gi,
      /(?:TODO|FIXME|NEXT):\s*(.+?)(?:\n|$)/gi,
    ];

    for (const pattern of actionPatterns) {
      while ((match = pattern.exec(output)) !== null) {
        const action = match[1]?.trim();
        if (action && action.length > 10 && action.length < 200) {
          const existingTask = await this.db.query<{ id: string }>(
            `SELECT id FROM tasks WHERE title ILIKE $1 AND status IN ('PENDING', 'RUNNING') LIMIT 1`,
            [`%${action.substring(0, 50)}%`]
          );

          if (existingTask.rows.length === 0) {
            const taskId = crypto.randomUUID();
            await this.db.query(
              `INSERT INTO tasks (id, title, description, status, priority, type, category, tags)
                VALUES ($1, $2, $3, 'PENDING', 5, 'maintenance', 'reflection', $4)`,
              [
                taskId,
                `REFLECTION: ${action.substring(0, 80)}`,
                `From reflection on task: ${taskTitle}\n\nAction: ${action}`,
                ['reflection', 'action-item'],
              ]
            );
            logger.info(`[Reflection] Created task from action: ${action.substring(0, 50)}`);
          }
        }
      }
    }

    if (count > 0) {
      logger.info(`[Reflection] Parsed ${count} items from reflection for task: ${taskTitle}`);
    }

    const positiveWords = [
      'good',
      'great',
      'excellent',
      'working',
      'success',
      'better',
      'improved',
      'effective',
      'efficient',
      'amazing',
    ];
    const negativeWords = [
      'bad',
      'poor',
      'failed',
      'broken',
      'bug',
      'issue',
      'problem',
      'wrong',
      'slow',
      'difficult',
      'confusing',
    ];

    const lowerOutput = output.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (lowerOutput.includes(word)) positiveCount++;
    }
    for (const word of negativeWords) {
      if (lowerOutput.includes(word)) negativeCount++;
    }

    const sentiment =
      positiveCount > negativeCount
        ? 'positive'
        : negativeCount > positiveCount
          ? 'negative'
          : 'neutral';

    if (positiveCount > 0 || negativeCount > 0) {
      await this.db.query(
        `INSERT INTO memory (content, tags, source, importance, metadata) 
         VALUES ($1, ARRAY['reflection', 'sentiment'], 'reflection-parser', $2, $3)`,
        [
          `Reflection sentiment: ${sentiment} (positive: ${positiveCount}, negative: ${negativeCount})`,
          4,
          JSON.stringify({ taskTitle, positiveCount, negativeCount, sentiment }),
        ]
      );
      logger.info(`[Reflection] Sentiment: ${sentiment} for task: ${taskTitle}`);
    }

    await this.clusterReflections();
  }

  async generateDailyReflectionSummary(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const alreadySent = await this.db.query<{ id: string }>(
        `SELECT id FROM memory 
         WHERE tags @> ARRAY['daily-summary'] 
           AND created_at > NOW() - INTERVAL '1 day'
           AND metadata->>'date' = $1
         LIMIT 1`,
        [today]
      );

      if (alreadySent.rows.length > 0) {
        return;
      }

      const stats = await this.db.query<{
        total: string;
        positive: string;
        negative: string;
        neutral: string;
      }>(
        `SELECT 
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as total,
           COUNT(*) FILTER (WHERE metadata->>'sentiment' = 'positive' AND created_at > NOW() - INTERVAL '24 hours') as positive,
           COUNT(*) FILTER (WHERE metadata->>'sentiment' = 'negative' AND created_at > NOW() - INTERVAL '24 hours') as negative,
           COUNT(*) FILTER (WHERE metadata->>'sentiment' = 'neutral' AND created_at > NOW() - INTERVAL '24 hours') as neutral
         FROM memory 
         WHERE source = 'reflection-parser'`
      );

      const taskStats = await this.db.query<{
        completed: string;
        failed: string;
        total: string;
      }>(
        `SELECT 
           COUNT(*) FILTER (WHERE status = 'COMPLETED' AND completed_at > NOW() - INTERVAL '24 hours') as completed,
           COUNT(*) FILTER (WHERE status = 'FAILED' AND updated_at > NOW() - INTERVAL '24 hours') as failed,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as total
         FROM tasks`
      );

      const recentHighlights = await this.db.query<{ content: string; tags: string[] }>(
        `SELECT content, tags FROM memory 
         WHERE source = 'reflection-parser' 
           AND created_at > NOW() - INTERVAL '24 hours'
           AND importance >= 6
         ORDER BY importance DESC, created_at DESC
         LIMIT 5`
      );

      const row = stats.rows[0];
      const taskRow = taskStats.rows[0];
      const total = parseInt(row?.total || '0', 10);

      if (total === 0) {
        return;
      }

      const summary = `## Daily Reflection Summary (${today})

**Task Stats:** ${taskRow?.completed || 0} completed, ${taskRow?.failed || 0} failed (${taskRow?.total || 0} total)

**Reflections:** ${total} captured
- Positive: ${row?.positive || 0}
- Negative: ${row?.negative || 0}  
- Neutral: ${row?.neutral || 0}

**Key Learnings:**
${recentHighlights.rows.map((h, i) => `${i + 1}. ${h.content.substring(0, 150)}${h.content.length > 150 ? '...' : ''}`).join('\n') || 'None today'}`;

      await this.db.query(
        `INSERT INTO memory (content, tags, source, importance, metadata) 
         VALUES ($1, ARRAY['daily-summary', 'reflection'], 'heartbeat', $2, $3)`,
        [summary, 8, JSON.stringify({ date: today, type: 'daily-reflection-summary' })]
      );

      await this.broadcastService.sendBroadcast(summary, { priority: 'normal' });
      logger.info(`[Reflection] Daily summary broadcast for ${today}`);
    } catch (error) {
      logger.warn('[Reflection] Daily summary check failed:', error);
    }
  }

  private async clusterReflections(): Promise<void> {
    try {
      const recentReflections = await this.db.query<{
        id: string;
        content: string;
        tags: string[];
      }>(
        `SELECT id, content, tags FROM memory 
         WHERE source = 'reflection-parser' 
           AND created_at > NOW() - INTERVAL '1 hour'
           AND 'clustered' != ALL(tags)
         ORDER BY created_at DESC
         LIMIT 20`
      );

      if (recentReflections.rows.length < 3) return;

      const stopWords = new Set([
        'the',
        'a',
        'an',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'to',
        'of',
        'in',
        'for',
        'on',
        'with',
        'and',
        'or',
        'but',
        'it',
        'this',
        'that',
        'from',
        'by',
        'as',
        'at',
      ]);

      function extractKeywords(text: string): Set<string> {
        const words = text
          .toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 3 && !stopWords.has(w));
        return new Set(words);
      }

      const recent = recentReflections.rows;
      const clusters: Map<string, string[]> = new Map();

      for (let i = 0; i < recent.length; i++) {
        const current = recent[i];
        if (!current) continue;

        let bestCluster: string | null = null;
        let bestOverlap = 0;

        const keywords1 = extractKeywords(current.content);

        for (const [clusterKey, clusterReflections] of clusters) {
          for (const refId of clusterReflections) {
            const ref = recent.find(r => r.id === refId);
            if (ref) {
              const keywords2 = extractKeywords(ref.content);
              let overlap = 0;
              for (const kw of keywords1) {
                if (keywords2.has(kw)) overlap++;
              }
              if (overlap > bestOverlap && overlap >= 2) {
                bestOverlap = overlap;
                bestCluster = clusterKey;
              }
            }
          }
        }

        if (bestCluster) {
          clusters.get(bestCluster)!.push(current.id);
        } else {
          clusters.set(current.id, [current.id]);
        }
      }

      for (const [seedId, clusterIds] of clusters) {
        if (clusterIds.length >= 3) {
          const seed = recent.find(r => r.id === seedId);
          if (seed) {
            const clusterTag = `cluster:${seedId.substring(0, 8)}`;
            for (const id of clusterIds) {
              await this.db.query(`UPDATE memory SET tags = array_append(tags, $1) WHERE id = $2`, [
                clusterTag,
                id,
              ]);
            }
            logger.info(
              `[Reflection] Created cluster ${clusterTag} with ${clusterIds.length} reflections`
            );
          }
        }
      }
    } catch (error) {
      logger.warn('[Reflection] Clustering failed:', error);
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
    const gitInfo = getGitInfo();
    const currentCommit = commitHash || gitInfo.hash || undefined;
    const currentBranch = branch || gitInfo.branch || 'main';

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

    const sessionId = getCurrentSessionId();
    const learningPrompt = `${taskPrompt}

---

## AGENT CONTEXT
Agent ID: nezha-daemon
Agent Session: ${sessionId || 'unknown'}

## Learning Reminder
After completing this task, use reflection markers:
- [LEARN] insight: <what you learned> context: <optional context>
- [ISSUE] title: <issue> type: <bug|improvement> severity: <low|medium|high|critical>
- [PROMPT_UPDATE] current: <old> suggested: <new> reason: <why>

Save via: node dist/cli/index.js auto-reflect "[LEARN] insight: ... context: ..."`;

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

        if (!shouldSkipReflection(title)) {
          await this.runReflection(title, resultMessage || 'Completed');
        }

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

  private getGitInfo(): { hash: string | null; branch: string | null } {
    return getGitInfo({ shortHash: true });
  }

  private getEnvironment(): string {
    return process.env.NODE_ENV || 'development';
  }
}
