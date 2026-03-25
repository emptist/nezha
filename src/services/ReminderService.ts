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
    const pausedCount = await this.getPausedTaskCount();
    const now = Date.now();

    if (now - this.lastReminderTime < REMINDER_COOLDOWN_MS) {
      return;
    }

    await this.sendThoughtPrompt(pendingCount, pausedCount, 0);
    this.lastReminderTime = now;
    this.lastReminderTaskCount = pendingCount;
  }

  async remindNow(reason: string): Promise<void> {
    const pendingCount = await this.getPendingTaskCount();
    if (pendingCount === 0) {
      return;
    }

    await this.sendReminder(pendingCount, 0, reason);
    this.lastReminderTime = Date.now();
    this.lastReminderTaskCount = pendingCount;
  }

  private async getPendingTaskCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  private async getPausedTaskCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'PAUSED'`
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  private async getCompletedTodayCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'COMPLETED' AND completed_at >= CURRENT_DATE`
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

  private async sendReminder(
    pendingCount: number,
    pausedCount: number = 0,
    reason?: string
  ): Promise<void> {
    const tasks = await this.getTopPendingTasks();
    const taskList = tasks
      .map((t, i) => `${i + 1}. [P${t.priority}] ${t.title.substring(0, 50)}`)
      .join('\n');

    const reasonText = reason ? `\n📍 触发点: ${reason}` : '';
    const message = `📋 **${pendingCount} 个待处理任务** | ${pausedCount} 个已暂停
${reasonText}

${taskList}
${pendingCount > MAX_TASKS_TO_SHOW ? `\n... 还有 ${pendingCount - MAX_TASKS_TO_SHOW} 个` : ''}`;

    await this.broadcastService.sendBroadcast(message, { priority: 'normal' });
    logger.info(`[Reminder] Sent reminder: ${pendingCount} pending tasks`);
  }

  private async sendThoughtPrompt(
    pendingCount: number,
    pausedCount: number,
    completedToday: number = 0
  ): Promise<void> {
    const message = `🤖 **哪吒系统提醒** ⏰ 每 5 分钟

📊 当前状态: ${pendingCount} 待处理 | ${pausedCount} 已暂停 | ${completedToday} 今日完成

💡 **思考题** (任选一项):
1. 最近 2 小时有没有新的学习体会？用 \`nezha share <体会>\` 分享
2. 有没有发现 bug 或功能需求？用 \`nezha areflect "[ISSUE]..."\` 报告
3. 文档/知识点需要更新吗？（.memory/ 或 .tmp/nezha-memory/）
4. 跟 ../refers/ 中的 OpenClaw/Trae/pi 对比，有哪些不足？
5. 有没有代码可以评审？用 \`nezha review\`
6. 系统可以如何改进？用 \`nezha areflect "[PROMPT_UPDATE]..."\`

🚀 行动: 主动领取任务或创建新任务 (\`nezha areflect "[TASK]..."\`)

---
*没有任务时也要保持思考*`;

    await this.broadcastService.sendBroadcast(message, { priority: 'low' });
    logger.info('[Reminder] Sent thought prompt');
  }

  async forceRemind(): Promise<void> {
    const pendingCount = await this.getPendingTaskCount();
    if (pendingCount === 0) {
      logger.debug('[Reminder] No pending tasks to remind');
      return;
    }

    await this.sendReminder(pendingCount, 0, '手动触发');
    this.lastReminderTime = Date.now();
    this.lastReminderTaskCount = pendingCount;
  }
}
