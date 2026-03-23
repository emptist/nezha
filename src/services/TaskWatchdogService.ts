import { exec } from 'child_process';
import { promisify } from 'util';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, TASK_STATUS, WATCHDOG_CONFIG } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

export enum WatchdogEvent {
  TASK_STUCK = 'watchdog:task:stuck',
  TASK_KILLED = 'watchdog:task:killed',
  HEARTBEAT_MISSED = 'watchdog:heartbeat:missed',
  WATCHDOG_STARTED = 'watchdog:started',
  WATCHDOG_STOPPED = 'watchdog:stopped',
}

export interface WatchdogConfig {
  checkIntervalMs?: number;
  defaultTimeoutSeconds?: number;
  maxKillsPerTask?: number;
  gracePeriodMs?: number;
  enableProcessKill?: boolean;
}

export interface WatchdogTask {
  taskId: string;
  title: string;
  processId?: number;
  startedAt: Date;
  lastHeartbeat: Date;
  watchdogTimeoutSeconds: number;
  isKilled: boolean;
  killCount: number;
  stuckReported: boolean;
}

export interface WatchdogResult {
  killed: boolean;
  taskId: string;
  processId?: number;
  reason: string;
  timestamp: Date;
}

export class TaskWatchdogService extends EventEmitter {
  private readonly db: DatabaseClient;
  private readonly checkIntervalMs: number;
  private readonly defaultTimeoutSeconds: number;
  private readonly maxKillsPerTask: number;
  private readonly gracePeriodMs: number;
  private readonly enableProcessKill: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private trackedTasks: Map<string, WatchdogTask> = new Map();
  private processCache: Map<number, string> = new Map();

  constructor(db: DatabaseClient, config?: WatchdogConfig) {
    super();
    this.db = db;
    this.checkIntervalMs = config?.checkIntervalMs ?? WATCHDOG_CONFIG.CHECK_INTERVAL_MS;
    this.defaultTimeoutSeconds =
      config?.defaultTimeoutSeconds ?? WATCHDOG_CONFIG.DEFAULT_TIMEOUT_SECONDS;
    this.maxKillsPerTask = config?.maxKillsPerTask ?? WATCHDOG_CONFIG.MAX_KILLS_PER_TASK;
    this.gracePeriodMs = config?.gracePeriodMs ?? WATCHDOG_CONFIG.GRACE_PERIOD_MS;
    this.enableProcessKill = config?.enableProcessKill ?? WATCHDOG_CONFIG.ENABLE_PROCESS_KILL;
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('TaskWatchdogService already running');
      return;
    }

    this.isRunning = true;
    this.timer = setInterval(() => {
      this.checkStuckTasks().catch(err => {
        logger.error('Watchdog check failed:', err);
      });
    }, this.checkIntervalMs);

    logger.info(
      `TaskWatchdogService started (interval: ${this.checkIntervalMs}ms, default timeout: ${this.defaultTimeoutSeconds}s)`
    );
    this.emit(WatchdogEvent.WATCHDOG_STARTED);
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

