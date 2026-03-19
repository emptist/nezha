import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, LONGTASK_CONFIG } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

export enum PauseReason {
  MAX_RUNTIME = 'max_runtime',
  RESOURCE_THRESHOLD = 'resource_threshold',
  USER_REQUEST = 'user_request',
  SCHEDULED_MAINTENANCE = 'scheduled_maintenance',
  FAILURE_THRESHOLD = 'failure_threshold',
}

export interface LongTaskConfig {
  checkIntervalMs?: number;
  defaultMaxRuntimeSeconds?: number;
  defaultPauseDurationSeconds?: number;
  enableAutoResume?: boolean;
  progressReportIntervalMs?: number;
  minProgressIntervalMs?: number;
  minProgressPercent?: number;
}

export interface LongTask {
  taskId: string;
  title: string;
  startedAt: Date;
  maxRuntimeSeconds: number;
  elapsedSeconds: number;
  progressPercent: number;
  lastProgressAt?: Date;
  isLongRunning: boolean;
  isPaused: boolean;
  pauseReason?: PauseReason;
  pausedUntil?: Date;
}

export interface ProgressUpdate {
  taskId: string;
  progressPercent: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export class LongTaskManager extends EventEmitter {
  private readonly db: DatabaseClient;
  private readonly checkIntervalMs: number;
  private readonly defaultMaxRuntimeSeconds: number;
  private readonly defaultPauseDurationSeconds: number;
  private readonly enableAutoResume: boolean;
  private readonly progressReportIntervalMs: number;
  private readonly minProgressIntervalMs: number;
  private readonly minProgressPercent: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private longTasks: Map<string, LongTask> = new Map();
  private pausedTasks: Set<string> = new Set();

  constructor(db: DatabaseClient, config?: LongTaskConfig) {
    super();
    this.db = db;
    this.checkIntervalMs = config?.checkIntervalMs ?? LONGTASK_CONFIG.CHECK_INTERVAL_MS;
    this.defaultMaxRuntimeSeconds =
      config?.defaultMaxRuntimeSeconds ?? LONGTASK_CONFIG.DEFAULT_MAX_RUNTIME_SECONDS;
    this.defaultPauseDurationSeconds =
      config?.defaultPauseDurationSeconds ?? LONGTASK_CONFIG.DEFAULT_PAUSE_DURATION_SECONDS;
    this.enableAutoResume = config?.enableAutoResume ?? LONGTASK_CONFIG.ENABLE_AUTO_RESUME;
    this.progressReportIntervalMs =
      config?.progressReportIntervalMs ?? LONGTASK_CONFIG.PROGRESS_REPORT_INTERVAL_MS;
    this.minProgressIntervalMs =
      config?.minProgressIntervalMs ?? LONGTASK_CONFIG.MIN_PROGRESS_INTERVAL_MS;
    this.minProgressPercent = config?.minProgressPercent ?? LONGTASK_CONFIG.MIN_PROGRESS_PERCENT;
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('LongTaskManager already running');
      return;
    }

    this.isRunning = true;
    this.timer = setInterval(() => {
      this.checkLongTasks().catch(err => {
        logger.error('Long task check failed:', err);
      });
      this.checkAutoResume().catch(err => {
        logger.error('Auto resume check failed:', err);
      });
    }, this.checkIntervalMs);

    logger.info(
      `LongTaskManager started (interval: ${this.checkIntervalMs}ms, max runtime: ${this.defaultMaxRuntimeSeconds}s)`
    );
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    logger.info('LongTaskManager stopped');
  }

  async registerTask(
    taskId: string,
    title: string,
    options?: {
      maxRuntimeSeconds?: number;
      isLongRunning?: boolean;
      processId?: number;
    }
  ): Promise<void> {
    const now = new Date();
    const maxRuntime = options?.maxRuntimeSeconds ?? this.defaultMaxRuntimeSeconds;

    const task: LongTask = {
      taskId,
      title,
      startedAt: now,
      maxRuntimeSeconds: maxRuntime,
      elapsedSeconds: 0,
      progressPercent: 0,
      lastProgressAt: now,
      isLongRunning: options?.isLongRunning ?? maxRuntime > this.defaultMaxRuntimeSeconds,
      isPaused: false,
    };

    this.longTasks.set(taskId, task);

    await this.db.query(
      `UPDATE ${DATABASE_TABLES.TASKS} SET
         is_long_running = $2,
         started_at = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [taskId, task.isLongRunning, now]
    );

    logger.debug(`LongTaskManager registered task: ${taskId} (max runtime: ${maxRuntime}s)`);
  }

  async updateProgress(update: ProgressUpdate): Promise<void> {
    const task = this.longTasks.get(update.taskId);
    if (!task) {
      logger.warn(`Progress update for unknown task: ${update.taskId}`);
      return;
    }

    const now = new Date();
    task.progressPercent = update.progressPercent;
    task.lastProgressAt = now;

    await this.db.query(
      `UPDATE ${DATABASE_TABLES.TASKS} SET
         progress_percent = $2,
         last_progress_at = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [update.taskId, update.progressPercent, now]
    );

    this.emit('progress', update);
  }

