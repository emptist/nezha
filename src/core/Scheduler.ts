import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, SCHEDULER_CONFIG, TASK_CONFIG, TASK_STATUS } from '../config/constants.js';
import { type Task, type TaskStatus, type QueryResult } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { EventBus } from './EventBus.js';

export interface ScheduledTask {
  id: string;
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
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private recurringTaskTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isRunning: boolean = false;
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
    this.eventBus = eventBus ?? new EventBus();
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
      this.heartbeat().catch((err) => {
        logger.error('Scheduler heartbeat failed:', err);
      });
    }, this.heartbeatIntervalMs);
    await this.heartbeat();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const timer of this.recurringTaskTimers.values()) {
      clearInterval(timer);
    }
    this.recurringTaskTimers.clear();
  }

  private async heartbeat(): Promise<void> {
    // Check if paused
    if (this.isPaused && this.pauseUntil && new Date() < this.pauseUntil) {
      logger.info(`Scheduler heartbeat: Paused until ${this.pauseUntil.toISOString()}`);
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
    
    // Check for stuck RUNNING tasks - reset to PENDING for retry
    await this.db.query(
      `UPDATE ${tableName} SET status = $1, updated_at = NOW() 
       WHERE status = $2 AND updated_at < NOW() - INTERVAL '5 minutes'`,
      [TASK_STATUS.PENDING, TASK_STATUS.RUNNING]
    );
    
    // Find and lock pending task atomically to prevent race conditions
    const result = await this.db.query<{ id: string; title: string; description: string }>(
      `WITH locked_task AS (
        SELECT id, title, description 
        FROM ${tableName} 
        WHERE status = $1 
        ORDER BY priority DESC, created_at ASC 
        LIMIT 1 
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${tableName} 
      SET status = $2, updated_at = NOW() 
      WHERE id = (SELECT id FROM locked_task)
      RETURNING id, title, description`,
      [TASK_STATUS.PENDING, TASK_STATUS.RUNNING]
    );
    
    if (result.rows.length > 0) {
      const task = result.rows[0];
      logger.info(`Scheduler heartbeat: Found pending task "${task.title}" (id: ${task.id}), scheduling for execution`);
      
      this.eventBus.publish(SCHEDULER_EVENTS.TASK_STARTED, {
        taskId: task.id,
        title: task.title,
        description: task.description,
        timestamp: new Date(),
      });
      
      // Execute task and wait for completion
      try {
        await this.onTaskReady?.(task.id, task.title, task.description);
        this.totalTasksExecuted++;
        logger.info(`Scheduler heartbeat: Task "${task.title}" (id: ${task.id}) completed successfully (total: ${this.totalTasksExecuted})`);
        this.lastTaskRun.set(task.id, new Date());
        
        this.consecutiveFailures = 0; // Reset failure count on success
        
        this.eventBus.publish(SCHEDULER_EVENTS.TASK_COMPLETED, {
          taskId: task.id,
          title: task.title,
          description: task.description,
          timestamp: new Date(),
        });
      } catch (err) {
        logger.error(`Scheduler heartbeat: Task "${task.title}" (id: ${task.id}) failed with error:`, err);
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
          logger.warn(`Scheduler heartbeat: Too many failures (${this.consecutiveFailures}), pausing for ${SCHEDULER_CONFIG.PAUSE_DURATION_MS / 1000} seconds`);
          this.eventBus.publish(SCHEDULER_EVENTS.PAUSED, {
            taskId: task.id,
            title: task.title,
            pauseUntil: this.pauseUntil,
            timestamp: new Date(),
          });
        }
        
        // Reset to PENDING for retry (with delay handled by failure count)
        await this.db.query(
          `UPDATE ${tableName} SET status = $1, error = $2 WHERE id = $3`,
          [TASK_STATUS.PENDING, String(err), task.id]
        );
      }
    } else {
      logger.info('Scheduler heartbeat: No pending tasks found');
    }
  }

  onTaskReady?: (taskId: string, title: string, description?: string) => void;

  async scheduleTask(task: ScheduledTask): Promise<string> {
    const tableName = DATABASE_TABLES.TASKS;
    const id = task.id;
    const data = JSON.stringify(task.data);
    const now = new Date();

    await this.db.query(
      `INSERT INTO ${tableName} (id, status, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET data = $3, updated_at = $5`,
      [id, TASK_STATUS.PENDING, data, now, now]
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

  getStats(): { totalTasks: number; lastHeartbeat: Date | null; isPaused: boolean; pauseUntil: Date | null } {
    return {
      totalTasks: this.totalTasksExecuted,
      lastHeartbeat: this.lastHeartbeat,
      isPaused: this.isPaused,
      pauseUntil: this.pauseUntil,
    };
  }
}