    logger.info('TaskWatchdogService stopped');
    this.emit(WatchdogEvent.WATCHDOG_STOPPED);
  }

  async trackTask(
    taskId: string,
    title: string,
    processId?: number,
    timeoutSeconds?: number
  ): Promise<void> {
    const now = new Date();
    const timeout = timeoutSeconds ?? this.defaultTimeoutSeconds;

    const task: WatchdogTask = {
      taskId,
      title,
      processId,
      startedAt: now,
      lastHeartbeat: now,
      watchdogTimeoutSeconds: timeout,
      isKilled: false,
      killCount: 0,
      stuckReported: false,
    };

    this.trackedTasks.set(taskId, task);

    if (processId) {
      this.processCache.set(processId, taskId);
    }

    await this.db.query(
      `INSERT INTO stuck_tasks_tracking (task_id, process_id, started_at, last_heartbeat_at, watchdog_check_at, watchdog_timeout_seconds)
       VALUES ($1, $2, $3, $3, $3, $4)
       ON CONFLICT (task_id) DO UPDATE SET
         process_id = COALESCE($2, stuck_tasks_tracking.process_id),
         started_at = $3,
         last_heartbeat_at = $3,
         watchdog_check_at = $3,
         is_killed = false`,
      [taskId, processId, now, timeout]
    );

    logger.debug(`Watchdog tracking task: ${taskId} (timeout: ${timeout}s)`);
  }

  async updateHeartbeat(taskId: string): Promise<void> {
    const task = this.trackedTasks.get(taskId);
    if (task) {
      task.lastHeartbeat = new Date();
    }

    await this.db.query(
      `UPDATE stuck_tasks_tracking SET last_heartbeat_at = NOW() WHERE task_id = $1`,
      [taskId]
    );
  }

  async untrackTask(taskId: string): Promise<void> {
    const task = this.trackedTasks.get(taskId);
    if (task?.processId) {
      this.processCache.delete(task.processId);
    }
    this.trackedTasks.delete(taskId);

    await this.db.query(`DELETE FROM stuck_tasks_tracking WHERE task_id = $1`, [taskId]);
  }

  async getTrackedTasks(): Promise<WatchdogTask[]> {
    return Array.from(this.trackedTasks.values());
  }

  async getStuckTasksCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${DATABASE_TABLES.TASKS} WHERE is_stuck = true`
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  private async checkStuckTasks(): Promise<void> {
    if (!this.isRunning) return;

    const now = new Date();

    for (const [taskId, task] of this.trackedTasks) {
      const elapsedMs = now.getTime() - task.lastHeartbeat.getTime();
      const timeoutMs = task.watchdogTimeoutSeconds * 1000;

      if (elapsedMs > timeoutMs && !task.isKilled) {
        if (task.killCount >= this.maxKillsPerTask) {
          logger.warn(
            `Task ${taskId} exceeded max watchdog kills (${this.maxKillsPerTask}), marking as stuck`
          );
          await this.markTaskAsStuck(taskId, 'Max watchdog kills exceeded');
          continue;
        }

        if (!task.stuckReported) {
          logger.warn(`Task ${taskId} stuck (elapsed: ${elapsedMs}ms, timeout: ${timeoutMs}ms)`);
          this.emit(WatchdogEvent.TASK_STUCK, task);
          task.stuckReported = true;
        }

        const result = await this.killTask(taskId, task.processId, 'Heartbeat timeout');
        if (result.killed) {
          this.emit(WatchdogEvent.TASK_KILLED, result);
        }
      } else if (elapsedMs > timeoutMs * 0.8 && elapsedMs <= timeoutMs) {
        logger.debug(
          `Task ${taskId} approaching timeout (${Math.round(elapsedMs / 1000)}s/${task.watchdogTimeoutSeconds}s)`
        );
        this.emit(WatchdogEvent.HEARTBEAT_MISSED, { task, elapsedMs });
      }
    }
  }

  private async killTask(
    taskId: string,
    processId: number | undefined,
    reason: string
  ): Promise<WatchdogResult> {
    const result: WatchdogResult = {
      killed: false,
      taskId,
      processId,
      reason,
      timestamp: new Date(),
    };

    if (!this.enableProcessKill || !processId) {
      logger.debug(`Process kill disabled or no PID for task ${taskId}`);
      result.reason = 'Process kill disabled or no PID';
      return result;
    }

    try {
      const killed = await this.killProcess(processId);
      if (killed) {
        result.killed = true;
        logger.info(`Watchdog killed process ${processId} for task ${taskId}: ${reason}`);

        await this.db.query(`SELECT mark_process_terminated($1, 'terminated')`, [processId]);

        const task = this.trackedTasks.get(taskId);
        if (task) {
          task.killCount++;
          task.isKilled = true;
        }

        await this.db.query(`SELECT record_watchdog_kill($1, $2, $3, $4)`, [
          taskId,
          processId,
          reason,
          this.defaultTimeoutSeconds,
        ]);
      }
    } catch (error) {
      logger.error(`Failed to kill process ${processId} for task ${taskId}:`, error);
      result.reason = `Failed to kill: ${error instanceof Error ? error.message : String(error)}`;
    }

    return result;
  }

  private async killProcess(pid: number): Promise<boolean> {
    try {
      await execAsync(`kill -TERM ${pid}`);
      await new Promise(resolve => setTimeout(resolve, this.gracePeriodMs));

      try {
        await execAsync(`kill -0 ${pid}`);
        await execAsync(`kill -KILL ${pid}`);
        logger.debug(`Force killed process ${pid}`);
      } catch {
        logger.debug(`Process ${pid} terminated gracefully`);
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Operation not permitted')) {
        logger.warn(`Permission denied to kill process ${pid}`);
        return false;
      }
      if (message.includes(' ESRCH')) {
        logger.debug(`Process ${pid} already dead`);
        return true;
      }
      throw error;
    }
  }

  private async markTaskAsStuck(taskId: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE ${DATABASE_TABLES.TASKS} SET
         is_stuck = true,
         stuck_at = NOW(),
         status = $1,
         error = $2,
         updated_at = NOW()
       WHERE id = $3`,
      [TASK_STATUS.FAILED, `Task stuck: ${reason}`, taskId]
    );

    const task = this.trackedTasks.get(taskId);
    if (task) {
      task.isKilled = true;
    }

    await this.db.query(
      `INSERT INTO failure_alerts (alert_type, task_id, title, error_message, failure_count, threshold, alert_data)
       SELECT 'stuck_task', id, title, $2, 1, 1, $3
       FROM ${DATABASE_TABLES.TASKS} WHERE id = $1
       ON CONFLICT DO NOTHING`,
      [taskId, reason, JSON.stringify({ markedAsStuck: true })]
    );
  }

  async getWatchdogStats(): Promise<{
    trackedTasks: number;
    stuckTasks: number;
    killedTasks: number;
    totalKills: number;
  }> {
    const tracked = this.trackedTasks.size;

    const stuckResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${DATABASE_TABLES.TASKS} WHERE is_stuck = true`
    );
    const stuck = parseInt(stuckResult.rows[0]?.count || '0', 10);

    const killedResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM stuck_tasks_tracking WHERE is_killed = true`
    );
    const killed = parseInt(killedResult.rows[0]?.count || '0', 10);

    const totalKillsResult = await this.db.query<{ total: string }>(
      `SELECT COALESCE(SUM(watchdog_kills), 0) as total FROM ${DATABASE_TABLES.TASKS}`
    );
    const totalKills = parseInt(totalKillsResult.rows[0]?.total || '0', 10);

    return { trackedTasks: tracked, stuckTasks: stuck, killedTasks: killed, totalKills };
  }

  async getOrphanedProcesses(thresholdMinutes: number = 60): Promise<
    Array<{
      id: string;
      pid: number;
      taskId: string | null;
      command: string;
      spawnedAt: Date;
      ageMinutes: number;
    }>
  > {
    const result = await this.db.query<{
      id: string;
      pid: number;
      task_id: string | null;
      command: string;
      spawned_at: Date;
      age_minutes: number;
    }>(`SELECT * FROM find_orphaned_processes($1)`, [thresholdMinutes]);
    return result.rows.map(row => ({
      id: row.id,
      pid: row.pid,
      taskId: row.task_id,
      command: row.command,
      spawnedAt: row.spawned_at,
      ageMinutes: row.age_minutes,
    }));
  }

  async cleanupOrphanedProcess(pid: number): Promise<boolean> {
    try {
      const killed = await this.killProcess(pid);
      if (killed) {
        await this.db.query(`SELECT mark_process_terminated($1, 'orphaned')`, [pid]);
        logger.info(`Cleaned up orphaned process: ${pid}`);
      }
      return killed;
    } catch (error) {
      logger.error(`Failed to cleanup orphaned process ${pid}:`, error);
      return false;
    }
  }
}
