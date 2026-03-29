/**
 * @layer core
 * @description 心跳服务，负责任务调度和进程监控
 *
 * 架构说明：
 * - 这是核心层服务，Nezha 的核心功能
 * - 不依赖外部 AI 系统
 * - 可以独立运行
 * - 参考：docs/ARCHITECTURE.md
 *
 * Piano 集成：
 * - 使用 TaskRouter 进行任务路由 (internal/opencode/pi)
 * - 复杂任务发给 OpenCode，简单任务内部处理
 */
import { Scheduler } from '../../core/Scheduler.js';
import { AIProvider, AIProviderFactory } from '../ai/index.js';
import { DATABASE_TABLES, TASK_STATUS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import type { DatabaseClient } from '../../db/DatabaseClient.js';
import { ReminderService } from '../ReminderService.js';
import { NextStepAdvisor } from '../../plugins/NextStepAdvisor.js';
import { getPluginManager } from '../../core/PluginManager.js';
import { TaskRouter } from '../../piano/router/TaskRouter.js';
import { TaskCoordinator } from '../../piano/coordinator/TaskCoordinator.js';
import { TaskPlanner } from '../../piano/planner/TaskPlanner.js';
import { PiExecutorWrapper } from '../../piano/executor/PiExecutorWrapper.js';
import { Config } from '../../config/Config.js';

export interface HeartbeatConfig {
  heartbeatIntervalMs?: number;
  taskTimeoutMs?: number;
  enableReminder?: boolean;
  enablePi?: boolean;
}

export class HeartbeatService {
  private readonly scheduler: Scheduler;
  private readonly aiProvider: AIProvider;
  private readonly db: DatabaseClient;
  private readonly reminderService: ReminderService;
  private readonly pluginManager = getPluginManager();
  private readonly nextStepAdvisor: NextStepAdvisor;
  private readonly taskRouter: TaskRouter;
  private readonly taskPlanner: TaskPlanner;
  private readonly taskCoordinator: TaskCoordinator | null = null;
  private readonly piExecutor: PiExecutorWrapper | null = null;
  private readonly config: HeartbeatConfig;

  constructor(db: DatabaseClient, config?: HeartbeatConfig) {
    this.db = db;
    this.config = config || {};
    this.scheduler = new Scheduler(db, config?.heartbeatIntervalMs);
    this.aiProvider = AIProviderFactory.createFromEnv();
    const enablePi = config?.enablePi ?? false;
    this.taskRouter = new TaskRouter({
      useOpenCode: true,
      usePi: enablePi,
      complexityThreshold: 999,
      selfCapability: 'pi',
    });

    this.taskPlanner = new TaskPlanner();

    const opencodeUrl = Config.getInstance().getTransportConfig().opencodeApiUrl;
    if (opencodeUrl) {
      this.taskCoordinator = new TaskCoordinator({
        opencodeUrl,
      });
    }

    if (enablePi) {
      this.piExecutor = new PiExecutorWrapper();
    }

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

  private async executeTask(
    taskId: string,
    title: string,
    description?: string,
    taskType?: string,
    retryCount: number = 0,
    maxRetries: number = 3,
    _timeoutSeconds: number = 300
  ): Promise<void> {
    logger.info(`Executing task: ${title}`);

    const executor = this.taskRouter.route(title, description);
    logger.info(`[TaskRouter] Routing "${title}" to: ${executor}`);

    let opencodeFailed = false;

    if (executor === 'opencode') {
      logger.info(`[TaskRouter] Task "${title}" routed to OpenCode - sending to OpenCode...`);

      if (this.taskCoordinator) {
        try {
          const result = await this.taskCoordinator.execute({
            id: taskId,
            title,
            description: description || '',
            priority: 5,
          });
          logger.info(
            `[TaskCoordinator] Result from OpenCode: ${result.result.substring(0, 100)}...`
          );

          await this.db.query(
            `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0 WHERE id = $3`,
            [TASK_STATUS.COMPLETED, JSON.stringify({ message: result.result }), taskId]
          );
          logger.info(`[TaskRouter] Task "${title}" completed via OpenCode`);
          return;
        } catch (error) {
          logger.error(`[TaskCoordinator] Failed:`, error);
          logger.info(`[TaskRouter] Falling back to internal AI for task "${title}"...`);
          opencodeFailed = true;
        }
      } else {
        opencodeFailed = true;
      }
    }

    if (executor === 'pi' && this.piExecutor) {
      logger.info(`[TaskRouter] Task "${title}" routed to Pi - checking delegation...`);

      const planned = this.taskPlanner.plan({
        id: taskId,
        title,
        description,
        priority: 5,
      });

      if (planned.shouldDelegate && planned.delegateTo) {
        logger.info(`[TaskPlanner] Task too complex for Pi, delegating to ${planned.delegateTo}`);
        await this.db.query(
          `UPDATE ${DATABASE_TABLES.TASKS} SET delegate_to = $1, complexity = $2 WHERE id = $3`,
          [planned.delegateTo, planned.complexity, taskId]
        );
        return;
      }

      const systemStatus = await this.getSystemStatus();
      const essentialKnowledge = await this.getEssentialKnowledge();
      const piPrompt = `## SYSTEM STATUS\n${systemStatus}\n\n## ESSENTIAL KNOWLEDGE\n${essentialKnowledge}\n\n## TASK\n${title}\n${description || ''}\n\nAfter completing, create subtasks in format: - task: <title>`;

      try {
        const result = await this.piExecutor.execute(piPrompt);
        logger.info(`[PiExecutor] Result: ${result.message.substring(0, 100)}...`);

        await this.db.query(
          `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0, complexity = $3 WHERE id = $4`,
          [
            TASK_STATUS.COMPLETED,
            JSON.stringify({ message: result.message, output: result.output }),
            planned.complexity,
            taskId,
          ]
        );

        await this.extractAndCreateTasks(result.output, title, {
          complexity: planned.complexity,
        });
        logger.info(`[TaskRouter] Task "${title}" completed via Pi`);
        return;
      } catch (error) {
        logger.error(`[PiExecutor] Failed:`, error);
        logger.info(`[TaskRouter] Falling back to internal AI for task "${title}"...`);
      }
    }

    if (executor !== 'opencode' || opencodeFailed) {
      logger.info(`[TaskRouter] Executing task "${title}" with internal AI...`);

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
          logger.warn(`[TaskRouter] FAKE COMPLETE: No action detected for task "${title}"`);
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
  }

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

  private async getSystemStatus(): Promise<string> {
    try {
      const pending = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
      );
      const failed = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours'`
      );
      const openIssues = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM issues WHERE status = 'open'`
      );
      const fakeComplete = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'FAKE_COMPLETE'`
      );

      const parts = [];
      const p = parseInt(pending.rows[0]?.count || '0', 10);
      const f = parseInt(failed.rows[0]?.count || '0', 10);
      const i = parseInt(openIssues.rows[0]?.count || '0', 10);
      const fc = parseInt(fakeComplete.rows[0]?.count || '0', 10);

      if (p > 0) parts.push(`- ${p} pending tasks`);
      if (f > 0) parts.push(`- ${f} failed tasks (24h)`);
      if (i > 0) parts.push(`- ${i} open issues`);
      if (fc > 0) parts.push(`- ${fc} fake completions (AI lied)`);

      return parts.length > 0 ? parts.join('\n') : '- System healthy';
    } catch {
      return '- Unable to fetch status';
    }
  }

  private async getEssentialKnowledge(): Promise<string> {
    try {
      const learnings = await this.db.query<{ content: string }>(
        `SELECT content FROM memory WHERE tags ? 'essential' ORDER BY importance DESC LIMIT 3`
      );
      if (learnings.rows.length > 0) {
        return learnings.rows.map(r => `- ${r.content.substring(0, 200)}`).join('\n');
      }
      return `- No essential knowledge recorded yet`;
    } catch {
      return `- Memory system unavailable`;
    }
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }

  isRunning(): boolean {
    return this.scheduler.getEventBus() !== null;
  }

  private async extractAndCreateTasks(
    piOutput: string,
    sourceTask: string,
    options?: { delegateTo?: string; complexity?: number }
  ): Promise<void> {
    const lines = piOutput.split('\n');
    const taskPattern = /^[-*]\s*(?:task|todo|任务)[:\s]+(.+)/i;
    let createdCount = 0;

    for (const line of lines) {
      const match = line.match(taskPattern);
      if (match && match[1]) {
        const taskTitle = match[1].trim();
        if (taskTitle.length > 3) {
          try {
            await this.db.query(
              `INSERT INTO tasks (title, description, priority, source, delegate_to, complexity) 
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                taskTitle,
                `From Pi planning: ${sourceTask}`,
                5,
                'pi-planner',
                options?.delegateTo || null,
                options?.complexity || 3,
              ]
            );
            createdCount++;
            logger.info(`[PiPlanner] Created task: ${taskTitle}`);
          } catch (error) {
            logger.warn(`[PiPlanner] Failed to create task: ${taskTitle}`, error);
          }
        }
      }
    }

    if (createdCount > 0) {
      logger.info(`[PiPlanner] Created ${createdCount} tasks from Pi output`);
    }
  }

  private async verifyTaskCompletion(aiResponse: string): Promise<boolean> {
    const text = aiResponse.toLowerCase();

    const hasTask = text.includes('[task]') || text.includes('[task]:') || text.includes('task:');
    const hasIssue =
      text.includes('[issue]') || text.includes('[issue]:') || text.includes('issue:');
    const hasLearn =
      text.includes('[learn]') || text.includes('[learn]:') || text.includes('learn:');
    const hasPromptUpdate = text.includes('[prompt_update]') || text.includes('[propose]');

    if (hasTask || hasIssue || hasLearn || hasPromptUpdate) {
      logger.info(
        `[Verification] Action detected - Task: ${hasTask}, Issue: ${hasIssue}, Learn: ${hasLearn}`
      );
      return true;
    }

    const actionKeywords = [
      'created',
      'updated',
      'fixed',
      'implemented',
      'added',
      'modified',
      'deleted',
      'refactored',
    ];
    const hasAction = actionKeywords.some(kw => text.includes(kw) && text.includes('success'));

    if (hasAction) {
      logger.info(`[Verification] Action keyword detected`);
      return true;
    }

    logger.warn(`[Verification] No action detected in AI response`);
    return false;
  }
}
