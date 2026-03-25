import { Scheduler } from '../../core/Scheduler.js';
import { AIProvider, AIProviderFactory } from '../ai/index.js';
import { DATABASE_TABLES, TASK_STATUS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import type { DatabaseClient } from '../../db/DatabaseClient.js';
import { ReminderService } from '../ReminderService.js';

export interface HeartbeatConfig {
  heartbeatIntervalMs?: number;
  taskTimeoutMs?: number;
  enableReminder?: boolean;
}

export class HeartbeatService {
  private readonly scheduler: Scheduler;
  private readonly aiProvider: AIProvider;
  private readonly db: DatabaseClient;
  private readonly reminderService: ReminderService;

  constructor(db: DatabaseClient, config?: HeartbeatConfig) {
    this.db = db;
    this.scheduler = new Scheduler(db, config?.heartbeatIntervalMs);
    this.aiProvider = AIProviderFactory.createFromEnv();

    this.reminderService = new ReminderService(db, {
      enableEventTriggers: true,
      enableInterReviewCheck: true,
      enableMemorySave: true,
    });

    this.scheduler.onTaskReady = this.executeTask.bind(this);
  }

  async start(): Promise<void> {
    logger.info('Starting HeartbeatService...');

    await this.reminderService.initialize();
    this.reminderService.setEventBus(this.scheduler.getEventBus());
    this.reminderService.startBlindLoop();

    await this.scheduler.start();
    logger.info('HeartbeatService started with ReminderService');
  }

  async stop(): Promise<void> {
    this.reminderService.stopBlindLoop();
    this.scheduler.stop();
    logger.info('HeartbeatService stopped');
  }

  private async executeTask(
    taskId: string,
    title: string,
    description?: string,
    taskType?: string,
    retryCount: number = 0,
    maxRetries: number = 3,
    timeoutSeconds: number = 300
  ): Promise<void> {
    logger.info(`Executing task: ${title}`);

    const sessionId = `nezha-${Date.now()}`;
    const prompt = `${description || title}

---

## AGENT CONTEXT
Agent ID: nezha-daemon
Agent Session: ${sessionId}

## AUTO-EXECUTION INSTRUCTION
When given choices:
- ALWAYS select the RECOMMENDED option
- NEVER wait for user input
- Execute autonomously

## Learning Reminder
After completing, use:
- [LEARN] insight: <what you learned>
- [ISSUE] title: <issue> type: <bug|improvement> severity: <low|medium|high|critical>

Save via: node dist/cli/index.js areflect "[LEARN] insight: ..."`;

    try {
      const result = await this.aiProvider.complete(prompt);

      await this.db.query(
        `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0 WHERE id = $3`,
        [TASK_STATUS.COMPLETED, JSON.stringify({ message: result.content }), taskId]
      );

      logger.info(`Task completed: ${title}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Task failed: ${title}`, errorMessage);

      if (retryCount < maxRetries) {
        await this.db.query(
          `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, error = $2, retry_count = $3 WHERE id = $4`,
          [TASK_STATUS.PENDING, errorMessage, retryCount + 1, taskId]
        );
      } else {
        await this.db.query(
          `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, error = $2 WHERE id = $3`,
          [TASK_STATUS.FAILED, errorMessage, taskId]
        );
      }
    }
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }

  isRunning(): boolean {
    return this.scheduler.getEventBus() !== null;
  }
}
