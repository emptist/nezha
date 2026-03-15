import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, TASK_CONFIG, TASK_STATUS } from '../config/constants.js';
import { type Task, type TaskStatus, type QueryResult } from '../config/types.js';

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
  private isRunning: boolean = false;

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
        console.error('Scheduler heartbeat error:', err);
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
  }

  private async heartbeat(): Promise<void> {
    const tableName = DATABASE_TABLES.TASKS;
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${tableName} WHERE status = $1`,
      [TASK_STATUS.PENDING]
    );
      }

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
    setInterval(async () => {
      try {
        const tableName = DATABASE_TABLES.TASKS;
        const now = new Date();
        await this.db.query(
          `UPDATE ${tableName} SET updated_at = $1 WHERE id = $2 AND status = $3`,
          [now, taskId, TASK_STATUS.PENDING]
        );
      } catch (err) {
        console.error(`Error in recurring task ${taskId}:`, err);
      }
    }, intervalMs);
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
