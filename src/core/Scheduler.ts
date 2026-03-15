import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, TASK_CONFIG, TASK_STATUS } from '../config/constants.js';
import { type Task, type TaskStatus, type QueryResult } from '../config/types.js';

const timestamp = () => new Date().toISOString();

const log = {
  info: (msg: string, ...args: unknown[]) => console.log(`[${timestamp()}] [INFO] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[${timestamp()}] [ERROR] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[${timestamp()}] [WARN] ${msg}`, ...args),
};

export interface ScheduledTask {
  id: string;
  data: Record<string, unknown>;
  scheduledAt: Date;
  intervalMs?: number;
}

export class Scheduler {
  private readonly db: DatabaseClient;
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private recurringTaskTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isRunning: boolean = false;
  private consecutiveFailures: number = 0;
  private isPaused: boolean = false;
  private pauseUntil: Date | null = null;
  private lastHeartbeat: Date | null = null;
  private lastTaskRun: Map<string, Date> = new Map();

  constructor(db: DatabaseClient, heartbeatIntervalMs?: number) {
    this.db = db;
    this.heartbeatIntervalMs = heartbeatIntervalMs ?? TASK_CONFIG.DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat().catch((err) => {
        log.error('Scheduler heartbeat failed:', err);
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
      log.info(`Scheduler heartbeat: Paused until ${this.pauseUntil.toISOString()}`);
      return;
    }
    
    // Resume if pause time is over
    if (this.isPaused) {
      log.info('Scheduler heartbeat: Resuming after pause');
      this.isPaused = false;
      this.pauseUntil = null;
      this.consecutiveFailures = 0;
    }
    
    log.info('Scheduler heartbeat: Checking for pending tasks');
    this.lastHeartbeat = new Date();
    const tableName = DATABASE_TABLES.TASKS;
    
    // Check for stuck RUNNING tasks (older than 5 minutes) - reset to PENDING for retry
    await this.db.query(
      `UPDATE ${tableName} SET status = $1, updated_at = NOW() 
       WHERE status = 'RUNNING' AND updated_at < NOW() - INTERVAL '5 minutes'`,
      [TASK_STATUS.PENDING]
    );
    
    // Find pending task
    const result = await this.db.query<{ id: string; title: string; description: string }>(
      `SELECT id, title, description FROM ${tableName} WHERE status = $1 ORDER BY priority DESC, created_at ASC LIMIT 1`,
      [TASK_STATUS.PENDING]
    );
    
    if (result.rows.length > 0) {
      const task = result.rows[0];
      log.info(`Scheduler heartbeat: Found pending task "${task.title}" (id: ${task.id}), scheduling for execution`);
      
      // Mark task as running to avoid duplicate execution
      await this.db.query(
        `UPDATE ${tableName} SET status = 'RUNNING', updated_at = NOW() WHERE id = $1`,
        [task.id]
      );
      
      // Execute task and wait for completion
      try {
        await this.onTaskReady?.(task.id, task.title, task.description);
        log.info(`Scheduler heartbeat: Task "${task.title}" (id: ${task.id}) completed successfully`);
        this.lastTaskRun.set(task.id, new Date());
        
        // Mark task as completed
        await this.db.query(
          `UPDATE ${tableName} SET status = $1, updated_at = NOW() WHERE id = $2`,
          [TASK_STATUS.COMPLETED, task.id]
        );
        
        this.consecutiveFailures = 0; // Reset failure count on success
      } catch (err) {
        log.error(`Scheduler heartbeat: Task "${task.title}" (id: ${task.id}) failed with error:`, err);
        this.consecutiveFailures++;
        
        // Check if we need to pause
        if (this.consecutiveFailures >= 5) {
          this.isPaused = true;
          this.pauseUntil = new Date(Date.now() + 60 * 1000); // Pause for 1 minute
          log.warn(`Scheduler heartbeat: Too many failures (${this.consecutiveFailures}), pausing for 1 minute`);
        }
        
        // Reset to PENDING for retry (with delay handled by failure count)
        await this.db.query(
          `UPDATE ${tableName} SET status = $1, error = $2 WHERE id = $3`,
          [TASK_STATUS.PENDING, String(err), task.id]
        );
      }
    } else {
      log.info('Scheduler heartbeat: No pending tasks found');
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
        log.error(`Scheduler recurring task (id: ${taskId}): Failed to update task:`, err);
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

  getLastTaskRun(taskId: string): Date | undefined {
    return this.lastTaskRun.get(taskId);
  }

  getAllLastTaskRuns(): Map<string, Date> {
    return new Map(this.lastTaskRun);
  }
}
