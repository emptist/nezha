import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { BroadcastService } from './BroadcastService.js';
import { EventBus } from '../core/EventBus.js';
import { SCHEDULER_EVENTS } from '../core/Scheduler.js';
import { Config } from '../config/Config.js';

const REMINDER_COOLDOWN_MS = 2 * 60 * 1000;
const BLIND_LOOP_INTERVAL_MS = 2 * 60 * 1000;
const MAX_TASKS_TO_SHOW = 5;

export interface ReminderConfig {
  enableEventTriggers?: boolean;
  enableInterReviewCheck?: boolean;
  enableMemorySave?: boolean;
}

export class ReminderService {
  private readonly db: DatabaseClient;
  private broadcastService: BroadcastService | null = null;
  private readonly config: ReminderConfig;
  private lastReminderTime: number = 0;
  private blindLoopTimer: ReturnType<typeof setInterval> | null = null;
  private eventBus: EventBus | null = null;

  constructor(db: DatabaseClient, config: ReminderConfig = {}) {
    this.db = db;
    this.config = {
      enableEventTriggers: config.enableEventTriggers ?? true,
      enableInterReviewCheck: config.enableInterReviewCheck ?? true,
      enableMemorySave: config.enableMemorySave ?? true,
    };
  }

  async initialize(): Promise<void> {
    this.broadcastService = await BroadcastService.create(this.db);
    logger.info('[Reminder] BroadcastService initialized');
  }

  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
    if (this.config.enableEventTriggers) {
      this.subscribeToEvents();
    }
  }

  private subscribeToEvents(): void {
    if (!this.eventBus) return;

    this.eventBus.subscribe(SCHEDULER_EVENTS.TASK_COMPLETED, async (data: any) => {
      await this.onTaskCompleted(data);
    });

    this.eventBus.subscribe(SCHEDULER_EVENTS.TASK_FAILED, async (data: any) => {
      await this.onTaskFailed(data);
    });

    logger.info('[Reminder] Subscribed to EventBus events');
  }

  private async onTaskCompleted(data: { taskId?: string; title?: string }): Promise<void> {
    const message = `✅ **任务完成**: ${data.title || 'Unknown'}`;
    await this.notifyAI(message, 'low');
    await this.saveToMemory(`任务完成提醒: ${data.title || 'Unknown task'}`);
  }

  private async onTaskFailed(data: {
    taskId?: string;
    title?: string;
    error?: string;
  }): Promise<void> {
    const message = `❌ **任务失败**: ${data.title || 'Unknown'}
📍 请检查: ${data.error || 'Unknown error'}`;
    await this.notifyAI(message, 'high');
    await this.saveToMemory(
      `任务失败提醒: ${data.title || 'Unknown'}, 错误: ${data.error || 'Unknown'}`
    );
  }

  startBlindLoop(intervalMs: number = BLIND_LOOP_INTERVAL_MS): void {
    if (this.blindLoopTimer) {
      logger.warn('[Reminder] Blind loop already running');
      return;
    }

    logger.info(`[Reminder] Starting blind loop (interval: ${intervalMs / 1000}s)`);
    this.blindLoopTimer = setInterval(async () => {
      try {
        await this.periodicCheck();
      } catch (error) {
        logger.error('[Reminder] Blind loop error:', error);
      }
    }, intervalMs);

    this.periodicCheck().catch(err => logger.error('[Reminder] Initial check failed:', err));
  }

  stopBlindLoop(): void {
    if (this.blindLoopTimer) {
      clearInterval(this.blindLoopTimer);
      this.blindLoopTimer = null;
      logger.info('[Reminder] Blind loop stopped');
    }
  }

  private async periodicCheck(): Promise<void> {
    const now = Date.now();
    if (now - this.lastReminderTime < REMINDER_COOLDOWN_MS) {
      return;
    }

    const messages: string[] = [];

    const pendingTasks = await this.getPendingTaskCount();
    const pendingReviews = this.config.enableInterReviewCheck
      ? await this.getPendingReviewCount()
      : 0;
    const failedTasks = await this.getFailedTaskCount();

    if (pendingTasks > 0) {
      messages.push(`📋 ${pendingTasks} 个待处理任务`);
    }
    if (pendingReviews > 0) {
      messages.push(`🔍 ${pendingReviews} 个待处理 review`);
    }
    if (failedTasks > 0) {
      messages.push(`❌ ${failedTasks} 个失败任务`);
    }

    if (messages.length > 0) {
      const message = `⏰ **哪吒提醒** (每 1 分钟)\n\n${messages.join('\n')}\n\n💡 使用 \`nezha tasks\` 查看详情`;
      await this.notifyAI(message, 'normal');
      await this.saveToMemory(`周期性提醒: ${messages.join(', ')}`);
    }

    this.lastReminderTime = now;

    await this.cleanupOldBroadcasts();
  }

  private async cleanupOldBroadcasts(): Promise<void> {
    try {
      const result = await this.db.query(
        `DELETE FROM project_communications 
         WHERE message_type = 'broadcast' 
           AND created_at < NOW() - INTERVAL '7 days'`
      );
      if (result.rowCount && result.rowCount > 0) {
        logger.info(`[Reminder] Cleaned up ${result.rowCount} old broadcasts`);
      }
    } catch (error) {
      logger.debug('[Reminder] Broadcast cleanup failed:', error);
    }
  }

  private async notifyAI(message: string, priority: 'low' | 'normal' | 'high'): Promise<void> {
    if (!this.broadcastService) {
      logger.warn('[Reminder] BroadcastService not initialized');
      return;
    }
    await this.broadcastService.sendBroadcast(message, { priority });
    logger.info(`[Reminder] Notified AI: ${message.substring(0, 50)}...`);
  }

  private async saveToMemory(content: string): Promise<void> {
    if (!this.config.enableMemorySave) return;

    try {
      const agentId = Config.getInstance().getAgentId();
      await this.db.query(
        `INSERT INTO memory (content, tags, source, importance)
         VALUES ($1, $2, $3, $4)`,
        [content, ['reminder', 'system'], 'reminder-service', 5]
      );
    } catch (error) {
      logger.debug('[Reminder] Failed to save to memory:', error);
    }
  }

  private async getPendingTaskCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  private async getPendingReviewCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM inter_reviews WHERE status IN ('pending', 'in_progress')`
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  private async getFailedTaskCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours'`
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async forceRemind(): Promise<void> {
    await this.periodicCheck();
  }

  async remindIfNeeded(): Promise<void> {
    await this.periodicCheck();
  }

  async remindNow(reason: string): Promise<void> {
    const message = `📍 **提醒触发**: ${reason}`;
    await this.notifyAI(message, 'normal');
  }
}
