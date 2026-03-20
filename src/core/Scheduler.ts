import { DatabaseClient } from '../db/DatabaseClient.js';
import {
  DATABASE_TABLES,
  SCHEDULER_CONFIG,
  TASK_CONFIG,
  TASK_STATUS,
} from '../config/constants.js';
import { type TaskStatus } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { EventBus } from './EventBus.js';
import { createStandardMetrics } from '../services/MetricsService.js';
import {
  EncryptionService,
  containsSensitiveData,
  encryptSensitiveFields,
  decryptSensitiveFields,
} from '../services/EncryptionService.js';

const standardMetrics = createStandardMetrics();

export interface ScheduledTask {
  id: string;
  projectId?: string;
  data: Record<string, unknown>;
  scheduledAt: Date;
  intervalMs?: number;
}

export interface TaskEvent {
  taskId: string;
  title: string;
  description?: string;
  timestamp: Date;
}

export const SCHEDULER_EVENTS = {
  TASK_STARTED: 'scheduler:task:started',
  TASK_COMPLETED: 'scheduler:task:completed',
  TASK_FAILED: 'scheduler:task:failed',
  HEARTBEAT: 'scheduler:heartbeat',
  PAUSED: 'scheduler:paused',
  RESUMED: 'scheduler:resumed',
} as const;

export class Scheduler {
  private readonly db: DatabaseClient;
  private readonly heartbeatIntervalMs: number;
  private readonly eventBus: EventBus;
  private readonly encryption: EncryptionService;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isHeartbeatRunning: boolean = false;
  private recurringTaskTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isRunning: boolean = false;
  private isExecuting: boolean = false;
  private consecutiveFailures: number = 0;
  private isPaused: boolean = false;
  private pauseUntil: Date | null = null;
  private lastHeartbeat: Date | null = null;
  private lastRun: Date | null = null;
  private lastTaskRun: Map<string, Date> = new Map();
  private totalTasksExecuted: number = 0;

