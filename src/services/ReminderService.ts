import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { BroadcastService } from './BroadcastService.js';

const REMINDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between reminders
const BLIND_LOOP_INTERVAL_MS = 5 * 60 * 1000; // Blind loop every 5 minutes
const MAX_TASKS_TO_SHOW = 5;

export class ReminderService {
  private readonly db: DatabaseClient;
  private readonly broadcastService: BroadcastService;
  private lastReminderTime: number = 0;
  private lastReminderTaskCount: number = 0;
  private blindLoopTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.broadcastService = new BroadcastService(db);
  }

  startBlindLoop(intervalMs: number = BLIND_LOOP_INTERVAL_MS): void {
    if (this.blindLoopTimer) {
      logger.warn('[Reminder] Blind loop already running');
      return;
    }

    logger.info(`[Reminder] Starting blind loop (interval: ${intervalMs / 1000}s)`);
    this.blindLoopTimer = setInterval(async () => {
      try {
        await this.remindIfNeeded();
      } catch (error) {
        logger.error('[Reminder] Blind loop error:', error);
      }
    }, intervalMs);

    // Also run once at start
    this.remindIfNeeded().catch(err => logger.error('[Reminder] Initial reminder failed:', err));
  }

  stopBlindLoop(): void {
    if (this.blindLoopTimer) {
      clearInterval(this.blindLoopTimer);
      this.blindLoopTimer = null;
      logger.info('[Reminder] Blind loop stopped');
    }
  }

  async remindIfNeeded(): Promise<void> {
    const pendingCount = await this.getPendingTaskCount();
    if (pendingCount === 0) {
      return;
    }

    const now = Date.now();
    if (now - this.lastReminderTime < REMINDER_COOLDOWN_MS) {
      return;
    }

    if (pendingCount === this.lastReminderTaskCount) {
      return;
    }

    await this.sendReminder(pendingCount);
    this.lastReminderTime = now;
    this.lastReminderTaskCount = pendingCount;
  }

  async remindNow(reason: string): Promise<void> {
    const pendingCount = await this.getPendingTaskCount();
    if (pendingCount === 0) {
      return;
    }

    await this.sendReminder(pendingCount, reason);
    this.lastReminderTime = Date.now();
    this.lastReminderTaskCount = pendingCount;
  }

  private async getPendingTaskCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  private async getTopPendingTasks(): Promise<{ title: string; priority: number }[]> {
    const result = await this.db.query<{ title: string; priority: number }>(
      `SELECT title, priority FROM tasks 
       WHERE status = 'PENDING' 
       ORDER BY priority DESC, created_at ASC 
       LIMIT $1`,
      [MAX_TASKS_TO_SHOW]
    );
    return result.rows;
  }

  private async sendReminder(pendingCount: number, reason?: string): Promise<void> {
    const tasks = await this.getTopPendingTasks();
    const taskList = tasks
      .map((t, i) => `${i + 1}. [P${t.priority}] ${t.title.substring(0, 50)}`)
      .join('\n');

    const reasonText = reason ? `\n📍 触发点: ${reason}` : '';
    const message = `📋 **${pendingCount} 个待处理任务**
${reasonText}

${taskList}
${pendingCount > MAX_TASKS_TO_SHOW ? `\n... 还有 ${pendingCount - MAX_TASKS_TO_SHOW} 个` : ''}`;

    await this.broadcastService.sendBroadcast(message, { priority: 'normal' });
    logger.info(`[Reminder] Sent reminder: ${pendingCount} pending tasks`);
  }

  async forceRemind(): Promise<void> {
    const pendingCount = await this.getPendingTaskCount();
    if (pendingCount === 0) {
      logger.debug('[Reminder] No pending tasks to remind');
      return;
    }

    await this.sendReminder(pendingCount, '手动触发');
    this.lastReminderTime = Date.now();
    this.lastReminderTaskCount = pendingCount;
  }
}