  async unregisterTask(taskId: string): Promise<void> {
    this.longTasks.delete(taskId);
    this.pausedTasks.delete(taskId);

    await this.db.query(`DELETE FROM long_tasks_pause WHERE task_id = $1`, [taskId]);

    await this.db.query(
      `UPDATE ${DATABASE_TABLES.TASKS} SET
         is_long_running = false,
         updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );
  }

  async pauseTask(
    taskId: string,
    reason: PauseReason,
    options?: {
      pauseDurationSeconds?: number;
      resumeAt?: Date;
      autoResume?: boolean;
    }
  ): Promise<boolean> {
    const task = this.longTasks.get(taskId);
    if (!task) {
      logger.warn(`Cannot pause unknown task: ${taskId}`);
      return false;
    }

    if (task.isPaused) {
      logger.debug(`Task ${taskId} already paused`);
      return false;
    }

    const pauseDuration = options?.pauseDurationSeconds ?? this.defaultPauseDurationSeconds;
    const resumeAt = options?.resumeAt ?? new Date(Date.now() + pauseDuration * 1000);
    const autoResume = options?.autoResume ?? this.enableAutoResume;

    task.isPaused = true;
    task.pauseReason = reason;
    task.pausedUntil = resumeAt;
    this.pausedTasks.add(taskId);

    await this.db.query(`SELECT pause_long_task($1, $2, $3, $4, $5)`, [
      taskId,
      reason,
      resumeAt,
      autoResume,
      pauseDuration,
    ]);

    this.emit('paused', { taskId, reason, resumeAt });

    logger.info(
      `LongTaskManager paused task: ${taskId} (reason: ${reason}, resume at: ${resumeAt.toISOString()})`
    );
    return true;
  }

  async resumeTask(taskId: string): Promise<boolean> {
    const task = this.longTasks.get(taskId);
    if (!task) {
      logger.warn(`Cannot resume unknown task: ${taskId}`);
      return false;
    }

    if (!task.isPaused) {
      logger.debug(`Task ${taskId} not paused`);
      return false;
    }

    task.isPaused = false;
    task.pauseReason = undefined;
    task.pausedUntil = undefined;
    this.pausedTasks.delete(taskId);

    await this.db.query(`SELECT resume_task($1)`, [taskId]);

    this.emit('resumed', { taskId });

    logger.info(`LongTaskManager resumed task: ${taskId}`);
    return true;
  }

  private async checkLongTasks(): Promise<void> {
    if (!this.isRunning) return;

    const now = new Date();

    for (const [taskId, task] of this.longTasks) {
      if (task.isPaused) continue;

      task.elapsedSeconds = Math.floor((now.getTime() - task.startedAt.getTime()) / 1000);

      if (task.elapsedSeconds >= task.maxRuntimeSeconds) {
        logger.warn(
          `Task ${taskId} exceeded max runtime (${task.elapsedSeconds}s/${task.maxRuntimeSeconds}s)`
        );
        this.emit('maxRuntimeExceeded', task);

        await this.pauseTask(taskId, PauseReason.MAX_RUNTIME, {
          pauseDurationSeconds: this.defaultPauseDurationSeconds,
        });
      }

      if (task.lastProgressAt) {
        const progressAge = now.getTime() - task.lastProgressAt.getTime();
        if (
          progressAge > this.minProgressIntervalMs &&
          task.progressPercent < this.minProgressPercent
        ) {
          logger.debug(
            `Task ${taskId} progress stalled (${task.progressPercent}% in ${progressAge}ms)`
          );
          this.emit('progressStalled', { task, progressAge });
        }
      }
    }
  }

  private async checkAutoResume(): Promise<void> {
    if (!this.isRunning || !this.enableAutoResume) return;

    const result = await this.db.query<{ task_id: string; title: string }>(
      `SELECT task_id, title FROM get_auto_resumable_tasks() WHERE task_id = ANY($1)`,
      [Array.from(this.pausedTasks)]
    );

    for (const row of result.rows) {
      await this.resumeTask(row.task_id);
    }
  }

  async forceResumeAll(): Promise<number> {
    let count = 0;
    for (const taskId of this.pausedTasks) {
      if (await this.resumeTask(taskId)) {
        count++;
      }
    }
    return count;
  }

  async getPausedTasks(): Promise<LongTask[]> {
    return Array.from(this.longTasks.values()).filter(t => t.isPaused);
  }

  async getLongTasks(): Promise<LongTask[]> {
    return Array.from(this.longTasks.values());
  }

  async getLongTaskStats(): Promise<{
    total: number;
    running: number;
    paused: number;
    exceededMaxRuntime: number;
    avgProgress: number;
  }> {
    const tasks = Array.from(this.longTasks.values());
    const running = tasks.filter(t => !t.isPaused).length;
    const paused = tasks.filter(t => t.isPaused).length;
    const now = new Date();
    const exceededMaxRuntime = tasks.filter(
      t => !t.isPaused && (now.getTime() - t.startedAt.getTime()) / 1000 > t.maxRuntimeSeconds
    ).length;
    const avgProgress =
      tasks.length > 0
        ? Math.round(tasks.reduce((sum, t) => sum + t.progressPercent, 0) / tasks.length)
        : 0;

    return {
      total: tasks.length,
      running,
      paused,
      exceededMaxRuntime,
      avgProgress,
    };
  }

  isTaskPaused(taskId: string): boolean {
    return this.pausedTasks.has(taskId);
  }

  getTaskProgress(taskId: string): number | undefined {
    return this.longTasks.get(taskId)?.progressPercent;
  }
}