  constructor(db: DatabaseClient, heartbeatIntervalMs?: number, eventBus?: EventBus) {
    this.db = db;
    this.heartbeatIntervalMs = heartbeatIntervalMs ?? TASK_CONFIG.DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.eventBus = eventBus ?? new EventBus(db);
    this.encryption = EncryptionService.getInstance();
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat().catch(err => {
        logger.error('Scheduler heartbeat failed:', err);
      });
    }, this.heartbeatIntervalMs);
    await this.heartbeat();
  }

  async stop(options?: { gracePeriodMs?: number; waitForRunningTasks?: boolean }): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const gracePeriodMs = options?.gracePeriodMs ?? 30000;
    const waitForRunning = options?.waitForRunningTasks ?? true;

    // Signal stop first to prevent new tasks
    this.isRunning = false;

    // Wait for running tasks if requested
    if (waitForRunning) {
      logger.info(`Waiting up to ${gracePeriodMs}ms for running tasks to complete...`);
      const startTime = Date.now();

      while (Date.now() - startTime < gracePeriodMs) {
        const result = await this.db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM tasks WHERE status = 'RUNNING'`
        );
        const runningCount = parseInt(result.rows[0]?.count || '0', 10);

        if (runningCount === 0) {
          logger.info('All running tasks completed');
          break;
        }

        logger.debug(`Waiting for ${runningCount} running tasks...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Check if we timed out
      const result = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'RUNNING'`
      );
      const remainingTasks = parseInt(result.rows[0]?.count || '0', 10);
      if (remainingTasks > 0) {
        logger.warn(`Grace period expired, ${remainingTasks} tasks still running`);
      }
    }

    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const timer of this.recurringTaskTimers.values()) {
      clearInterval(timer);
    }
    this.recurringTaskTimers.clear();
  }

  async waitUntilStopped(): Promise<void> {
    return new Promise<void>(resolve => {
      const checkInterval = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  private async heartbeat(): Promise<void> {
    // Prevent concurrent heartbeat execution
    if (this.isHeartbeatRunning) {
      logger.debug('Scheduler heartbeat: Skipping - already running');
      return;
    }

    // Respect stop signal - don't start new tasks
    if (!this.isRunning) {
      logger.debug('Scheduler heartbeat: Skipping - scheduler is stopping');
      return;
    }

    this.isHeartbeatRunning = true;

    try {
      // Check if paused
      if (this.isPaused && this.pauseUntil && new Date() < this.pauseUntil) {
        logger.info(`Scheduler heartbeat: Paused until ${this.pauseUntil.toISOString()}`);
        this.isHeartbeatRunning = false;
        return;
      }

      // Resume if pause time is over
      if (this.isPaused) {
        logger.info('Scheduler heartbeat: Resuming after pause');
        this.isPaused = false;
        this.pauseUntil = null;
        this.consecutiveFailures = 0;
        this.eventBus.publish(SCHEDULER_EVENTS.RESUMED, { timestamp: new Date() });
      }

      logger.info('Scheduler heartbeat: Checking for pending tasks');
      this.lastHeartbeat = new Date();
      this.lastRun = new Date();
      this.eventBus.publish(SCHEDULER_EVENTS.HEARTBEAT, { timestamp: this.lastHeartbeat });
      const tableName = DATABASE_TABLES.TASKS;

      // Check for timed-out RUNNING tasks - fail them and schedule retry
      const timeoutResult = await this.db.query<{
        id: string;
        title: string;
        timeout_seconds: number | null;
      }>(
        `SELECT id, title, timeout_seconds 
       FROM ${tableName} 
       WHERE status = $1 
       AND started_at IS NOT NULL 
       AND timeout_seconds IS NOT NULL
       AND NOW() - started_at > (timeout_seconds || ' seconds')::INTERVAL`,
        [TASK_STATUS.RUNNING]
      );

      for (const timedOutTask of timeoutResult.rows) {
        const timeoutSec = timedOutTask.timeout_seconds ?? 300;
        logger.warn(
          `Task "${timedOutTask.title}" (${timedOutTask.id}) timed out after ${timeoutSec}s`
        );

        await this.db.query(
          `UPDATE ${tableName} SET status = $1, error = $2, updated_at = NOW() 
         WHERE id = $3`,
          [TASK_STATUS.PENDING, `Timeout after ${timeoutSec} seconds`, timedOutTask.id]
        );

        await this.logTaskStateChange(
          timedOutTask.id,
          timedOutTask.title,
          TASK_STATUS.RUNNING,
          TASK_STATUS.PENDING,
          `Timeout after ${timeoutSec}s - will retry`,
          { timeoutSec }
        );
      }

      // Prevent concurrent task execution - double check with database state
      if (this.isExecuting) {
        logger.debug('Scheduler heartbeat: Task already executing, skipping');
        return;
      }

      // Also check database for any running tasks as additional protection
      const runningCheck = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${tableName} WHERE status = $1`,
        [TASK_STATUS.RUNNING]
      );
      const runningCount = parseInt(runningCheck.rows[0]?.count || '0', 10);
      if (runningCount > 0) {
        logger.debug(`Scheduler heartbeat: ${runningCount} task(s) running in DB, skipping`);
      }

      standardMetrics.workerUtilization.set(runningCount > 0 ? 1 : 0);

      // Find and lock pending task atomically to prevent race conditions
      // Only select tasks whose dependencies are all COMPLETED
      // Also consider next_retry_at for scheduled retries
      // Priority: base priority + retry boost + aging factor + category weight
      const result = await this.db.query<{
        id: string;
        title: string;
        description: string;
        depends_on: string[];
        retry_count: number;
        max_retries: number;
        timeout_seconds: number | null;
        priority: number;
        created_at: Date;
      }>(
        `WITH eligible_tasks AS (
        SELECT 
          id, title, description, depends_on, retry_count, max_retries, timeout_seconds, priority, created_at,
          LEAST(FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 300), 10) as age_boost,
          COALESCE(retry_count, 0) * 2 as retry_boost,
          CASE 
            WHEN type = 'bugfix' THEN 5
            WHEN type = 'deployment' THEN 3
            WHEN type = 'analysis' THEN 2
            WHEN type = 'research' THEN -1
            ELSE 0
          end as type_weight,
          CASE 
            WHEN category = 'security' THEN 5
            WHEN category = 'bugfix' THEN 3
            WHEN category = 'performance' THEN 2
            WHEN category = 'feature' THEN 0
            ELSE 0
          end as category_weight
        FROM ${tableName} 
        WHERE status = $1 
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        AND (depends_on IS NULL OR depends_on = '{}'::uuid[] OR NOT EXISTS (
          SELECT 1 FROM tasks t 
          WHERE t.id = ANY(${tableName}.depends_on) 
          AND t.status != $2
        ))
      ),
      ranked AS (
        SELECT *, (priority + age_boost + retry_boost + type_weight + category_weight) as sort_score
        FROM eligible_tasks
        ORDER BY sort_score DESC, created_at ASC 
        LIMIT 1 
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${tableName} 
      SET status = $3, updated_at = NOW(), started_at = NOW(), priority = (SELECT priority + retry_boost + age_boost + type_weight + category_weight FROM ranked)
      WHERE id = (SELECT id FROM ranked)
      RETURNING id, title, description, type, depends_on, retry_count, max_retries, timeout_seconds`,
        [TASK_STATUS.PENDING, TASK_STATUS.COMPLETED, TASK_STATUS.RUNNING]
      );

      if (result.rows.length > 0) {
        const task = result.rows[0] as (typeof result.rows)[0] & { type?: string };
        if (task) {
          const retryCount = task.retry_count ?? 0;
          const maxRetries = task.max_retries ?? 3;
          const timeoutSec = task.timeout_seconds ?? 300;
          const timeoutInfo = task.timeout_seconds
            ? ` (timeout: ${timeoutSec}s)`
            : ' (default timeout: 300s)';
          logger.info(
            `Scheduler heartbeat: Found pending task "${task.title}" (id: ${task.id}), scheduling for execution (retry ${retryCount}/${maxRetries})${timeoutInfo}`
          );

          await this.logTaskStateChange(
            task.id,
            task.title,
            TASK_STATUS.PENDING,
            TASK_STATUS.RUNNING,
            retryCount > 0 ? `Retry ${retryCount}/${maxRetries}` : 'Task started',
            { retryCount, maxRetries, timeoutSec }
          );

          this.eventBus.publish(SCHEDULER_EVENTS.TASK_STARTED, {
            taskId: task.id,
            title: task.title,
            description: task.description,
            timestamp: new Date(),
          });

          // Execute task and wait for completion
          this.isExecuting = true;
          try {
            await this.onTaskReady?.(
              task.id,
              task.title,
              task.description,
              task.type,
              retryCount,
              maxRetries,
              timeoutSec
            );
            this.totalTasksExecuted++;
            logger.info(
              `Scheduler heartbeat: Task "${task.title}" (id: ${task.id}) completed successfully (total: ${this.totalTasksExecuted})`
            );
            this.lastTaskRun.set(task.id, new Date());

            this.consecutiveFailures = 0; // Reset failure count on success

            this.eventBus.publish(SCHEDULER_EVENTS.TASK_COMPLETED, {
              taskId: task.id,
              title: task.title,
              description: task.description,
              timestamp: new Date(),
            });
          } catch (err) {
            logger.error(
              `Scheduler heartbeat: Task "${task.title}" (id: ${task.id}) failed with error:`,
              err
            );
            this.consecutiveFailures++;

            this.eventBus.publish(SCHEDULER_EVENTS.TASK_FAILED, {
              taskId: task.id,
              title: task.title,
              description: task.description,
              timestamp: new Date(),
            });

            // Check if we need to pause
            if (this.consecutiveFailures >= SCHEDULER_CONFIG.MAX_CONSECUTIVE_FAILURES) {
              this.isPaused = true;
              this.pauseUntil = new Date(Date.now() + SCHEDULER_CONFIG.PAUSE_DURATION_MS);
              logger.warn(
                `Scheduler heartbeat: Too many failures (${this.consecutiveFailures}), pausing for ${SCHEDULER_CONFIG.PAUSE_DURATION_MS / 1000} seconds`
              );
              this.eventBus.publish(SCHEDULER_EVENTS.PAUSED, {
                taskId: task.id,
                title: task.title,
                pauseUntil: this.pauseUntil,
                timestamp: new Date(),
              });
            }

            // Reset to PENDING for retry (with delay handled by failure count)
            // Also boost priority to prevent starvation
            const errorMessage = err instanceof Error ? err.message : String(err);
            const retryCountForLog = (task.retry_count ?? 0) + 1;
            const priorityBoost = retryCountForLog * 2; // +2 per retry
            await this.db.query(
              `UPDATE ${tableName} SET status = $1, error = $2, retry_count = $3, priority = priority + $4 WHERE id = $5`,
              [TASK_STATUS.PENDING, errorMessage, retryCountForLog, priorityBoost, task.id]
            );

            await this.logTaskStateChange(
              task.id,
              task.title,
              TASK_STATUS.RUNNING,
              TASK_STATUS.PENDING,
              `Retry needed: ${errorMessage}`,
              {
                retryCount: retryCountForLog,
                maxRetries: task.max_retries ?? 3,
                error: errorMessage,
                priorityBoost,
              }
            );
          } finally {
            this.isExecuting = false;
          }
        }
      } else {
        logger.info('Scheduler heartbeat: No pending tasks found');
      }
    } finally {
      this.isHeartbeatRunning = false;
    }
  }

  onTaskReady?: (
    taskId: string,
    title: string,
    description?: string,
    taskType?: string,
    retryCount?: number,
    maxRetries?: number,
    timeoutSeconds?: number
  ) => void;

  async scheduleTask(task: ScheduledTask, maxRetries?: number): Promise<string> {
    const tableName = DATABASE_TABLES.TASKS;
    const id = task.id;
    const data = JSON.stringify(task.data);
    const now = new Date();
    const retries = maxRetries ?? TASK_CONFIG.DEFAULT_MAX_RETRIES;
    const projectId = task.projectId ?? null;

    await this.db.query(
      `INSERT INTO ${tableName} (id, project_id, status, data, max_retries, created_at, updated_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET data = $4, max_retries = $5, project_id = $2, updated_at = $7`,
      [id, projectId, TASK_STATUS.PENDING, data, retries, now, now, 'scheduler']
    );

    if (task.intervalMs) {
      this.scheduleRecurringTask(id, task.intervalMs);
    }

    return id;
  }

  private scheduleRecurringTask(taskId: string, intervalMs: number): void {
    const timer = setInterval(async () => {
      try {
        const tableName = DATABASE_TABLES.TASKS;
        const now = new Date();
        await this.db.query(
          `UPDATE ${tableName} SET updated_at = $1 WHERE id = $2 AND status = $3`,
          [now, taskId, TASK_STATUS.PENDING]
        );
      } catch (err) {
        logger.error(`Scheduler recurring task (id: ${taskId}): Failed to update task:`, err);
      }
    }, intervalMs);
    this.recurringTaskTimers.set(taskId, timer);
  }

  isActive(): boolean {
    return this.isRunning;
  }

  isExecutingTask(): boolean {
    return this.isExecuting;
  }

  getLastHeartbeat(): Date | null {
    return this.lastHeartbeat;
  }

  getLastRun(): Date | null {
    return this.lastRun;
  }

  getLastTaskRun(taskId: string): Date | undefined {
    return this.lastTaskRun.get(taskId);
  }

  getAllLastTaskRuns(): Map<string, Date> {
    return new Map(this.lastTaskRun);
  }

  getTotalTasksExecuted(): number {
    return this.totalTasksExecuted;
  }

  getStats(): {
    totalTasks: number;
    lastHeartbeat: Date | null;
    isPaused: boolean;
    pauseUntil: Date | null;
  } {
    return {
      totalTasks: this.totalTasksExecuted,
      lastHeartbeat: this.lastHeartbeat,
      isPaused: this.isPaused,
      pauseUntil: this.pauseUntil,
    };
  }

  private async logTaskStateChange(
    taskId: string,
    taskTitle: string,
    previousStatus: string | null,
    newStatus: string,
    reason?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO task_audit_log (task_id, task_title, previous_status, new_status, reason, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          taskId,
          taskTitle,
          previousStatus,
          newStatus,
          reason || null,
          metadata ? JSON.stringify(metadata) : '{}',
        ]
      );
    } catch (error) {
      logger.warn('Failed to log task state change:', error);
    }
  }

  async completeTaskWithResult(taskId: string, result: Record<string, unknown>): Promise<void> {
    const tableName = DATABASE_TABLES.TASKS;

    if (this.encryption.isInitialized() && containsSensitiveData(result)) {
      const encrypted = encryptSensitiveFields(result, this.encryption);
      await this.db.query(
        `UPDATE ${tableName} SET status = $1, result = $2, encrypted_result = $3, encrypted_at = NOW(), completed_at = NOW(), updated_at = NOW() WHERE id = $4`,
        [TASK_STATUS.COMPLETED, null, JSON.stringify(encrypted), taskId]
      );
    } else {
      await this.db.query(
        `UPDATE ${tableName} SET status = $1, result = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`,
        [TASK_STATUS.COMPLETED, JSON.stringify(result), taskId]
      );
    }

    logger.info(`Task ${taskId} completed with result`);
  }

  async failTaskWithError(taskId: string, error: string): Promise<void> {
    const tableName = DATABASE_TABLES.TASKS;

    await this.db.query(
      `UPDATE ${tableName} SET status = $1, error = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [TASK_STATUS.FAILED, error, taskId]
    );

    logger.info(`Task ${taskId} failed with error: ${error}`);
  }

  async getTaskResult(
    taskId: string,
    userRole: string = 'user'
  ): Promise<Record<string, unknown> | null> {
    const tableName = DATABASE_TABLES.TASKS;

    const result = await this.db.query<{
      result: string | null;
      encrypted_result: string | null;
      status: TaskStatus;
    }>(`SELECT result, encrypted_result, status FROM ${tableName} WHERE id = $1`, [taskId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) return null;

    if (!this.encryption.isInitialized()) {
      return row.result ? JSON.parse(row.result) : null;
    }

    if (row.encrypted_result) {
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        logger.warn(`User role '${userRole}' denied access to encrypted task ${taskId} result`);
        return null;
      }

      try {
        const encrypted = JSON.parse(row.encrypted_result as string);
        return decryptSensitiveFields(encrypted, this.encryption);
      } catch (error) {
        logger.error(`Failed to decrypt task ${taskId} result:`, error);
        return null;
      }
    }

    return row.result ? JSON.parse(row.result) : null;
  }
}
