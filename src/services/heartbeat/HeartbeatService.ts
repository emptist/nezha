/**
 * @layer core
 * @description Heartbeat service for task scheduling and process monitoring
 *
 * Architecture:
 * - Core layer service, Nezha's primary functionality
 * - Does not depend on external AI systems
 * - Can run independently (internal AI execution only)
 * - See: docs/ARCHITECTURE.md
 *
 * Piano Extension:
 * - Piano extends this class to add task routing
 * - See: piano/src/services/PianoHeartbeatService.ts
 * - executeTask is protected for subclass override
 */
import { Scheduler } from '../../core/Scheduler.js';
import { AIProvider, AIProviderFactory } from '../ai/index.js';
import { DATABASE_TABLES, TASK_STATUS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import type { DatabaseClient } from '../../db/DatabaseClient.js';
import { ReminderService } from '../ReminderService.js';
import { NextStepAdvisor } from '../../plugins/NextStepAdvisor.js';
import { getPluginManager } from '../../core/PluginManager.js';
import { Config } from '../../config/Config.js';

export interface HeartbeatConfig {
  heartbeatIntervalMs?: number;
  taskTimeoutMs?: number;
  enableReminder?: boolean;
  enablePi?: boolean;
  // NOTE: Piano extends this via PianoHeartbeatService with TaskRouter
  // opencodeUrl?: string;
  // opencodeAuth?: { username: string; password: string };
}

export class HeartbeatService {
  protected readonly scheduler: Scheduler;
  protected readonly aiProvider: AIProvider;
  protected readonly db: DatabaseClient;
  protected readonly reminderService: ReminderService;
  protected readonly pluginManager = getPluginManager();
  protected readonly nextStepAdvisor: NextStepAdvisor;
  protected readonly config: HeartbeatConfig;

  constructor(db: DatabaseClient, config?: HeartbeatConfig) {
    this.db = db;
    this.config = config || {};
    this.scheduler = new Scheduler(db, config?.heartbeatIntervalMs);
    this.aiProvider = AIProviderFactory.createFromEnv();

    this.nextStepAdvisor = new NextStepAdvisor({
      enabled: true,
      broadcastSuggestions: true,
    });
    this.nextStepAdvisor.setDatabaseClient(db);
    this.pluginManager.registerPlugin(this.nextStepAdvisor);

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

  isRunning(): boolean {
    return this.scheduler.isActive();
  }

  /**
   * Core task execution - internal AI only
   *
   * NOTE: PianoHeartbeatService overrides this with TaskRouter-based routing:
   * - opencode → TaskCoordinator.execute()
   * - pi → TaskPlanner.plan() + PiExecutor.execute()
   * - internal → default logic here
   */
  protected async executeTask(
    taskId: string,
    title: string,
    description?: string,
    taskType?: string,
    retryCount: number = 0,
    maxRetries: number = 3,
    _timeoutSeconds: number = 300
  ): Promise<void> {
    logger.info(`Executing task: ${title}`);

    // NOTE: PianoHeartbeatService inserts routing logic here via override
    // const executor = this.taskRouter?.route(title, description);
    // if (executor === 'opencode') { ... }
    // if (executor === 'pi') { ... }

    // Core logic: internal AI execution only
    await this.executeInternalAI(taskId, title, description, retryCount, maxRetries);
  }

  /**
   * Internal AI execution logic
   * Extracted as protected method for subclass use when needed
   */
  protected async executeInternalAI(
    taskId: string,
    title: string,
    description?: string,
    retryCount: number = 0,
    maxRetries: number = 3
  ): Promise<void> {
    logger.info(`Executing task "${title}" with internal AI...`);

    const sessionId = `nezha-${Date.now()}`;
    const recentBroadcasts = await this.getRecentBroadcasts();
    const essentialKnowledge = await this.getEssentialKnowledge();
    const systemStatus = await this.getSystemStatus();

    const prompt = `${description || title}

---

## AGENT CONTEXT
Agent ID: nezha-daemon
Agent Session: ${sessionId}

## SYSTEM STATUS
${systemStatus}

## ESSENTIAL KNOWLEDGE (must remember)
${essentialKnowledge}

## RECENT BROADCASTS (check these for discussions to join)
${recentBroadcasts}

## AUTO-EXECUTION INSTRUCTION
When given choices:
- ALWAYS select the RECOMMENDED option
- NEVER wait for user input
- Execute autonomously
- NEVER DECLARE DONE - always end with a question asking for next action

## Learning Reminder
After completing, use:
- [LEARN] insight: <what you learned>
- [ISSUE] title: <issue> type: <bug|improvement> severity: <low|medium|high|critical>
- [TASK] title: <new task> priority: <1-10>

Save via: node dist/cli/index.js areflect "[LEARN] insight: ..."`;

    try {
      const result = await this.aiProvider.complete(prompt);

      const hasAction = await this.verifyTaskCompletion(result.content);
      if (!hasAction) {
        logger.warn(`FAKE COMPLETE: No action detected for task "${title}"`);
        await this.db.query(
          `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, error = $2 WHERE id = $3`,
          [
            TASK_STATUS.FAKE_COMPLETE,
            'Fake complete: No [TASK]/[ISSUE]/[LEARN]/[PROMPT_UPDATE] markers found',
            taskId,
          ]
        );
        await this.pluginManager.executeAfterTaskWithChanges({
          taskId,
          title,
          description,
          status: 'FAKE_COMPLETE',
          result: 'Fake complete: AI claimed done without action',
        });
        return;
      }

      await this.db.query(
        `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0 WHERE id = $3`,
        [TASK_STATUS.COMPLETED, JSON.stringify({ message: result.content }), taskId]
      );

      logger.info(`Task completed: ${title} (verified)`);

      await this.pluginManager.executeAfterTaskWithChanges({
        taskId,
        title,
        description,
        status: 'COMPLETED',
        result: result.content,
      });
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

  // Helper methods below, retained for core and subclass use

  private async getRecentBroadcasts(): Promise<string> {
    try {
      const result = await this.db.query<{
        id: string;
        from_ai: string;
        content: string;
        priority: string;
        created_at: Date;
      }>(
        `SELECT id, from_ai, content, priority, created_at
         FROM project_communications
         WHERE message_type = 'broadcast'
           AND created_at > NOW() - INTERVAL '1 hour'
         ORDER BY created_at DESC
         LIMIT 3`
      );

      if (result.rows.length === 0) {
        return '(No recent broadcasts)';
      }

      return result.rows
        .map(
          b =>
            `- [${b.priority || 'normal'}] ${b.from_ai}: ${b.content.substring(0, 150)}${b.content.length > 150 ? '...' : ''}`
        )
        .join('\n');
    } catch {
      return '(Unable to fetch broadcasts)';
    }
  }

  protected async getEssentialKnowledge(): Promise<string> {
    try {
      const result = await this.db.query<{ content: string }>(
        `SELECT content FROM agent_memories 
         WHERE agent_id = 'system' AND content_type = 'essential'
         ORDER BY importance DESC LIMIT 5`
      );
      return result.rows.map(r => r.content).join('\n\n');
    } catch {
      return '(No essential knowledge available)';
    }
  }

  protected async getSystemStatus(): Promise<string> {
    try {
      const tasksResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
      );
      const runningResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'RUNNING'`
      );
      return `Pending tasks: ${tasksResult.rows[0]?.count || 0}, Running: ${runningResult.rows[0]?.count || 0}`;
    } catch {
      return 'System status unavailable';
    }
  }

  private async verifyTaskCompletion(content: string): Promise<boolean> {
    const markers = ['[TASK]', '[ISSUE]', '[LEARN]', '[PROMPT_UPDATE]', '[ANNOUNCE]'];
    return markers.some(marker => content.includes(marker));
  }

  // NOTE: PianoHeartbeatService overrides this to extract and create subtasks from Pi output
  // protected async extractAndCreateTasks(output: string, parentTitle: string, options: { complexity: number }): Promise<void> {
  //   // Parse subtasks from Pi output and create them
  // }
}
