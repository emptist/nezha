import { config } from 'dotenv';
config();

import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { HeartbeatService } from '../services/heartbeat/index.js';
import { getCurrentSessionId } from '../services/AgentSessionService.js';
import { HealthServer } from '../services/HealthServer.js';
import { CheckpointService } from '../services/CheckpointService.js';
import { TASK_STATUS } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { cli, colors } from '../utils/cli.js';
import { setVerboseMode } from '../utils/verboseLogger.js';
import { AgentIdentityService, type AgentIdentity } from '../services/AgentIdentityService.js';
import { DaemonAutoStartService } from '../services/DaemonAutoStartService.js';
import {
  requestReviewFromAI,
  showReview,
  showReviewStats,
  respondToReview,
} from './InterReviewCommands.js';
import { MonitoringCommands } from './MonitoringCommands.js';
import { MeetingCommands, MeetingDbCommands } from './MeetingCommands.js';
import { ReviewManagementCommands } from './ReviewCommands.js';
import { IssueCommands } from './IssueCommands.js';
import {
  installLaunchAgent,
  startLaunchAgent,
  uninstallLaunchAgent,
  isLaunchAgentInstalled,
  isLaunchAgentLoaded,
  getLaunchAgentStatus,
  resolveLogPaths,
  DAEMON_LABEL,
} from '../daemon/launchd.js';
import path from 'node:path';

export let isVerbose = false;
export let transportMode: 'http' | 'cli' = 'http';
export let enableStream = false;
import {
  sanitizeTaskTitle,
  sanitizeTaskDescription,
  sanitizePriority,
} from '../utils/sanitization.js';

interface TaskRow {
  id: number;
  title: string;
  status: string;
  priority: number;
  tags?: string[];
  category?: string;
}

interface CountRow {
  count: string;
}

export class Cli {
  private config: Config;
  private db: DatabaseClient | null = null;
  private heartbeatService: HeartbeatService | null = null;
  private healthServer: HealthServer | null = null;
  private checkpointService: CheckpointService;
  private isShuttingDown: boolean = false;
  private readonly SHUTDOWN_TIMEOUT_MS: number = 30000;
  private readonly TASK_WAIT_TIMEOUT_MS: number = 20000;
  private monitoringCommands: MonitoringCommands | null = null;
  private meetingCommands: MeetingCommands | null = null;
  public agentIdentity: AgentIdentity | null = null;

  constructor() {
    this.config = Config.getInstance();
    this.checkpointService = new CheckpointService();
  }

  public async resolveAgentIdentity(): Promise<AgentIdentity | null> {
    if (this.agentIdentity) return this.agentIdentity;

    try {
      const db = await this.getDb();
      const identityService = new AgentIdentityService(db);
      this.agentIdentity = await identityService.resolve();
      console.log(`[AgentIdentity] Resolved: ${this.agentIdentity.id}`);
      return this.agentIdentity;
    } catch (error) {
      console.warn('[AgentIdentity] Failed to resolve:', error);
      return null;
    }
  }

  public async getDb(): Promise<DatabaseClient> {
    if (!this.db) {
      this.db = new DatabaseClient(this.config);
    }
    return this.db;
  }

  public async getMonitoringCommands(): Promise<MonitoringCommands> {
    if (!this.monitoringCommands) {
      const db = await this.getDb();
      this.monitoringCommands = new MonitoringCommands({ db });
    }
    return this.monitoringCommands;
  }

  public async getMeetingCommands(): Promise<MeetingCommands> {
    if (!this.meetingCommands) {
      const db = await this.getDb();
      this.meetingCommands = new MeetingCommands({ db });
    }
    return this.meetingCommands;
  }

  async start(): Promise<void> {
    const db = await this.getDb();

    // Auto-start daemon if not running
    const daemonService = new DaemonAutoStartService();
    const daemonStatus = await daemonService.ensureDaemonRunning();
    if (!daemonStatus.success) {
      cli.warn(`Daemon: ${daemonStatus.message}`);
    }

    // Resolve agent identity
    await this.resolveAgentIdentity();

    this.heartbeatService = new HeartbeatService(db, {
      heartbeatIntervalMs: this.config.getTaskConfig().heartbeatIntervalMs,
    });

    this.healthServer = new HealthServer(db, 4097);
    await this.healthServer.start();

    await this.heartbeatService.start();

    // Handle graceful shutdown - save state before exit
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress, forcing exit...');
        process.exit(1);
      }

      this.isShuttingDown = true;
      logger.info(`Graceful shutdown initiated (${signal})...`);

      // 1. Save checkpoint state
      logger.info('Saving checkpoint state...');
      await this.checkpointService.saveState();

      // 2. Wait for running tasks to complete (with timeout)
      logger.info('Waiting for running tasks to complete...');
      const runningTasks = await this.waitForRunningTasks(this.TASK_WAIT_TIMEOUT_MS);

      // 3. Stop services
      logger.info('Stopping services...');
      await this.stop();

      // 4. Log shutdown status
      logger.info(`Shutdown complete. Tasks waiting: ${runningTasks}`);
      logger.info(`State saved to: .tmp/nezha-state.json`);
    };

    process.on('SIGINT', async () => {
      await shutdown('SIGINT');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await shutdown('SIGTERM');
      process.exit(0);
    });
  }

  private async waitForRunningTasks(timeoutMs: number): Promise<number> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const db = await this.getDb();
      const result = await db.query<CountRow>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = $1`,
        [TASK_STATUS.RUNNING]
      );
      const runningCount = parseInt(result.rows[0]?.count ?? '0', 10);

      if (runningCount === 0) {
        return 0;
      }

      logger.debug(`Waiting for ${runningCount} running tasks to complete...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Timeout - return remaining running tasks
    const db = await this.getDb();
    const result = await db.query<CountRow>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = $1`,
      [TASK_STATUS.RUNNING]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async stop(): Promise<void> {
    logger.info('Stopping HeartbeatService...');
    if (this.heartbeatService) {
      await this.heartbeatService.stop();
    }

    logger.info('Stopping HealthServer...');
    if (this.healthServer) {
      await this.healthServer.stop();
    }

    logger.info('Closing database connection...');
    if (this.db) {
      await this.db.close();
    }

    logger.info('All services stopped');
  }

  async status(): Promise<void> {
    const db = await this.getDb();
    const result = await db.query<CountRow>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = $1`,
      [TASK_STATUS.PENDING]
    );
    const pendingCount = parseInt(result.rows[0]?.count ?? '0', 10);

    const localRunning = this.heartbeatService?.isRunning() ?? false;

    let daemonRunning: boolean;
    let daemonHealth: boolean;

    try {
      const response = await fetch('http://localhost:4097/health', {
        signal: AbortSignal.timeout(1000),
      });
      daemonHealth = response.ok;
    } catch {
      daemonHealth = false;
    }

    if (!daemonHealth) {
      const sessionResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM agent_sessions WHERE status = 'alive' AND last_heartbeat > NOW() - INTERVAL '5 minutes'`
      );
      daemonRunning = parseInt(sessionResult.rows[0]?.count ?? '0', 10) > 0;
    } else {
      daemonRunning = true;
    }

    if (localRunning) {
      console.log(`Heartbeat running: true (local)`);
    } else if (daemonRunning) {
      console.log(`Heartbeat running: true (daemon in background)`);
    } else {
      console.log(`Heartbeat running: false`);
    }
    console.log(`Pending tasks: ${pendingCount}`);
  }

  async health(): Promise<void> {
    const running = this.heartbeatService?.isRunning() ?? false;
    console.log('Heartbeat Service:', running ? 'running' : 'stopped');
  }

  async addTask(
    title: string,
    description: string,
    priority: number = 0,
    dependsOn?: string[],
    timeoutSeconds?: number,
    taskType?: string,
    assignedTo?: string,
    dryRun: boolean = false,
    templateName?: string,
    category?: string,
    jsonOutput: boolean = false,
    projectId?: string
  ): Promise<{ id: string; title: string } | undefined> {
    cli.step('Validating task input...');

    let finalTitle = title;
    let finalDescription = description;
    let finalPriority = priority;
    let finalTaskType = taskType;
    let finalTimeout = timeoutSeconds;
    const finalCategory = category;

    if (templateName) {
      const db = await this.getDb();
      const templateResult = await db.query<{
        name: string;
        description: string;
        priority: number;
        task_type: string;
        timeout_seconds: number;
      }>(
        `SELECT name, description, priority, task_type, timeout_seconds FROM task_templates WHERE name = $1`,
        [templateName]
      );

      if (templateResult.rows.length === 0) {
        cli.error(`Template not found: "${templateName}"`);
        console.log('\nAvailable templates:');
        await this.listTemplates();
        process.exit(1);
      }

      const template = templateResult.rows[0];
      if (!template) {
        cli.error('Template not found');
        process.exit(1);
        return;
      }
      finalTitle = (title || template.description.split('\n')[0]) ?? template.description;
      finalDescription = description || template.description;
      finalPriority = priority || template.priority;
      finalTaskType = taskType || template.task_type;
      finalTimeout = timeoutSeconds || template.timeout_seconds;
      cli.info(`Using template: ${template.name}`);
    }

    const titleResult = sanitizeTaskTitle(finalTitle);
    if (!titleResult.valid) {
      cli.error(`Invalid title: ${titleResult.error}`);
      process.exit(1);
    }

    const descResult = sanitizeTaskDescription(finalDescription);
    if (!descResult.valid) {
      cli.error(`Invalid description: ${descResult.error}`);
      process.exit(1);
    }

    const priorityResult = sanitizePriority(finalPriority);
    if (!priorityResult.valid) {
      cli.error(`Invalid priority: ${priorityResult.error}`);
      process.exit(1);
    }

    if (finalTimeout !== undefined && (isNaN(finalTimeout) || finalTimeout <= 0)) {
      cli.error(`Invalid timeout: ${finalTimeout}. Must be a positive number.`);
      process.exit(1);
    }

    const validTypes = [
      'analysis',
      'implementation',
      'documentation',
      'bugfix',
      'research',
      'testing',
      'deployment',
      'maintenance',
    ];
    if (finalTaskType && !validTypes.includes(finalTaskType)) {
      cli.error(`Invalid type: ${finalTaskType}. Valid types: ${validTypes.join(', ')}`);
      process.exit(1);
    }

    const taskData = {
      title: titleResult.sanitized,
      description: descResult.sanitized || '',
      priority: parseInt(priorityResult.sanitized || '0', 10),
      dependsOn: dependsOn || [],
      timeoutSeconds: finalTimeout,
      taskType: finalTaskType || 'implementation',
      assignedTo: assignedTo || null,
      category: finalCategory || null,
    };

    if (dryRun) {
      cli.dryRun('Would create task:');
      cli.dim(JSON.stringify(taskData, null, 2));
      return;
    }

    const db = await this.getDb();

    // Resolve agent identity before creating task
    await this.resolveAgentIdentity();

    const maxRetries = this.config.getTaskConfig().maxRetries;
    const taskId = crypto.randomUUID();
    const createdBy = this.agentIdentity?.id;
    const createdByIdentity = this.agentIdentity?.id || null;

    await db.query(
      `INSERT INTO tasks (id, project_id, title, description, status, priority, depends_on, max_retries, timeout_seconds, is_long_running, assigned_to, category, created_by, created_by_identity) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        taskId,
        projectId || null,
        taskData.title,
        taskData.description,
        TASK_STATUS.PENDING,
        taskData.priority,
        taskData.dependsOn,
        maxRetries,
        taskData.timeoutSeconds,
        taskData.timeoutSeconds && taskData.timeoutSeconds > 600,
        taskData.assignedTo,
        taskData.category,
        createdBy,
        createdByIdentity,
      ]
    );

    await db.query(
      `INSERT INTO task_audit_log (task_id, task_title, previous_status, new_status, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        taskId,
        taskData.title,
        null,
        TASK_STATUS.PENDING,
        'Task created',
        JSON.stringify({
          type: taskData.taskType,
          assignedTo: taskData.assignedTo,
          priority: taskData.priority,
          category: taskData.category,
        }),
      ]
    );

    await db.query(`SELECT auto_tag_task($1)`, [taskId]);
    if (!taskData.category) {
      await db.query(`SELECT auto_categorize_task($1)`, [taskId]);
    }

    let extras = '';
    if (dependsOn && dependsOn.length > 0) extras += ` (depends on: ${dependsOn.join(', ')})`;
    if (finalTimeout) extras += `, timeout: ${finalTimeout}s`;
    if (finalTaskType) extras += `, type: ${finalTaskType}`;
    if (assignedTo) extras += `, assigned: ${assignedTo}`;
    if (templateName) extras += `, template: ${templateName}`;
    if (taskData.category) extras += `, category: ${taskData.category}`;

    if (jsonOutput) {
      const result = await db.query<{
        id: string;
        title: string;
        status: string;
        priority: number;
        category: string;
        tags: string[];
        created_at: Date;
      }>(
        `SELECT id, title, status, priority, category, tags, created_at FROM tasks WHERE id = $1`,
        [taskId]
      );
      console.log(JSON.stringify(result.rows[0], null, 2));
      return;
    }

    cli.success(`Task created: "${taskData.title}"${extras}`);
    console.log(`   ID: ${taskId}`);
  }

  async listTemplates(): Promise<void> {
    const db = await this.getDb();
    const result = await db.query<{
      name: string;
      description: string;
      priority: number;
      task_type: string;
      timeout_seconds: number;
    }>(
      `SELECT name, description, priority, task_type, timeout_seconds FROM task_templates ORDER BY priority DESC, name ASC`
    );

    if (result.rows.length === 0) {
      console.log('No templates found.');
      return;
    }

    console.log('\nAvailable task templates:\n');
    for (const t of result.rows) {
      console.log(`  ${t.name}`);
      console.log(`    ${t.description}`);
      console.log(
        `    priority: ${t.priority}, type: ${t.task_type}, timeout: ${t.timeout_seconds}s`
      );
      console.log();
    }
  }

  async addTemplate(
    name: string,
    description: string,
    priority: number = 0,
    taskType: string = 'implementation',
    timeoutSeconds: number = 300
  ): Promise<void> {
    if (!name || name.trim().length === 0) {
      cli.error('Template name is required');
      process.exit(1);
    }

    const db = await this.getDb();
    await db.query(
      `INSERT INTO task_templates (name, description, priority, task_type, timeout_seconds) 
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET description = $2, priority = $3, task_type = $4, timeout_seconds = $5, updated_at = NOW()`,
      [name.trim(), description.trim(), priority, taskType, timeoutSeconds]
    );

    cli.success(`Template "${name}" saved`);
  }

  async listCategoryRules(): Promise<void> {
    const db = await this.getDb();
    const result = await db.query<{ keyword: string; category: string; enabled: boolean }>(
      `SELECT keyword, category, enabled FROM auto_category_rules ORDER BY keyword ASC`
    );

    if (result.rows.length === 0) {
      cli.info('No category rules found.');
      return;
    }

    console.log('\nAuto-categorization rules:\n');
    cli.table(
      ['Keyword', 'Category', 'Enabled'],
      result.rows.map(row => [row.keyword, row.category, row.enabled ? 'yes' : 'no'])
    );
  }

  async addCategoryRule(keyword: string, category: string): Promise<void> {
    const validCategories = ['security', 'performance', 'feature', 'bugfix'];
    if (!validCategories.includes(category)) {
      cli.error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
      process.exit(1);
    }

    const db = await this.getDb();
    await db.query(
      `INSERT INTO auto_category_rules (keyword, category) VALUES ($1, $2)
       ON CONFLICT (keyword) DO UPDATE SET category = $2, enabled = true`,
      [keyword.toLowerCase().trim(), category]
    );

    cli.success(`Category rule added: "${keyword}" -> ${category}`);
  }

  async removeCategoryRule(keyword: string): Promise<void> {
    const db = await this.getDb();
    await db.query(`DELETE FROM auto_category_rules WHERE keyword = $1`, [keyword.toLowerCase()]);
    cli.success(`Category rule removed: "${keyword}"`);
  }

  async deleteTemplate(name: string): Promise<void> {
    if (!name || name.trim().length === 0) {
      cli.error('Template name is required');
      process.exit(1);
    }

    const db = await this.getDb();
    const result = await db.query(`DELETE FROM task_templates WHERE name = $1 RETURNING name`, [
      name.trim(),
    ]);

    if (result.rowCount === 0) {
      cli.error(`Template not found: "${name}"`);
      process.exit(1);
    }

    cli.success(`Template "${name}" deleted`);
  }

  async scheduleTask(
    name: string,
    description: string,
    cronExpression: string,
    priority: number = 0,
    dryRun: boolean = false
  ): Promise<void> {
    cli.step('Validating scheduled task...');

    if (!name || name.trim().length === 0) {
      cli.error('Task name is required');
      process.exit(1);
    }
    if (!cronExpression || cronExpression.trim().length === 0) {
      cli.error('Cron expression is required');
      process.exit(1);
    }

    const { Scheduler } = await import('../core/Scheduler.js');
    const validation = Scheduler.validateCronExpression(cronExpression.trim());
    if (!validation.valid) {
      cli.error(`Invalid cron expression: ${validation.error}`);
      process.exit(1);
    }

    const taskData = {
      name: name.trim(),
      description: description.trim(),
      cronExpression: cronExpression.trim(),
      priority,
      nextRun: validation.nextRun,
    };

    if (dryRun) {
      cli.dryRun('Would create scheduled task:');
      cli.dim(JSON.stringify(taskData, null, 2));
      return;
    }

    const db = await this.getDb();

    await db.query(
      `INSERT INTO scheduled_tasks (name, description, cron_expression, priority, next_run) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        taskData.name,
        taskData.description,
        taskData.cronExpression,
        taskData.priority,
        taskData.nextRun,
      ]
    );
    cli.success(`Scheduled task created: "${name}" (cron: ${cronExpression})`);
    if (taskData.nextRun) {
      cli.info(`First run: ${taskData.nextRun.toISOString()}`);
    }
  }

  async listScheduledTasks(enabledOnly: boolean = false): Promise<void> {
    const db = await this.getDb();

    const result = await db.query(`
      SELECT id, name, description, cron_expression, priority, enabled, last_run, next_run
      FROM scheduled_tasks
      ${enabledOnly ? 'WHERE enabled = true' : ''}
      ORDER BY priority DESC, next_run ASC
    `);

    if (result.rows.length === 0) {
      cli.info('No scheduled tasks found');
      return;
    }

    cli.header(`Scheduled Tasks (${result.rows.length})`);

    for (const row of result.rows) {
      const statusColor = row.enabled ? colors.green : colors.red;
      const status = `${statusColor}${row.enabled ? 'enabled' : 'disabled'}${colors.reset}`;
      const nextRun = row.next_run ? new Date(row.next_run).toLocaleString() : 'N/A';
      const lastRun = row.last_run ? new Date(row.last_run).toLocaleString() : 'Never';

      cli.info(`[${String(row.id).slice(0, 8)}...] ${String(row.name)}`);
      cli.dim(
        `  Cron: ${String(row.cron_expression)} | Priority: ${String(row.priority)} | ${status}`
      );
      cli.dim(`  Next: ${nextRun} | Last: ${lastRun}`);
      if (row.description) {
        const desc = String(row.description);
        cli.dim(`  ${desc.slice(0, 80)}${desc.length > 80 ? '...' : ''}`);
      }
      console.log();
    }
  }

  async toggleScheduledTask(id: string, enable: boolean): Promise<void> {
    const db = await this.getDb();

    const result = await db.query(
      'UPDATE scheduled_tasks SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING name',
      [enable, id]
    );

    if (result.rows.length === 0) {
      cli.error(`Scheduled task not found: ${id}`);
      process.exit(1);
    }

    const action = enable ? 'enabled' : 'disabled';
    const taskName = result.rows[0]?.name ?? 'unknown';
    cli.success(`Scheduled task "${String(taskName)}" ${action}`);
  }

  async deleteScheduledTask(id: string): Promise<void> {
    const db = await this.getDb();

    const result = await db.query('DELETE FROM scheduled_tasks WHERE id = $1 RETURNING name', [id]);

    if (result.rows.length === 0) {
      cli.error(`Scheduled task not found: ${id}`);
      process.exit(1);
    }

    const taskName = result.rows[0]?.name ?? 'unknown';
    cli.success(`Scheduled task "${String(taskName)}" deleted`);
  }

  async addContinuousImprovementTask(): Promise<void> {
    const description = `Continuous Improvement Cycle (PDCA + InterReview):

## Plan
1. Read HEARTBEAT.md to get task list
2. Prioritize tasks by importance

## Do
3. For each task:
   a. Execute the task
   b. Run tests/build
   c. Commit and push changes

## Check (with InterReview + SelfImprovement)
4. Request AI Inter-Review on the commit:
   - Use: nezha review --commit <hash> --task-id <id>
   - Review will extract learnings and save them to memory
   - Review learnings trigger SelfImprovementService (learn() + remember())
5. Review the learnings from InterReview:
   - Check for patterns in findings
   - Apply any critical fixes suggested
   - Check pending prompt suggestions: nezha prompt suggestions

## Act
6. If issues found, fix them
7. Update documentation if needed
8. Update HEARTBEAT.md with completed tasks and new tasks
9. Extract patterns from reviews using: memory_search with topic filter

## System Review - Compare with OpenClaw
10. Read docs/OPENCLAW_VS_NEZHA_CORRECT.md for comparison baseline
11. Check if Nezha features match or exceed OpenClaw:
    - Heartbeat mechanism (持续运行)
    - Task self-generation (任务自产生)
    - Memory system (记忆系统)
    - Skill system (技能系统)
    - InterReview (AI Code Review)
    - SelfImprovement (自动学习与提示词优化)
12. Identify areas where Nezha is behind OpenClaw
13. Create improvement tasks for gaps found
14. Document advantages Nezha has over OpenClaw (PostgreSQL, etc.)

## Report
15. Report what was accomplished, including:
    - Tasks completed
    - Reviews requested and scores
    - Learnings extracted
    - Prompt suggestions created
    - New patterns discovered`;

    await this.addTask('Continuous Improvement Cycle', description, 10);
  }

  async saveLearn(insight: string, context?: string, importance: number = 7): Promise<void> {
    const { SelfImprovementService } = await import('../services/SelfImprovementService.js');
    const db = await this.getDb();
    const service = new SelfImprovementService(db);

    const result = await service.learn({ insight, context, importance });
    cli.success(`Learning saved: ${result}`);
  }

  async listTasks(
    tag?: string,
    status?: string,
    category?: string,
    jsonOutput: boolean = false,
    showAll: boolean = false
  ): Promise<void> {
    const db = await this.getDb();

    // First, show summary counts
    const countResult = await db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status ORDER BY count DESC`
    );

    if (jsonOutput) {
      const query = this.buildTaskQuery(tag, status, category, showAll ? 1000 : 50);
      const result = await db.query<TaskRow>(query.query, query.params);
      console.log(JSON.stringify({ summary: countResult.rows, tasks: result.rows }, null, 2));
      return;
    }

    // Print summary
    console.log(`\n${colors.bright}Task Summary:${colors.reset}`);
    cli.table(
      ['Status', 'Count'],
      countResult.rows.map(r => [r.status, r.count])
    );

    // Then show tasks
    const query = this.buildTaskQuery(tag, status, category, showAll ? 1000 : 50);
    const result = await db.query<TaskRow>(query.query, query.params);

    if (result.rows.length === 0) {
      cli.info('\nNo tasks found with current filters');
      return;
    }

    console.log(`\n${colors.bright}Tasks:${colors.reset}\n`);
    cli.table(
      ['Status', 'Category', 'Title', 'Priority'],
      result.rows.map(row => [
        row.status,
        row.category || '-',
        row.title.substring(0, 40) + (row.title.length > 40 ? '...' : ''),
        row.priority.toString(),
      ])
    );
  }

  private buildTaskQuery(
    tag?: string,
    status?: string,
    category?: string,
    limit: number = 50
  ): { query: string; params: (string | number)[] } {
    let query = `SELECT id, title, status, priority, tags, category, created_at, completed_at FROM tasks WHERE 1=1`;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (tag) {
      query += ` AND $${paramIndex} = ANY(tags)`;
      params.push(tag);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    query += ` ORDER BY completed_at DESC NULLS LAST, created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    return { query, params };
  }

  async tableOfTasks(): Promise<void> {
    const db = await this.getDb();

    const result = await db.query<{
      status: string;
      title: string;
      priority: number;
      created_at: Date;
      completed_at: Date | null;
      retry_count: number;
    }>(`
      SELECT status, title, priority, created_at, completed_at, retry_count 
      FROM tasks 
      ORDER BY 
        CASE status 
          WHEN 'RUNNING' THEN 1 
          WHEN 'PENDING' THEN 2 
          WHEN 'COMPLETED' THEN 3 
          ELSE 4 
        END,
        priority DESC,
        created_at DESC
    `);

    if (result.rows.length === 0) {
      cli.info('No tasks found');
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let completedToday = 0;
    let completedYesterday = 0;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    for (const row of result.rows) {
      if (row.status === 'COMPLETED' && row.completed_at) {
        const completed = new Date(row.completed_at);
        if (completed >= today) completedToday++;
        else if (completed >= yesterday && completed < today) completedYesterday++;
      }
    }

    console.log(`\n${colors.bright}${'═'.repeat(70)}${colors.reset}`);
    console.log(
      `${colors.bright}  TABLE OF TASKS${colors.reset}`.padEnd(72) + `${colors.dim}|${colors.reset}`
    );
    console.log(`${colors.bright}${'═'.repeat(70)}${colors.reset}`);
    console.log(
      `  ${colors.cyan}Today:${colors.reset} ${colors.green}${completedToday}${colors.reset} completed`
    );
    console.log(`  ${colors.cyan}Yesterday:${colors.reset} ${completedYesterday} completed`);
    console.log(`  ${colors.cyan}Total:${colors.reset} ${result.rows.length} tasks`);
    console.log(`${colors.bright}${'-'.repeat(70)}${colors.reset}`);

    const statusCounts = new Map<string, number>();
    for (const row of result.rows) {
      statusCounts.set(row.status, (statusCounts.get(row.status) || 0) + 1);
    }
    console.log(
      `  ${colors.dim}Status:${colors.reset} ${Array.from(statusCounts.entries())
        .map(([s, c]) => `${s}:${c}`)
        .join(' | ')}`
    );
    console.log(`${colors.bright}${'-'.repeat(70)}${colors.reset}\n`);

    const statusColors: Record<string, string> = {
      RUNNING: colors.yellow,
      PENDING: colors.cyan,
      COMPLETED: colors.green,
      FAILED: colors.red,
    };

    console.log(
      `${colors.bright}#${colors.reset} ${colors.dim}Status${colors.reset}  ${colors.dim}Priority${colors.reset}  ${colors.bright}Title${colors.reset}`.padEnd(
        60
      ) + `${colors.dim}Result${colors.reset}`
    );
    console.log(`${colors.dim}${'─'.repeat(70)}${colors.reset}`);

    const maxShow = 20;
    const toShow = result.rows.slice(0, maxShow);

    toShow.forEach((row, i) => {
      const statusColor = statusColors[row.status] || colors.white;
      const title = row.title.substring(0, 45) + (row.title.length > 45 ? '...' : '');
      const result_emoji =
        row.status === 'COMPLETED'
          ? '✓'
          : row.status === 'RUNNING'
            ? '▶'
            : row.status === 'FAILED'
              ? '✗'
              : '○';
      const retryInfo = row.retry_count > 0 ? ` (${row.retry_count} retries)` : '';

      console.log(
        `${(i + 1).toString().padStart(2)}${colors.reset} ` +
          `${statusColor}${result_emoji}${row.status.padEnd(8)}${colors.reset}` +
          `${row.priority.toString().padStart(8)}` +
          `  ${title}`.padEnd(55) +
          `${colors.dim}${retryInfo}${colors.reset}`
      );
    });

    if (result.rows.length > maxShow) {
      console.log(
        `\n  ${colors.dim}... and ${result.rows.length - maxShow} more tasks${colors.reset}`
      );
    }

    console.log(
      `\n${colors.bright}${colors.dim}Updated: ${new Date().toLocaleTimeString()}${colors.reset}\n`
    );
  }

  async createApiKey(name: string, rateLimit: number = 100): Promise<void> {
    const db = await this.getDb();

    cli.step('Creating API key...');

    const result = await db.query<{ key: string }>(`SELECT create_api_key($1, $2) as key`, [
      name,
      rateLimit,
    ]);

    const apiKey = result.rows[0]?.key;

    if (apiKey) {
      cli.success(`API key created for "${name}"`);
      console.log(
        `\n${colors.yellow}IMPORTANT:${colors.reset} Save this key - it will not be shown again!`
      );
      console.log(`API Key: ${colors.cyan}${apiKey}${colors.reset}`);
      console.log(`Rate Limit: ${rateLimit} requests/minute\n`);
    } else {
      cli.error('Failed to create API key');
    }
  }

  async listApiKeys(): Promise<void> {
    const db = await this.getDb();

    const result = await db.query<{
      id: string;
      name: string;
      rate_limit: number;
      enabled: boolean;
      last_used: Date | null;
      created_at: Date;
    }>(
      `SELECT id, name, rate_limit, enabled, last_used, created_at FROM api_keys ORDER BY created_at DESC`
    );

    if (result.rows.length === 0) {
      cli.info('No API keys found');
      return;
    }

    cli.info(`Found ${result.rows.length} API key(s):\n`);
    cli.table(
      ['Name', 'Rate Limit', 'Enabled', 'Last Used', 'Created'],
      result.rows.map(row => [
        row.name,
        `${row.rate_limit}/min`,
        row.enabled ? 'Yes' : 'No',
        row.last_used ? new Date(row.last_used).toLocaleString() : 'Never',
        new Date(row.created_at).toLocaleString(),
      ])
    );
  }

  async revokeApiKey(name: string): Promise<void> {
    const db = await this.getDb();

    cli.step('Revoking API key...');

    const result = await db.query<{ count: string }>(
      `UPDATE api_keys SET enabled = false WHERE name = $1 RETURNING id`,
      [name]
    );

    if (result.rows.length > 0) {
      cli.success(`API key "${name}" has been revoked`);
    } else {
      cli.error(`API key "${name}" not found`);
    }
  }

  async createAutoTagRule(keyword: string, tag: string): Promise<void> {
    const db = await this.getDb();

    cli.step('Creating auto-tag rule...');

    await db.query(
      `INSERT INTO auto_tag_rules (keyword, tag) VALUES ($1, $2) ON CONFLICT (keyword) DO UPDATE SET tag = $2`,
      [keyword.toLowerCase(), tag.toLowerCase()]
    );

    cli.success(`Auto-tag rule created: "${keyword}" -> "${tag}"`);
  }

  async listAutoTagRules(): Promise<void> {
    const db = await this.getDb();

    const result = await db.query<{
      keyword: string;
      tag: string;
      enabled: boolean;
      created_at: Date;
    }>(`SELECT keyword, tag, enabled, created_at FROM auto_tag_rules ORDER BY created_at DESC`);

    if (result.rows.length === 0) {
      cli.info('No auto-tag rules found');
      return;
    }

    cli.info(`Found ${result.rows.length} auto-tag rule(s):\n`);
    cli.table(
      ['Keyword', 'Tag', 'Enabled'],
      result.rows.map(row => [row.keyword, row.tag, row.enabled ? 'Yes' : 'No'])
    );
  }

  async deleteAutoTagRule(keyword: string): Promise<void> {
    const db = await this.getDb();

    cli.step('Deleting auto-tag rule...');

    await db.query(`DELETE FROM auto_tag_rules WHERE keyword = $1`, [keyword.toLowerCase()]);

    cli.success(`Auto-tag rule "${keyword}" deleted`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';

  isVerbose = args.includes('--verbose');
  if (isVerbose) {
    setVerboseMode(true);
    logger.setContext({ verbose: true });
  }

  const transportIndex = args.indexOf('--transport');
  if (transportIndex !== -1 && transportIndex + 1 < args.length) {
    const transportValue = args[transportIndex + 1];
    if (transportValue === 'http' || transportValue === 'cli') {
      transportMode = transportValue;
    } else {
      cli.error(`Invalid transport mode: ${transportValue}. Valid modes: http, cli`);
      process.exit(1);
    }
  }

  enableStream = args.includes('--stream');

  const cliInstance = new Cli();

  try {
    switch (command) {
      case 'start':
        cli.info('Starting Nezha...');
        await cliInstance.start();
        break;

      case 'stop':
        cli.info('Stopping Nezha...');
        await cliInstance.stop();
        cli.success('Nezha stopped');
        break;

      case 'status':
        await cliInstance.status();
        break;

      case 'daemon': {
        const daemonService = new DaemonAutoStartService();
        const status = await daemonService.getStatus();

        console.log('Daemon Status:');
        console.log(`  Installed: ${status.installed ? '✅' : '❌'}`);
        console.log(`  Loaded:    ${status.loaded ? '✅' : '❌'}`);
        console.log(`  Running:   ${status.running ? '✅' : '❌'}`);
        if (status.pid) {
          console.log(`  PID:       ${status.pid}`);
        }

        if (!status.running) {
          cli.step('Starting daemon...');
          const result = await daemonService.ensureDaemonRunning();
          if (result.success) {
            cli.success('Daemon started');
          } else {
            cli.error(`Failed: ${result.message}`);
          }
        }
        break;
      }

      case 'install': {
        const isInstalled = await isLaunchAgentInstalled();
        await getLaunchAgentStatus();
        const logs = resolveLogPaths();

        if (isInstalled) {
          cli.info(`Nezha daemon is already installed (label: ${DAEMON_LABEL})`);
        } else {
          cli.info('Installing Nezha daemon as launchd service...');
        }

        cli.step('Creating log directory...');
        const fs = await import('node:fs/promises');
        await fs.mkdir(logs.logDir, { recursive: true });

        const daemonBin = path.resolve(process.cwd(), 'dist/daemon/index.js');
        const config = Config.getInstance();
        const envVars: Record<string, string> = {
          NEZHA_DB_HOST: process.env.NEZHA_DB_HOST || 'localhost',
          NEZHA_DB_PORT: process.env.NEZHA_DB_PORT || '5432',
          NEZHA_DB_NAME: process.env.NEZHA_DB_NAME || 'nezha',
          NEZHA_DB_USER: process.env.NEZHA_DB_USER || 'postgres',
          NEZHA_DB_PASSWORD: process.env.NEZHA_DB_PASSWORD || 'postgres',
          NEZHA_HEARTBEAT_INTERVAL: String(config.getTaskConfig().heartbeatIntervalMs),
          NEZHA_TRANSPORT_MODE: process.env.NEZHA_TRANSPORT_MODE || 'http',
        };

        const nodePath = process.execPath;

        const installResult = await installLaunchAgent({
          programArguments: [nodePath, daemonBin],
          workingDirectory: process.cwd(),
          stdoutPath: logs.stdoutPath,
          stderrPath: logs.stderrPath,
          environment: envVars,
        });

        if (!installResult.ok) {
          cli.error(`Installation failed: ${installResult.error}`);
          break;
        }

        cli.success(`Installed to ~/Library/LaunchAgents/${DAEMON_LABEL}.plist`);

        const startResult = await startLaunchAgent();
        if (startResult.ok) {
          cli.success('Daemon started. Check logs at: ' + logs.stdoutPath);
        } else {
          cli.warn(`Daemon not started: ${startResult.error}`);
          cli.info('To start manually: launchctl start ' + DAEMON_LABEL);
        }
        break;
      }

      case 'uninstall': {
        cli.info('Uninstalling Nezha daemon...');
        const result = await uninstallLaunchAgent();
        if (result.ok) {
          cli.success('Daemon uninstalled');
        } else {
          cli.error(`Uninstall failed: ${result.error}`);
        }
        break;
      }

      case 'setup-hooks': {
        const { execSync } = await import('child_process');
        const fs = await import('fs');
        const path = await import('path');

        const hookSource = path.join(process.cwd(), 'scripts', 'git-hooks', 'prepare-commit-msg');
        const hookTarget = path.join(process.cwd(), '.git', 'hooks', 'prepare-commit-msg');

        if (!fs.existsSync(hookSource)) {
          cli.error('Hook source not found: ' + hookSource);
          cli.info('Make sure you are running from the project root');
          break;
        }

        const gitHooksDir = path.dirname(hookTarget);
        if (!fs.existsSync(gitHooksDir)) {
          fs.mkdirSync(gitHooksDir, { recursive: true });
        }

        fs.copyFileSync(hookSource, hookTarget);
        execSync(`chmod +x "${hookTarget}"`);

        cli.success('Git hooks installed successfully!');
        console.log(`\n  Hook: prepare-commit-msg`);
        console.log(`  Location: ${hookTarget}`);
        console.log(`\n  This hook will automatically append [Agent: bot_xxx] to your commits.`);
        console.log(`  Run 'node dist/cli/index.js agents whoami' to see your agent ID.\n`);
        break;
      }

      case 'validate-commit': {
        const commitMsgFile = args[1];
        if (!commitMsgFile) {
          cli.error('Usage: nezha validate-commit <commit-msg-file>');
          process.exit(1);
        }

        const fs = await import('fs');
        if (!fs.existsSync(commitMsgFile)) {
          cli.error(`Commit message file not found: ${commitMsgFile}`);
          process.exit(1);
        }

        const commitMsg = fs.readFileSync(commitMsgFile, 'utf-8');
        const db = await cliInstance.getDb();

        const uuidPattern =
          /\[(task|issue|inter-review):\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;
        const matches = [...commitMsg.matchAll(uuidPattern)];

        if (matches.length === 0) {
          cli.error('Commit message must contain one of:');
          cli.error('  [task: <uuid>] - Task ID');
          cli.error('  [issue: <uuid>] - Issue ID');
          cli.error('  [inter-review: <uuid>] - Inter-review ID (评审结果)');
          cli.error('');
          cli.error(
            'Example: git commit -m "Fix bug [task: 43b880df-9d65-48b2-8747-495f310010c3]"'
          );
          cli.error('See: docs/DEVELOPER_GUIDE.md - Quality Control section for details');
          process.exit(1);
        }

        let valid = false;
        const errors: string[] = [];

        for (const match of matches) {
          const type = (match[1] || '').toLowerCase();
          const id = match[2] || '';

          let exists = false;
          if (type === 'task') {
            const result = await db.query(
              'SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1) as exists',
              [id]
            );
            exists = result.rows[0]?.exists ?? false;
          } else if (type === 'issue') {
            const result = await db.query(
              'SELECT EXISTS(SELECT 1 FROM issues WHERE id = $1) as exists',
              [id]
            );
            exists = result.rows[0]?.exists ?? false;
          } else if (type === 'inter-review') {
            const result = await db.query(
              'SELECT EXISTS(SELECT 1 FROM inter_reviews WHERE id = $1) as exists',
              [id]
            );
            exists = result.rows[0]?.exists ?? false;
          }

          if (exists) {
            valid = true;
          } else {
            errors.push(`  [${type}: ${id}] - Not found in database`);
          }
        }

        if (!valid) {
          cli.error('Invalid or non-existent IDs in commit message:');
          errors.forEach(e => cli.error(e));
          cli.error('');
          cli.error('All IDs must reference existing tasks, issues, or inter-reviews.');
          cli.error('See: docs/DEVELOPER_GUIDE.md - Quality Control section for details');
          process.exit(1);
        }

        console.log(
          `✓ Commit message validated (${matches.length} ID${matches.length > 1 ? 's' : ''} found)`
        );
        await db.close();
        process.exit(0);
        break;
      }

      case 'daemon-status': {
        const installed = await isLaunchAgentInstalled();
        const loaded = await isLaunchAgentLoaded();
        const status = await getLaunchAgentStatus();
        const logs = resolveLogPaths();

        console.log('\n  ' + colors.bright + 'Nezha Daemon Status' + colors.reset);
        console.log('  ' + '-'.repeat(40));
        console.log(
          `  Installed:  ${installed ? colors.green + 'Yes' + colors.reset : colors.yellow + 'No' + colors.reset}`
        );
        console.log(
          `  Loaded:     ${loaded ? colors.green + 'Yes' + colors.reset : colors.yellow + 'No' + colors.reset}`
        );
        console.log(
          `  Status:     ${status.status === 'running' ? colors.green : status.status === 'stopped' ? colors.yellow : colors.red}${status.status}${colors.reset}${status.pid ? ' (PID: ' + status.pid + ')' : ''}`
        );
        console.log(`  Label:      ${DAEMON_LABEL}`);
        console.log(`  Log:        ${logs.stdoutPath}`);
        console.log('');

        if (!installed) {
          cli.info('Run "nezha install" to install the daemon');
        } else if (!loaded) {
          cli.info('Run "launchctl start ' + DAEMON_LABEL + '" to start');
        }
        break;
      }

      case 'health':
        await cliInstance.health();
        break;

      case 'processes': {
        const { execSync } = await import('child_process');
        const subCmd = args[1];

        try {
          const output = execSync('ps aux | grep -E "opencode run" | grep -v grep', {
            encoding: 'utf-8',
          });
          const lines = output.trim().split('\n').filter(Boolean);

          if (subCmd === 'kill') {
            if (lines.length === 0) {
              console.log('No opencode run processes to kill');
            } else {
              execSync('pkill -f "opencode run --attach"', { encoding: 'utf-8' });
              console.log(`Killed ${lines.length} opencode run process(es)`);
            }
          } else {
            console.log(`\nOpenCode Run Processes: ${lines.length}\n`);
            if (lines.length > 0) {
              console.log('PID      CPU%   MEM%   COMMAND');
              console.log('-'.repeat(60));
              for (const line of lines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 11) {
                  const pid = parts[1] ?? '';
                  const cpu = parts[2] ?? '';
                  const mem = parts[3] ?? '';
                  const cmd = parts.slice(10).join(' ').substring(0, 40);
                  console.log(`${pid.padEnd(8)} ${cpu.padEnd(6)} ${mem.padEnd(6)} ${cmd}`);
                }
              }
              console.log('\nUsage: nezha processes kill  - Kill all opencode run processes');
            }
          }
        } catch {
          console.log('No opencode run processes found');
        }
        break;
      }

      case 'skill-sync': {
        const { traeSkillSyncService } = await import('../services/TraeSkillSyncService.js');
        const db = await cliInstance.getDb();
        traeSkillSyncService.setDatabaseClient(db);
        cli.step('Syncing skills to Trae...');
        const result = await traeSkillSyncService.syncToTrae();
        if (result.errors.length > 0) {
          cli.error(`Sync completed with ${result.errors.length} errors`);
          for (const err of result.errors) {
            console.log(`  - ${err}`);
          }
        } else {
          cli.success(`Synced ${result.synced} skills to .trae/skills/`);
        }
        break;
      }

      case 'task-add': {
        let title: string | undefined;
        let description = '';
        let priority = 0;
        let dependsOn: string[] | undefined;
        let timeoutSeconds: number | undefined;
        let taskType: string | undefined;
        let assignedTo: string | undefined;
        let templateName: string | undefined;
        let category: string | undefined;
        const dryRun = args.includes('--dry-run');
        const jsonOutput = args.includes('--json') || args.includes('--format=json');

        const templateIndex = args.indexOf('--template');
        if (templateIndex !== -1 && templateIndex + 1 < args.length) {
          const templateValue = args[templateIndex + 1];
          if (templateValue && !templateValue.startsWith('--')) {
            templateName = templateValue.toLowerCase();
          }
        }

        const priorityIndex = args.indexOf('--priority');
        if (priorityIndex !== -1 && priorityIndex + 1 < args.length) {
          const priorityValue = args[priorityIndex + 1];
          if (priorityValue && !priorityValue.startsWith('--')) {
            priority = parseInt(priorityValue, 10) || 0;
          }
        }

        const dependsOnIndex = args.indexOf('--depends-on');
        if (dependsOnIndex !== -1 && dependsOnIndex < args.length - 1) {
          dependsOn = args.slice(dependsOnIndex + 1).filter(a => !a.startsWith('--'));
        }

        const timeoutIndex = args.indexOf('--timeout');
        if (timeoutIndex !== -1 && timeoutIndex + 1 < args.length) {
          const timeoutValue = args[timeoutIndex + 1];
          if (timeoutValue && !timeoutValue.startsWith('--')) {
            timeoutSeconds = parseInt(timeoutValue, 10) || undefined;
          }
        }

        const typeIndex = args.indexOf('--type');
        if (typeIndex !== -1 && typeIndex + 1 < args.length) {
          const typeValue = args[typeIndex + 1];
          if (typeValue && !typeValue.startsWith('--')) {
            taskType = typeValue.toLowerCase();
          }
        }

        const assignIndex = args.indexOf('--assign');
        if (assignIndex !== -1 && assignIndex + 1 < args.length) {
          const assignValue = args[assignIndex + 1];
          if (assignValue && !assignValue.startsWith('--')) {
            assignedTo = assignValue;
          }
        }

        const catIndex = args.indexOf('--category');
        if (catIndex !== -1 && catIndex + 1 < args.length) {
          const catValue = args[catIndex + 1];
          if (catValue && !catValue.startsWith('--')) {
            const validCategories = ['security', 'performance', 'feature', 'bugfix'];
            if (!validCategories.includes(catValue.toLowerCase())) {
              cli.error(
                `Invalid category: ${catValue}. Valid categories: ${validCategories.join(', ')}`
              );
              process.exit(1);
            }
            category = catValue.toLowerCase();
          }
        }

        if (templateName) {
          title = args.find(
            (a, i) => i > 0 && i !== templateIndex && i !== templateIndex + 1 && !a.startsWith('--')
          );
          const titleIndex = args.findIndex(
            (a, i) => i > 0 && i !== templateIndex && i !== templateIndex + 1 && !a.startsWith('--')
          );
          if (titleIndex !== -1) {
            description = args.slice(titleIndex + 1).find(a => !a.startsWith('--')) || '';
          }
        } else {
          title = args[1];
          description = args[2] ?? '';
        }

        if (!title && !templateName) {
          cli.error('Task title or --template is required');
          console.log(
            '\nUsage: nezha task-add <title> [description] [--priority <n>] [--depends-on <uuid...>] [--timeout <seconds>] [--type <type>] [--assign <owner>] [--category <category>] [--template <name>] [--dry-run] [--json]'
          );
          console.log(
            '\nValid types: analysis, implementation, documentation, bugfix, research, testing, deployment, maintenance'
          );
          console.log('\nValid categories: security, performance, feature, bugfix');
          console.log('\nExamples:');
          console.log('  nezha task-add "Review PR #123" "Check for bugs" --priority 5');
          console.log(
            '  nezha task-add "Fix login" "Users cannot login" --type bugfix --assign agent-1'
          );
          console.log('  nezha task-add "Write docs" "API documentation" --type documentation');
          console.log(
            '  nezha task-add "Fix security vulnerability" "SQL injection in login" --category security'
          );
          console.log('  nezha task-add --template code-review "PR #123" "Review changes"');
          console.log('  nezha task-add "New task" "Description" --json');
          process.exit(1);
        }

        await cliInstance.addTask(
          title || '',
          description,
          priority,
          dependsOn,
          timeoutSeconds,
          taskType,
          assignedTo,
          dryRun,
          templateName,
          category,
          jsonOutput
        );
        break;
      }

      case 'schedule': {
        const name = args[1];
        const description = args[2] ?? '';
        const cronExpression = args[3];
        let priority = 0;
        const dryRun = args.includes('--dry-run');

        const priorityIndex = args.indexOf('--priority');
        if (priorityIndex !== -1 && priorityIndex < args.length - 1) {
          const priorityArg = args[priorityIndex + 1];
          priority = priorityArg ? parseInt(priorityArg, 10) || 0 : 0;
        }

        if (!name || !cronExpression) {
          cli.error('Task name and cron expression are required');
          console.log(
            '\nUsage: nezha schedule <name> <description> <cron> [--priority <n>] [--dry-run]'
          );
          console.log('\nExamples:');
          console.log('  nezha schedule "Daily Cleanup" "Clean up old data" "0 2 * * *"');
          process.exit(1);
        }

        await cliInstance.scheduleTask(name, description ?? '', cronExpression, priority, dryRun);
        break;
      }

      case 'continuous-improvement':
      case 'improve': {
        await cliInstance.addContinuousImprovementTask();
        break;
      }

      case 'reflection-stats': {
        const db = new DatabaseClient(Config.getInstance());

        const totalResult = await db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM memory WHERE source = 'reflection-parser'`
        );
        const total = parseInt(totalResult.rows[0]?.count || '0', 10);

        const byTagResult = await db.query<{ tag: string; count: string }>(
          `SELECT UNNEST(tags) as tag, COUNT(*) as count 
           FROM memory WHERE source = 'reflection-parser'
           GROUP BY tag ORDER BY count DESC LIMIT 10`
        );

        const sentimentResult = await db.query<{ sentiment: string; count: string }>(
          `SELECT metadata->>'sentiment' as sentiment, COUNT(*) as count 
           FROM memory WHERE 'sentiment' = ANY(tags)
           GROUP BY sentiment ORDER BY count DESC`
        );

        console.log('\n  Reflection System Statistics\n');
        console.log(`  Total Reflections: ${total}`);
        console.log('\n  By Category:');
        for (const row of byTagResult.rows.slice(0, 8)) {
          console.log(`    ${row.tag}: ${row.count}`);
        }
        console.log('\n  Sentiment:');
        for (const row of sentimentResult.rows) {
          console.log(`    ${row.sentiment || 'unknown'}: ${row.count}`);
        }
        console.log();

        await db.close();
        break;
      }

      case 'reflection-summary': {
        const db = new DatabaseClient(Config.getInstance());

        const today = new Date().toISOString().split('T')[0];

        const todayReflections = await db.query<{
          content: string;
          tags: string[];
          created_at: Date;
        }>(
          `SELECT content, tags, created_at FROM memory 
           WHERE source = 'reflection-parser' 
             AND DATE(created_at) = CURRENT_DATE
           ORDER BY created_at DESC LIMIT 20`
        );

        const tasksCompleted = await db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM tasks 
           WHERE status = 'COMPLETED' AND DATE(completed_at) = CURRENT_DATE`
        );

        console.log(`\n  Daily Reflection Summary - ${today}\n`);
        console.log(`  Tasks Completed Today: ${tasksCompleted.rows[0]?.count || 0}`);
        console.log(`  Reflections Today: ${todayReflections.rows.length}`);
        console.log('\n  Recent Learnings:');

        for (const row of todayReflections.rows.slice(0, 5)) {
          const preview = row.content.substring(0, 80).replace(/\n/g, ' ');
          console.log(`    - ${preview}...`);
        }

        console.log('\n  Top Categories:');
        const categories = await db.query<{ tag: string; count: string }>(
          `SELECT UNNEST(tags) as tag, COUNT(*) as count 
           FROM memory WHERE source = 'reflection-parser' AND DATE(created_at) = CURRENT_DATE
           GROUP BY tag ORDER BY count DESC LIMIT 5`
        );
        for (const row of categories.rows) {
          console.log(`    ${row.tag}: ${row.count}`);
        }
        console.log();

        await db.close();
        break;
      }

      case 'reflection-trends': {
        const db = new DatabaseClient(Config.getInstance());

        const dailyStats = await db.query<{
          date: Date;
          reflections: string;
          tasks_completed: string;
          positive: string;
          negative: string;
        }>(
          `SELECT 
             DATE(created_at) as date,
             COUNT(*) FILTER (WHERE source = 'reflection-parser') as reflections,
             COUNT(*) FILTER (WHERE source = 'reflection-parser' AND metadata->>'sentiment' = 'positive') as positive,
             COUNT(*) FILTER (WHERE source = 'reflection-parser' AND metadata->>'sentiment' = 'negative') as negative
           FROM memory 
           WHERE created_at > NOW() - INTERVAL '7 days'
           GROUP BY DATE(created_at)
           ORDER BY date DESC`
        );

        const taskStats = await db.query<{ date: Date; completed: string }>(
          `SELECT DATE(completed_at) as date, COUNT(*) as completed
           FROM tasks 
           WHERE completed_at > NOW() - INTERVAL '7 days' AND status = 'COMPLETED'
           GROUP BY DATE(completed_at)
           ORDER BY date DESC`
        );

        console.log('\n  Reflection Trends (Last 7 Days)\n');
        console.log('  Date        | Reflections | Positive | Negative | Tasks Done');
        console.log('  ------------|------------|----------|----------|----------');

        for (const day of dailyStats.rows) {
          const dateStr = new Date(day.date).toISOString().split('T')[0];
          const taskCount = taskStats.rows.find(
            t => new Date(t.date).toISOString().split('T')[0] === dateStr
          );
          console.log(
            `  ${dateStr}  | ${(day.reflections || '0').padStart(10)} | ${(day.positive || '0').padStart(8)} | ${(day.negative || '0').padStart(8)} | ${(taskCount?.completed || '0').padStart(9)}`
          );
        }
        console.log();

        await db.close();
        break;
      }

      case 'import-docs': {
        const { DocsImporter } = await import('../services/DocsImporter.js');
        const db = new DatabaseClient(Config.getInstance());
        const importer = new DocsImporter();
        importer.setDatabaseClient(db);
        console.log('\n  Importing docs to memory...\n');
        const result = await importer.importAll(path.join(process.cwd(), 'docs'));
        console.log(`  ✓ Imported: ${result.imported} docs`);
        console.log(`  - Skipped: ${result.skipped} docs (already imported)`);
        console.log();
        break;
      }

      case 'workflow-validate': {
        const { execSync } = await import('child_process');
        const db = new DatabaseClient(Config.getInstance());

        const changedFilesResult = execSync('git diff --name-only HEAD', { encoding: 'utf-8' });
        const changedFiles = changedFilesResult
          .trim()
          .split('\n')
          .filter((f: string) => f);

        if (changedFiles.length === 0) {
          console.log('No changes to validate.');
          await db.close();
          break;
        }

        console.log(`\n🔍 Validating workflow for ${changedFiles.length} changed file(s)...\n`);

        console.log('📋 Code changes must originate from ONE of: Issue, Task, or Inter-Review\n');

        const sourceChecks = {
          issue: { name: 'Issue', passed: false, message: '' },
          task: { name: 'Task', passed: false, message: '' },
          review: { name: 'Inter-Review', passed: false, message: '' },
        };

        const issueResult = await db.query(
          `SELECT id, title, issue_type, severity FROM issues WHERE status IN ('open', 'in_progress') ORDER BY created_at DESC LIMIT 5`
        );

        if (issueResult.rows.length > 0) {
          sourceChecks.issue.passed = true;
          sourceChecks.issue.message = `✓ Found ${issueResult.rows.length} active issue(s)`;
        } else {
          sourceChecks.issue.message = 'No active issues';
        }

        const taskResult = await db.query(
          `SELECT id, title, status FROM tasks WHERE status IN ('PENDING', 'RUNNING') ORDER BY priority DESC LIMIT 5`
        );

        if (taskResult.rows.length > 0) {
          sourceChecks.task.passed = true;
          sourceChecks.task.message = `✓ Found ${taskResult.rows.length} active task(s)`;
        } else {
          sourceChecks.task.message = 'No active tasks';
        }

        const hasValidSource =
          sourceChecks.issue.passed || sourceChecks.task.passed || sourceChecks.review.passed;

        console.log('');
        for (const check of Object.values(sourceChecks)) {
          console.log(`  ${check.message}`);
        }

        console.log('');
        if (hasValidSource) {
          console.log('✅ Source verified! Code change has valid origin (Issue/Task/Review).');

          const testFiles = changedFiles.filter(
            (f: string) => f.endsWith('.test.ts') || f.endsWith('.spec.ts')
          );
          if (testFiles.length > 0) {
            console.log(
              `\n✅ Tests: Found ${testFiles.length} test file(s): ${testFiles.join(', ')}`
            );
          } else {
            console.log('\n⚠️  Tests: No test files changed (recommended to add tests)');
          }

          console.log('\n✅ Ready to commit!');
        } else {
          console.log('❌ No valid source found! Code changes must originate from ONE of:');
          console.log('  - Issue:    nezha areflect "[ISSUE] title: ... type: bug severity: high"');
          console.log('  - Task:     nezha task-add "..."');
          console.log('  - Review:   Complete an inter-review');
          console.log('\n💡 Tip: At least one active Issue, Task, or pending Review is required.');
        }

        await db.close();
        break;
      }

      case 'share': {
        const text = args.slice(1).join(' ');
        if (!text) {
          console.log('Usage: nezha share <reflection text>');
          console.log('Example: nezha share "What worked well: Using natural format"');
          break;
        }

        const db = new DatabaseClient(Config.getInstance());
        const { BroadcastService } = await import('../services/BroadcastService.js');
        const broadcastService = await BroadcastService.create(db);

        await broadcastService.sendBroadcast(text, { priority: 'normal' });
        console.log('✓ Reflection broadcast to all AIs');

        await db.query(
          `INSERT INTO memory (content, tags, source, importance) VALUES ($1, ARRAY['reflection', 'broadcast'], 'areflect', 6)`,
          [text]
        );
        console.log('✓ Saved to memory');

        await db.close();
        break;
      }

      case 'learn': {
        const insight = args.slice(1).find(a => !a.startsWith('--')) || '';
        const contextIndex = args.indexOf('--context');
        const importanceIndex = args.indexOf('--importance');
        const context =
          contextIndex !== -1 && args[contextIndex + 1]
            ? String(args[contextIndex + 1])
            : undefined;
        const importance =
          importanceIndex !== -1 && args[importanceIndex + 1]
            ? parseInt(String(args[importanceIndex + 1]), 10) || 7
            : 7;

        if (!insight) {
          cli.error('Insight text is required');
          console.log(
            '\nUsage: nezha learn "Your insight here" [--context "When this applies"] [--importance 1-10]'
          );
          console.log('\nExamples:');
          console.log('  nezha learn "Always run typecheck after edits"');
          console.log(
            '  nezha learn "Cron expressions need croner library" --context "Scheduler enhancement"'
          );
          process.exit(1);
        }

        await cliInstance.saveLearn(insight, context, importance);
        break;
      }

      case 'prompt-suggest': {
        const current = args[1];
        const suggested = args[2];
        const reason = args[3];

        if (!current || !suggested) {
          cli.error('Current and suggested prompts are required');
          console.log('\nUsage: nezha prompt-suggest "current prompt" "suggested prompt" "reason"');
          console.log('\nExamples:');
          console.log(
            '  nezha prompt-suggest "Review code" "Review code and run tests" "Tests often missed"'
          );
          console.log(
            '  nezha prompt-suggest "Fix bug" "Fix bug and add test" "Prevent regression"'
          );
          process.exit(1);
        }

        const db = await cliInstance.getDb();
        await db.query(
          `INSERT INTO prompt_suggestions (id, current_prompt, suggested_prompt, reason, status)
           VALUES (gen_random_uuid(), $1, $2, $3, 'pending')`,
          [current, suggested, reason || null]
        );
        console.log(`✓ Saved prompt suggestion: ${suggested.substring(0, 50)}...`);
        break;
      }

      case 'areflect': {
        const text = args.slice(1).join(' ');
        if (args.includes('--check')) {
          const { AutonomousReflect } = await import('../../auto-reflect/dist/index.js');
          const reflect = new AutonomousReflect();
          await reflect.connect();
          const work = await reflect.checkPendingWork();
          console.log('\n📋 Pending Work Check:');
          console.log(`   Tasks: ${work.tasks}`);
          console.log(`   DLQ Items: ${work.dlq}`);
          console.log(`   Open Issues: ${work.issues}`);
          console.log(`   Has Work: ${work.hasWork ? '✅ Yes' : '❌ No'}`);
          await reflect.disconnect();
          process.exit(0);
        }
        if (args.includes('--learnings')) {
          const { AutonomousReflect } = await import('../../auto-reflect/dist/index.js');
          const reflect = new AutonomousReflect();
          await reflect.connect();
          const learnings = await reflect.getRecentLearnings(10);
          console.log('\n📚 Recent Learnings:');
          for (const item of learnings) {
            console.log(`   [${item.source}] ${item.content.substring(0, 80)}...`);
          }
          await reflect.disconnect();
          process.exit(0);
        }
        if (!text || text === '--help' || text === '-h') {
          console.log(`
areflect - All-in-One Reflection Command (THE most important command)

Usage: nezha areflect <text with markers>

Markers:
  [LEARN] insight: <learning> context: <optional context>
  [PROMPT_UPDATE] current: <text> suggested: <text> reason: <why>
  [ISSUE] title: <title> description: <desc> type: <bug|improvement> severity: <level>
  [ISSUE_RESOLVE] id: <uuid> resolution: <text>
  [ISSUE_COMMENT] id: <uuid> comment: <text> internal: <true|false>
  [TASK] title: <title> description: <desc> priority: <1-10> type: <implementation|review|research>
  [TASK_COMPLETE] id: <uuid> result: <optional result>
  [ANNOUNCE] message: <text> priority: <low|normal|high|critical> to: <agent-id>
  [SCHEDULE] title: <title> cron: <cron-expr> description: <desc> priority: <1-10>
  [OPINION] meetingId: <uuid> perspective: <text> reasoning: <why> position: support|oppose|neutral
  [REVIEW_RESPONSE] reviewId: <uuid> response: <text> accepted: <suggestions>

Commands:
  areflect "<text>"           Parse and save reflection markers
  areflect --check            Check for pending work
  areflect --learnings        Show recent learnings

Examples:
  nezha areflect "[LEARN] insight: Always check for pending work before stopping"
  nezha areflect "[ISSUE] title: Bug in parser type: bug severity: high"
  nezha areflect "[TASK] title: Fix parser bug priority: 8 type: implementation"
  nezha areflect "[ANNOUNCE] message: DLQ has 43 items priority: high"
  nezha areflect "[SCHEDULE] title: Daily cleanup cron: '0 2 * * *' description: Clean old tasks"
`);
          process.exit(0);
        }

        const db = await cliInstance.getDb();
        let count = 0;

        const learnPattern = /\[LEARN\]\s*insight:\s*(.+?)(?:\s*context:\s*(.+?))?\s*(?=\[|$)/gis;
        const promptPattern =
          /\[PROMPT_UPDATE\]\s*current:\s*(.+?)\s*suggested:\s*(.+?)\s*reason:\s*(.+?)\s*(?=\[|$)/gis;
        const issuePattern =
          /\[ISSUE\]\s*title:\s*(.+?)(?:\s*description:\s*(.+?))?(?:\s*type:\s*(\w+))?(?:\s*severity:\s*(\w+))?(?:\s*tags:\s*(.+?))?\s*(?=\[|$)/gis;
        const reviewResponsePattern =
          /\[REVIEW_RESPONSE\]\s*reviewId:\s*(.+?)\s*response:\s*([\s\S]*?)\s*(?=\[|accepted:|$)(?:\s*accepted:\s*([\s\S]*?))?\s*(?=\[|$)/gi;
        const taskPattern =
          /\[TASK\]\s*title:\s*(.+?)(?:\s*description:\s*(.+?))?(?:\s*priority:\s*(\d+))?(?:\s*type:\s*(\w+))?(?:\s*tags:\s*(.+?))?\s*(?=\[|$)/gis;
        const announcePattern =
          /\[ANNOUNCE\]\s*message:\s*(.+?)(?:\s*priority:\s*(low|normal|high|critical))?(?:\s*to:\s*(.+?))?\s*(?=\[|$)/gis;
        const schedulePattern =
          /\[SCHEDULE\]\s*title:\s*(.+?)(?:\s*cron:\s*(.+?))?(?:\s*description:\s*(.+?))?(?:\s*priority:\s*(\d+))?\s*(?=\[|$)/gis;
        const issueResolvePattern =
          /\[ISSUE_RESOLVE\]\s*id:\s*([a-f0-9-]+)\s+resolution:\s*(.+?)\s*(?=\[|$)/gis;
        const taskCompletePattern =
          /\[TASK_COMPLETE\]\s*id:\s*([a-f0-9-]+)(?:\s+result:\s*(.+?))?\s*(?=\[|$)/gis;
        const issueCommentPattern =
          /\[ISSUE_COMMENT\]\s*id:\s*([a-f0-9-]+)\s+comment:\s*(.+?)(?:\s+internal:\s*(true|false))?\s*(?=\[|$)/gis;

        let match;

        while ((match = learnPattern.exec(text)) !== null) {
          const insight = match[1]?.trim();
          const context = match[2]?.trim() || null;
          if (insight) {
            await db.query(
              `INSERT INTO memory (content, tags, source, importance, metadata) 
               VALUES ($1, ARRAY['learning', 'reflection'], 'areflect', $2, $3)`,
              [insight, 7, JSON.stringify({ context, source: 'areflect' })]
            );
            console.log(`✓ Saved learning: ${insight.substring(0, 60)}...`);
            count++;
          }
        }

        while ((match = promptPattern.exec(text)) !== null) {
          const currentPrompt = match[1]?.trim();
          const suggestedPrompt = match[2]?.trim();
          const reason = match[3]?.trim();
          if (currentPrompt && suggestedPrompt) {
            await db.query(
              `INSERT INTO prompt_suggestions (id, current_prompt, suggested_prompt, reason, status)
               VALUES (gen_random_uuid(), $1, $2, $3, 'pending')`,
              [currentPrompt, suggestedPrompt, reason]
            );
            console.log(`✓ Saved prompt suggestion: ${suggestedPrompt.substring(0, 40)}...`);
            count++;
          }
        }

        while ((match = issuePattern.exec(text)) !== null) {
          const title = match[1]?.trim();
          const description = match[2]?.trim() || null;
          const issueType = match[3]?.trim() || 'bug';
          const severity = match[4]?.trim() || 'medium';
          const tagsStr = match[5]?.trim();
          const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];
          if (title) {
            const result = await db.query<{ id: string }>(
              `INSERT INTO issues (title, description, issue_type, severity, tags)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [title, description, issueType, severity, tags]
            );
            console.log(
              `✓ Created issue: ${title.substring(0, 50)}... (ID: ${result.rows[0]?.id})`
            );
            count++;
          }
        }

        while ((match = reviewResponsePattern.exec(text)) !== null) {
          const reviewId = match[1]?.trim();
          const response = match[2]?.trim();
          const acceptedStr = match[3]?.trim();
          const acceptedSuggestions = acceptedStr ? acceptedStr.split(',').map(s => s.trim()) : [];
          if (reviewId && response) {
            try {
              await db.query(`SELECT respond_to_inter_review($1, $2, $3, $4, $5, $6, $7, $8)`, [
                reviewId,
                response,
                JSON.stringify(acceptedSuggestions),
                null,
                'accepted',
                null,
                0,
                null,
              ]);
              console.log(`✓ Saved review response for: ${reviewId}`);
              count++;
            } catch (err) {
              console.error(`✗ Failed to save review response for ${reviewId}:`, err);
            }
          }
        }

        while ((match = taskPattern.exec(text)) !== null) {
          const title = match[1]?.trim();
          const description = match[2]?.trim() || null;
          const priorityStr = match[3]?.trim();
          const taskType = match[4]?.trim() || 'implementation';
          const tagsStr = match[5]?.trim();
          const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];
          const priority = priorityStr ? parseInt(priorityStr, 10) : 5;
          if (title) {
            const result = await db.query<{ id: string }>(
              `INSERT INTO tasks (title, description, priority, type, tags, status)
               VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING id`,
              [title, description, priority, taskType, tags]
            );
            console.log(`✓ Created task: ${title.substring(0, 50)}... (ID: ${result.rows[0]?.id})`);
            count++;
          }
        }

        while ((match = announcePattern.exec(text)) !== null) {
          const message = match[1]?.trim();
          const priority = match[2]?.trim() || 'normal';
          const targetAgent = match[3]?.trim() || null;
          if (message) {
            await db.query(
              `INSERT INTO project_communications (from_ai, to_ai, message_type, content, priority)
               VALUES ($1, $2, 'broadcast', $3, $4)`,
              ['areflect-cli', targetAgent, message, priority]
            );
            console.log(`✓ Sent broadcast: ${message.substring(0, 50)}...`);
            count++;
          }
        }

        while ((match = schedulePattern.exec(text)) !== null) {
          const title = match[1]?.trim();
          const cron = match[2]?.trim();
          const description = match[3]?.trim() || null;
          const priorityStr = match[4]?.trim();
          const priority = priorityStr ? parseInt(priorityStr, 10) : 5;
          if (title && cron) {
            const { Cron } = await import('croner');
            const cronJob = new Cron(cron, { timezone: 'UTC' });
            const nextRun = cronJob.nextRun() || new Date(Date.now() + 3600000);
            await db.query(
              `INSERT INTO scheduled_tasks (name, description, cron_expression, priority, enabled, next_run)
               VALUES ($1, $2, $3, $4, true, $5)`,
              [title, description, cron, priority, nextRun]
            );
            console.log(`✓ Created schedule: ${title.substring(0, 50)}...`);
            count++;
          }
        }

        const agentId = (await AgentIdentityService.getResolvedIdentity()).id;

        while ((match = issueResolvePattern.exec(text)) !== null) {
          const id = match[1]?.trim();
          const resolution = match[2]?.trim();
          if (id && resolution) {
            const result = await db.query<{ title: string }>(
              `SELECT title FROM issues WHERE id = $1 AND status != 'resolved'`,
              [id]
            );
            if (result.rows.length === 0) {
              console.log(`Issue not found or already resolved: ${id}`);
            } else {
              await db.query(
                `UPDATE issues 
                 SET status = 'resolved', resolution = $2, resolved_at = NOW(), resolved_by = $3
                 WHERE id = $1`,
                [id, resolution, agentId]
              );
              console.log(`✓ Resolved issue: ${result.rows[0]!.title.substring(0, 50)}...`);
              count++;
            }
          }
        }

        while ((match = taskCompletePattern.exec(text)) !== null) {
          const id = match[1]?.trim();
          const taskResult = match[2]?.trim();
          if (id) {
            const result = await db.query<{ title: string }>(
              `SELECT title FROM tasks WHERE id = $1 AND status NOT IN ('COMPLETED', 'FAILED')`,
              [id]
            );
            if (result.rows.length === 0) {
              console.log(`Task not found or already completed: ${id}`);
            } else {
              await db.query(
                `UPDATE tasks 
                 SET status = 'COMPLETED', result = $2, completed_at = NOW()
                 WHERE id = $1`,
                [id, taskResult ? JSON.stringify({ message: taskResult }) : null]
              );
              console.log(`✓ Completed task: ${result.rows[0]!.title.substring(0, 50)}...`);
              count++;
            }
          }
        }

        while ((match = issueCommentPattern.exec(text)) !== null) {
          const id = match[1]?.trim();
          const comment = match[2]?.trim();
          const internalStr = match[3]?.trim();
          if (id && comment) {
            const result = await db.query<{ title: string }>(
              `SELECT title FROM issues WHERE id = $1`,
              [id]
            );
            if (result.rows.length === 0) {
              console.log(`Issue not found: ${id}`);
            } else {
              await db.query(
                `INSERT INTO issue_comments (issue_id, author, content, is_internal)
                 VALUES ($1, $2, $3, $4)`,
                [id, agentId, comment, internalStr === 'true']
              );
              console.log(`✓ Commented on issue: ${result.rows[0]!.title.substring(0, 50)}...`);
              count++;
            }
          }
        }

        if (count === 0) {
          console.log('No reflection markers found in text.');
        } else {
          console.log(`\n✓ Parsed ${count} reflection item(s)`);
        }
        break;
      }

      case 'tasks': {
        const tagIndex = args.indexOf('--tag');
        const statusIndex = args.indexOf('--status');
        const categoryIndex = args.indexOf('--category');
        const tag = tagIndex !== -1 ? args[tagIndex + 1] : undefined;
        const status = statusIndex !== -1 ? args[statusIndex + 1] : undefined;
        const category = categoryIndex !== -1 ? args[categoryIndex + 1] : undefined;
        const jsonOutput = args.includes('--json') || args.includes('--format=json');
        const showAll = args.includes('--all');

        await cliInstance.listTasks(tag, status, category, jsonOutput, showAll);
        break;
      }

      case 'api-key': {
        const subcommand = args[1];

        if (subcommand === 'create') {
          const name = args[2];
          const rateIndex = args.indexOf('--rate');
          const rateLimitArg = rateIndex !== -1 ? args[rateIndex + 1] : undefined;
          const rateLimit = rateLimitArg ? parseInt(rateLimitArg, 10) : 100;

          if (!name) {
            cli.error('API key name is required');
            console.log('Usage: nezha api-key create <name> [--rate <limit>]');
            process.exit(1);
          }

          await cliInstance.createApiKey(name, rateLimit);
        } else if (subcommand === 'list') {
          await cliInstance.listApiKeys();
        } else if (subcommand === 'revoke') {
          const name = args[2];

          if (!name) {
            cli.error('API key name is required');
            console.log('Usage: nezha api-key revoke <name>');
            process.exit(1);
          }

          await cliInstance.revokeApiKey(name);
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha api-key <create|list|revoke> [options]');
          console.log('\nExamples:');
          console.log('  nezha api-key create myapp --rate 100');
          console.log('  nezha api-key list');
          console.log('  nezha api-key revoke myapp');
        }
        break;
      }

      case 'auto-tag-rules': {
        const subcommand = args[1];

        if (subcommand === 'create') {
          const keyword = args[2];
          const tag = args[3];

          if (!keyword || !tag) {
            cli.error('Keyword and tag are required');
            console.log('Usage: nezha auto-tag-rules create <keyword> <tag>');
            console.log('Example: nezha auto-tag-rules create "fix" bugfix');
            process.exit(1);
          }

          await cliInstance.createAutoTagRule(keyword, tag);
        } else if (subcommand === 'list') {
          await cliInstance.listAutoTagRules();
        } else if (subcommand === 'delete') {
          const keyword = args[2];

          if (!keyword) {
            cli.error('Keyword is required');
            console.log('Usage: nezha auto-tag-rules delete <keyword>');
            process.exit(1);
          }

          await cliInstance.deleteAutoTagRule(keyword);
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha auto-tag-rules <create|list|delete> [options]');
          console.log('\nExamples:');
          console.log('  nezha auto-tag-rules create "fix" bugfix');
          console.log('  nezha auto-tag-rules list');
          console.log('  nezha auto-tag-rules delete "fix"');
        }
        break;
      }

      case 'table-of-tasks':
      case 'tot': {
        await cliInstance.tableOfTasks();
        break;
      }

      case 'templates': {
        const subcommand = args[1];

        if (subcommand === 'list' || !subcommand) {
          await cliInstance.listTemplates();
        } else if (subcommand === 'add') {
          const name = args[2];
          const description = args[3] ?? '';
          let priority = 0;
          let taskType = 'implementation';
          let timeoutSeconds = 300;

          const priorityIndex = args.indexOf('--priority');
          if (priorityIndex !== -1 && priorityIndex + 1 < args.length) {
            const priorityArg = args[priorityIndex + 1];
            priority = priorityArg ? parseInt(priorityArg, 10) || 0 : 0;
          }

          const typeIndex = args.indexOf('--type');
          if (typeIndex !== -1 && typeIndex + 1 < args.length) {
            const typeArg = args[typeIndex + 1];
            if (typeArg) taskType = typeArg;
          }

          const timeoutIndex = args.indexOf('--timeout');
          if (timeoutIndex !== -1 && timeoutIndex + 1 < args.length) {
            const timeoutArg = args[timeoutIndex + 1];
            if (timeoutArg) {
              timeoutSeconds = parseInt(timeoutArg, 10) || 300;
            }
          }

          if (!name) {
            cli.error('Template name is required');
            console.log(
              '\nUsage: nezha templates add <name> <description> [--priority <n>] [--type <type>] [--timeout <seconds>]'
            );
            process.exit(1);
          }

          await cliInstance.addTemplate(name, description, priority, taskType, timeoutSeconds);
        } else if (subcommand === 'delete' || subcommand === 'remove') {
          const name = args[2];

          if (!name) {
            cli.error('Template name is required');
            console.log('\nUsage: nezha templates delete <name>');
            process.exit(1);
          }

          await cliInstance.deleteTemplate(name);
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha templates <list|add|delete> [options]');
          console.log('\nExamples:');
          console.log('  nezha templates list');
          console.log('  nezha templates add my-template "Description" --priority 5');
          console.log('  nezha templates delete my-template');
        }
        break;
      }

      case 'category-rules': {
        const subcommand = args[1];

        if (subcommand === 'list' || !subcommand) {
          await cliInstance.listCategoryRules();
        } else if (subcommand === 'add') {
          const keyword = args[2];
          const category = args[3];

          if (!keyword || !category) {
            cli.error('Keyword and category are required');
            console.log('\nUsage: nezha category-rules add <keyword> <category>');
            console.log('\nCategories: security, performance, feature, bugfix');
            console.log('\nExamples:');
            console.log('  nezha category-rules add "memory leak" performance');
            console.log('  nezha category-rules add "sql injection" security');
            process.exit(1);
          }

          await cliInstance.addCategoryRule(keyword, category);
        } else if (subcommand === 'remove' || subcommand === 'delete') {
          const keyword = args[2];

          if (!keyword) {
            cli.error('Keyword is required');
            console.log('\nUsage: nezha category-rules remove <keyword>');
            process.exit(1);
          }

          await cliInstance.removeCategoryRule(keyword);
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha category-rules <list|add|remove> [options]');
          console.log('\nExamples:');
          console.log('  nezha category-rules list');
          console.log('  nezha category-rules add "memory leak" performance');
          console.log('  nezha category-rules remove "memory leak"');
        }
        break;
      }

      case 'review-request': {
        const commitHash = args[1];
        const taskId = args[2];
        const description = args.slice(3).join(' ');
        await requestReviewFromAI(commitHash, taskId, description || undefined);
        break;
      }

      case 'review-show': {
        const reviewId = args[1];
        await showReview(reviewId);
        break;
      }

      case 'review-stats': {
        await showReviewStats();
        break;
      }

      case 'review-respond': {
        const reviewId = args[1];
        const response = args[2];
        if (!reviewId || !response) {
          cli.error('Review ID and response are required');
          console.log('\nUsage: nezha review-respond <review-id> <response>');
          process.exit(1);
        }
        await respondToReview(reviewId, response);
        break;
      }

      case 'reviews': {
        const subcommand = args[1];
        const db = await cliInstance.getDb();
        const reviewCmd = new ReviewManagementCommands(db);

        if (subcommand === 'create' || subcommand === 'new') {
          const typeIndex = args.indexOf('--type');
          const type = (typeIndex !== -1 ? args[typeIndex + 1] || 'qc' : 'qc') as
            | 'code'
            | 'design'
            | 'qc'
            | 'peer'
            | 'task'
            | 'security'
            | 'other';
          const targetIndex = args.indexOf('--target');
          const target = targetIndex !== -1 ? args[targetIndex + 1] : undefined;
          const titleIndex = args.indexOf('--title');
          const title =
            titleIndex !== -1
              ? args[titleIndex + 1] || 'Untitled Review'
              : args.slice(2).join(' ') || 'Untitled Review';
          const descIndex = args.indexOf('--description');
          const description = descIndex !== -1 ? args[descIndex + 1] : undefined;

          await reviewCmd.create({ type, target, title, description });
        } else if (subcommand === 'list' || subcommand === 'ls') {
          const statusIndex = args.indexOf('--status');
          const status = statusIndex !== -1 ? args[statusIndex + 1] : undefined;
          await reviewCmd.list(status);
        } else if (subcommand === 'start') {
          const reviewId = args[2];
          if (!reviewId) {
            cli.error('Review ID is required');
            console.log('\nUsage: nezha reviews start <review-id>');
            process.exit(1);
          }
          await reviewCmd.start(reviewId);
        } else if (subcommand === 'complete' || subcommand === 'done') {
          const reviewId = args[2];
          if (!reviewId) {
            cli.error('Review ID is required');
            console.log(
              '\nUsage: nezha reviews complete <review-id> --findings <json> --action-items <json>'
            );
            process.exit(1);
          }
          const findingsIndex = args.indexOf('--findings');
          const findingsJson = findingsIndex !== -1 ? args[findingsIndex + 1] || '[]' : '[]';
          const actionsIndex = args.indexOf('--action-items');
          const actionsJson = actionsIndex !== -1 ? args[actionsIndex + 1] || '[]' : '[]';

          let findings: import('../services/ReviewService.js').ReviewFinding[] = [];
          let actionItems: { description: string }[] = [];
          try {
            findings = JSON.parse(findingsJson);
            actionItems = JSON.parse(actionsJson);
          } catch {
            cli.error('Invalid JSON for findings or action-items');
            process.exit(1);
          }

          await reviewCmd.complete(reviewId, findings, actionItems);
        } else if (subcommand === 'follow-ups' || subcommand === 'followups') {
          await reviewCmd.followUps();
        } else if (subcommand === 'stats') {
          await reviewCmd.stats();
        } else {
          console.log(`\n${colors.bright}Review Management Commands:${colors.reset}\n`);
          console.log(
            '  nezha reviews create --type <type> --title <title> [--target <id>] [--description <desc>]'
          );
          console.log('  nezha reviews list [--status <status>]');
          console.log('  nezha reviews start <review-id>');
          console.log(
            '  nezha reviews complete <review-id> --findings <json> --action-items <json>'
          );
          console.log('  nezha reviews follow-ups');
          console.log('  nezha reviews stats');
          console.log('\nTypes: code, design, qc, peer, task, security, other');
          console.log('Statuses: pending, in_progress, completed, follow_up, closed\n');
        }
        break;
      }

      case 'issues': {
        const subcommand = args[1];
        const db = await cliInstance.getDb();
        const issueCmd = new IssueCommands(db);

        if (subcommand === 'list' || subcommand === 'ls') {
          const statusIndex = args.indexOf('--status');
          const status = statusIndex !== -1 ? args[statusIndex + 1] : undefined;
          const severityIndex = args.indexOf('--severity');
          const severity = severityIndex !== -1 ? args[severityIndex + 1] : undefined;
          await issueCmd.list({ status, severity });
        } else if (subcommand === 'show') {
          const id = args[2];
          if (!id) {
            cli.error('Issue ID is required');
            console.log('\nUsage: nezha issues show <id>');
            process.exit(1);
          }
          await issueCmd.show(id);
        } else if (subcommand === 'create' || subcommand === 'new') {
          const titleIndex = args.indexOf('--title');
          const descIndex = args.indexOf('--description');
          const typeIndex = args.indexOf('--type');
          const severityIndex = args.indexOf('--severity');
          const title =
            titleIndex !== -1
              ? args[titleIndex + 1]
              : args
                  .slice(2)
                  .join(' ')
                  .replace(/^[^"]*"|"[^"]*$/g, '')
                  .trim();
          const description = descIndex !== -1 ? args[descIndex + 1] : '';
          if (!title) {
            cli.error('Title is required');
            console.log(
              '\nUsage: nezha issues create <title> [--description <desc>] [--type <type>] [--severity <sev>]'
            );
            process.exit(1);
          }
          await issueCmd.create(title, description || '', {
            type: typeIndex !== -1 ? args[typeIndex + 1] : undefined,
            severity: severityIndex !== -1 ? args[severityIndex + 1] : undefined,
          });
        } else if (subcommand === 'resolve') {
          const id = args[2];
          const notesIndex = args.indexOf('--notes');
          const notes = notesIndex !== -1 ? args[notesIndex + 1] : undefined;
          if (!id) {
            cli.error('Issue ID is required');
            console.log('\nUsage: nezha issues resolve <id> [--notes <notes>]');
            process.exit(1);
          }
          await issueCmd.resolve(id, notes);
        } else if (subcommand === 'stats') {
          await issueCmd.stats();
        } else if (subcommand === 'comment') {
          const id = args[2];
          const commentIndex = args.indexOf('--comment');
          const comment = commentIndex !== -1 ? args[commentIndex + 1] : args.slice(3).join(' ');
          if (!id || !comment) {
            cli.error('Issue ID and comment are required');
            console.log('\nUsage: nezha issues comment <id> [--comment <text>]');
            process.exit(1);
          }
          await issueCmd.comment(id, comment);
        } else if (subcommand === 'comments') {
          const id = args[2];
          if (!id) {
            cli.error('Issue ID is required');
            console.log('\nUsage: nezha issues comments <id>');
            process.exit(1);
          }
          await issueCmd.comments(id);
        } else if (subcommand === 'events') {
          const id = args[2];
          if (!id) {
            cli.error('Issue ID is required');
            console.log('\nUsage: nezha issues events <id>');
            process.exit(1);
          }
          await issueCmd.events(id);
        } else if (subcommand === 'assign') {
          const id = args[2];
          const assignee = args[3];
          if (!id || !assignee) {
            cli.error('Issue ID and assignee are required');
            console.log('\nUsage: nezha issues assign <id> <assignee>');
            process.exit(1);
          }
          await issueCmd.assign(id, assignee);
        } else if (subcommand === 'labels') {
          await issueCmd.labels({ list: true });
        } else if (subcommand === 'milestone') {
          const titleIndex = args.indexOf('--title');
          const title = titleIndex !== -1 ? args[titleIndex + 1] : args.slice(2).join(' ');
          const descIndex = args.indexOf('--description');
          const description = descIndex !== -1 ? args[descIndex + 1] : undefined;
          if (!title) {
            cli.error('Milestone title is required');
            console.log('\nUsage: nezha issues milestone <title> [--description <desc>]');
            process.exit(1);
          }
          await issueCmd.milestone(title, description);
        } else if (subcommand === 'to-task') {
          const id = args[2];
          const priorityIndex = args.indexOf('--priority');
          const priority =
            priorityIndex !== -1 ? parseInt(args[priorityIndex + 1]!, 10) : undefined;
          if (!id) {
            cli.error('Issue ID is required');
            console.log('\nUsage: nezha issues to-task <id> [--priority <n>]');
            process.exit(1);
          }
          await issueCmd.toTask(id, priority);
        } else if (subcommand === 'link-review') {
          const issueId = args[2];
          const reviewId = args[3];
          if (!issueId || !reviewId) {
            cli.error('Issue ID and Review ID are required');
            console.log('\nUsage: nezha issues link-review <issue-id> <review-id>');
            process.exit(1);
          }
          await issueCmd.linkReview(issueId, reviewId);
        } else {
          console.log(`\n${colors.bright}Issue Management Commands:${colors.reset}\n`);
          console.log('  nezha issues list [--status <status>] [--severity <severity>]');
          console.log('  nezha issues show <id>');
          console.log(
            '  nezha issues create <title> [--description <desc>] [--type <type>] [--severity <sev>]'
          );
          console.log('  nezha issues resolve <id> [--notes <notes>]');
          console.log('  nezha issues stats');
          console.log('  nezha issues comment <id> [--comment <text>]');
          console.log('  nezha issues comments <id>');
          console.log('  nezha issues events <id>');
          console.log('  nezha issues assign <id> <assignee>');
          console.log('  nezha issues labels [--list]');
          console.log('  nezha issues milestone <title> [--description <desc>]');
          console.log('  nezha issues to-task <id> [--priority <n>]');
          console.log('  nezha issues link-review <issue-id> <review-id>');
          console.log('\nStatuses: open, resolved, all');
          console.log('Severities: critical, high, medium, low\n');
        }
        break;
      }

      case 'dlq': {
        const subcommand = args[1];
        const monitor = await cliInstance.getMonitoringCommands();

        if (subcommand === 'list' || !subcommand) {
          const limitIndex = args.indexOf('--limit');
          const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1] || '50', 10) : 50;
          const showResolved = args.includes('--all');
          await monitor.listDLQ(limit, showResolved);
        } else if (subcommand === 'resolve') {
          const id = args[2];
          const notesIndex = args.indexOf('--notes');
          const notes = notesIndex !== -1 ? args[notesIndex + 1] : undefined;
          if (!id) {
            cli.error('DLQ ID is required');
            console.log('\nUsage: nezha dlq resolve <id> [--notes <notes>]');
            process.exit(1);
          }
          await monitor.resolveDLQ(id, notes);
        } else if (subcommand === 'retry') {
          const id = args[2];
          if (!id) {
            cli.error('DLQ ID is required');
            console.log('\nUsage: nezha dlq retry <id>');
            process.exit(1);
          }
          await monitor.retryDLQ(id);
        } else if (subcommand === 'retry-all') {
          await monitor.retryAllDLQ();
        } else if (subcommand === 'delete') {
          const id = args[2];
          if (!id) {
            cli.error('DLQ ID is required');
            console.log('\nUsage: nezha dlq delete <id>');
            process.exit(1);
          }
          await monitor.deleteDLQ(id);
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha dlq <list|resolve|retry|retry-all|delete> [options]');
          console.log('\nExamples:');
          console.log('  nezha dlq list');
          console.log('  nezha dlq list --all');
          console.log('  nezha dlq resolve <id> --notes "Fixed the issue"');
          console.log('  nezha dlq retry <id>');
          console.log('  nezha dlq retry-all');
          console.log('  nezha dlq delete <id>');
        }
        break;
      }

      case 'reset-failed': {
        const monitor = await cliInstance.getMonitoringCommands();
        const olderThanIndex = args.indexOf('--older-than');
        const olderThanHours =
          olderThanIndex !== -1 ? parseInt(args[olderThanIndex + 1] || '0', 10) : 0;
        await monitor.resetFailedTasks(olderThanHours);
        break;
      }

      case 'recovery': {
        const subcommand = args[1];
        const monitor = await cliInstance.getMonitoringCommands();

        if (!subcommand || subcommand === 'stats') {
          await monitor.showRecoveryStats();
        } else if (subcommand === 'run') {
          await monitor.runManualRecovery();
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha recovery <stats|run>');
          console.log('\nExamples:');
          console.log('  nezha recovery stats    Show recovery statistics');
          console.log('  nezha recovery run      Run manual recovery');
        }
        break;
      }

      case 'learn-from-failures': {
        const monitor = await cliInstance.getMonitoringCommands();
        await monitor.learnFromFailures();
        break;
      }

      case 'alerts': {
        const subcommand = args[1];
        const monitor = await cliInstance.getMonitoringCommands();

        if (subcommand === 'list' || !subcommand) {
          const limitIndex = args.indexOf('--limit');
          const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1] || '50', 10) : 50;
          const showAcknowledged = args.includes('--all');
          await monitor.listAlerts(limit, showAcknowledged);
        } else if (subcommand === 'ack' || subcommand === 'acknowledge') {
          const id = args[2];
          const byIndex = args.indexOf('--by');
          const acknowledgedBy = byIndex !== -1 ? args[byIndex + 1] : 'cli';
          if (!id) {
            cli.error('Alert ID is required');
            console.log('\nUsage: nezha alerts ack <id> [--by <user>]');
            process.exit(1);
          }
          await monitor.acknowledgeAlert(id, acknowledgedBy);
        } else if (subcommand === 'stats') {
          await monitor.getAlertStats();
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha alerts <list|ack|stats> [options]');
          console.log('\nExamples:');
          console.log('  nezha alerts list');
          console.log('  nezha alerts list --all');
          console.log('  nezha alerts ack <id>');
          console.log('  nezha alerts stats');
        }
        break;
      }

      case 'watchdog': {
        const subcommand = args[1];
        const monitor = await cliInstance.getMonitoringCommands();

        if (!subcommand || subcommand === 'stats') {
          await monitor.getWatchdogStats();
        } else if (subcommand === 'cleanup') {
          const thresholdIndex = args.indexOf('--threshold');
          const threshold =
            thresholdIndex !== -1 && args[thresholdIndex + 1]
              ? parseInt(args[thresholdIndex + 1]!, 10)
              : 60;
          await monitor.cleanupOrphanedProcesses(threshold);
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha watchdog <stats|cleanup> [options]');
          console.log('\nExamples:');
          console.log('  nezha watchdog stats');
          console.log('  nezha watchdog cleanup --threshold 60');
        }
        break;
      }

      case 'longtasks': {
        const subcommand = args[1];
        const monitor = await cliInstance.getMonitoringCommands();

        if (subcommand === 'stats') {
          await monitor.getLongTaskStats();
        } else if (subcommand === 'paused') {
          await monitor.listPausedTasks();
        } else if (subcommand === 'failures') {
          await monitor.getFailureStatistics();
        } else if (!subcommand) {
          await monitor.getLongTaskStats();
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha longtasks <stats|paused|failures>');
          console.log('\nExamples:');
          console.log('  nezha longtasks stats');
          console.log('  nezha longtasks paused');
          console.log('  nezha longtasks failures');
        }
        break;
      }

      case 'meeting': {
        const subcommand = args[1];
        const meeting = await cliInstance.getMeetingCommands();

        if (subcommand === 'discuss' || subcommand === 'create') {
          const title = args[2];
          const description = args.slice(3).join(' ') || 'No description provided';
          let priority = 5;
          const participants: string[] = [];

          const priorityIndex = args.indexOf('--priority');
          if (priorityIndex !== -1 && args[priorityIndex + 1]) {
            priority = parseInt(args[priorityIndex + 1]!, 10) || 5;
          }

          const participantsIndex = args.indexOf('--participants');
          if (participantsIndex !== -1 && args[participantsIndex + 1]) {
            participants.push(...args[participantsIndex + 1]!.split(','));
          }

          if (!title) {
            cli.error('Discussion title is required');
            console.log(
              '\nUsage: nezha meeting discuss <title> [description] [--priority <n>] [--participants <ai1,ai2>]'
            );
            console.log('\nExamples:');
            console.log('  nezha meeting discuss "API Design" "Should we use REST or GraphQL?"');
            console.log(
              '  nezha meeting discuss "Database Choice" "PostgreSQL vs MongoDB" --priority 8'
            );
            console.log(
              '  nezha meeting discuss "Testing Strategy" --participants nezha-1,nezha-2'
            );
            process.exit(1);
          }

          await meeting.createDiscussion(title, description, participants, priority);
        } else if (subcommand === 'list') {
          const statusIndex = args.indexOf('--status');
          const status = statusIndex !== -1 ? args[statusIndex + 1] : undefined;
          await meeting.listDiscussions(status);
        } else if (subcommand === 'show') {
          const id = args[2];
          await meeting.showDiscussion(id);
        } else if (subcommand === 'opinion') {
          const discussionId = args[2];
          const author = args[3];
          const perspective = args[4] || '';
          const keyPointsRaw = args.slice(5).join(' ');

          if (!discussionId || !author) {
            cli.error('Discussion ID and author are required');
            console.log(
              '\nUsage: nezha meeting opinion <discussion-id> <author> <perspective> [key-points...]'
            );
            console.log('\nExample:');
            console.log(
              '  nezha meeting opinion abc123 nezha-1 "REST is simpler" "Easy to understand" "Better tooling" "HTTP caching"'
            );
            process.exit(1);
          }

          await meeting.addOpinion(
            discussionId,
            author,
            perspective + (keyPointsRaw ? '\n\n**Key Points**:\n' + keyPointsRaw : '')
          );
        } else if (subcommand === 'consensus') {
          const topic = args[2];
          const participantsRaw = args[3];
          const decision = args[4] || '';

          if (!topic || !participantsRaw || !decision) {
            cli.error('Topic, participants, and decision are required');
            console.log(
              '\nUsage: nezha meeting consensus <topic> <participants> <decision> [--agreed <points>] [--next <steps>]'
            );
            console.log('\nExamples:');
            console.log('  nezha meeting consensus "API Choice" "nezha-1,nezha-2" "Use REST"');
            console.log(
              '  nezha meeting consensus "DB Choice" "nezha-1" "PostgreSQL" --agreed "ACID compliance" --next "Set up schema"'
            );
            process.exit(1);
          }

          const agreedIndex = args.indexOf('--agreed');
          const agreedPoints =
            agreedIndex !== -1 && args[agreedIndex + 1]
              ? args[agreedIndex + 1]!.split('|')
              : [decision];

          const nextIndex = args.indexOf('--next');
          const nextSteps =
            nextIndex !== -1 && args[nextIndex + 1] ? args[nextIndex + 1]!.split('|') : [];

          await meeting.reachConsensus(
            topic,
            participantsRaw.split(','),
            agreedPoints,
            decision,
            nextSteps
          );
        } else if (subcommand === 'history') {
          const limit = parseInt(args[args.indexOf('--limit') + 1] || '20', 10);
          await meeting.listConsensus(limit);
        } else if (subcommand === 'db') {
          const dbSubcommand = args[2];
          const db = await cliInstance.getDb();
          const dbMeeting = new MeetingDbCommands(db);

          if (dbSubcommand === 'list' || dbSubcommand === 'ls') {
            const statusIndex = args.indexOf('--status');
            const status = statusIndex !== -1 ? args[statusIndex + 1] : undefined;
            await dbMeeting.list({ status });
          } else if (dbSubcommand === 'show') {
            const id = args[3];
            if (!id) {
              cli.error('Meeting ID is required');
              console.log('\nUsage: nezha meeting db show <id>');
              process.exit(1);
            }
            await dbMeeting.show(id);
          } else if (dbSubcommand === 'create') {
            const topic = args.slice(3).join(' ');
            if (!topic) {
              cli.error('Meeting topic is required');
              console.log('\nUsage: nezha meeting db create <topic>');
              process.exit(1);
            }
            await dbMeeting.create(topic);
          } else if (dbSubcommand === 'opinion') {
            const meetingId = args[3];
            const perspective = args.slice(4).join(' ');
            if (!meetingId || !perspective) {
              cli.error('Meeting ID and perspective are required');
              console.log('\nUsage: nezha meeting db opinion <meeting-id> <perspective>');
              process.exit(1);
            }
            const posIndex = args.indexOf('--position');
            const position =
              posIndex !== -1
                ? (args[posIndex + 1] as 'support' | 'oppose' | 'neutral')
                : undefined;
            const author = (await AgentIdentityService.getResolvedIdentity()).id;
            await dbMeeting.addOpinion(meetingId, author, perspective, undefined, position);
          } else if (dbSubcommand === 'consensus') {
            const meetingId = args[3];
            const consensusText = args.slice(4).join(' ');
            if (!meetingId || !consensusText) {
              cli.error('Meeting ID and consensus text are required');
              console.log('\nUsage: nezha meeting db consensus <meeting-id> <text>');
              process.exit(1);
            }
            await dbMeeting.consensus(meetingId, consensusText);
          } else if (dbSubcommand === 'cancel') {
            const meetingId = args[3];
            if (!meetingId) {
              cli.error('Meeting ID is required');
              console.log('\nUsage: nezha meeting db cancel <meeting-id>');
              process.exit(1);
            }
            await dbMeeting.cancel(meetingId);
          } else if (dbSubcommand === 'stats') {
            await dbMeeting.stats();
          } else {
            console.log('\nMeeting DB Commands:');
            console.log('  nezha meeting db list [--status <status>]');
            console.log('  nezha meeting db show <id>');
            console.log('  nezha meeting db create <topic>');
            console.log(
              '  nezha meeting db opinion <id> <perspective> [--position <support|oppose|neutral>]'
            );
            console.log('  nezha meeting db consensus <id> <text>');
            console.log('  nezha meeting db cancel <id>');
            console.log('  nezha meeting db stats');
          }
        } else if (!subcommand || subcommand === 'help') {
          console.log('\nUsage: nezha meeting <subcommand> [options]');
          console.log('\nSubcommands:');
          console.log('  discuss <title> [desc]     Create a new AI discussion');
          console.log('  list [--status <status>]   List active discussions');
          console.log('  show [id]                  Show discussion details');
          console.log('  opinion <id> <author> <p> Record an opinion');
          console.log('  consensus <t> <p> <d>       Record consensus');
          console.log('  history [--limit <n>]      Show consensus history');
          console.log('\nOptions:');
          console.log('  --priority <n>             Set discussion priority (default: 5)');
          console.log('  --participants <ai1,ai2>   Comma-separated participant list');
          console.log('  --agreed <p1|p2|...>       Pipe-separated agreed points');
          console.log('  --next <s1|s2|...>         Pipe-separated next steps');
          console.log('\nExamples:');
          console.log('  nezha meeting discuss "API Design" "REST vs GraphQL?"');
          console.log('  nezha meeting list');
          console.log('  nezha meeting history');
        } else {
          cli.error(`Unknown subcommand: ${subcommand}`);
          console.log('\nUsage: nezha meeting <discuss|list|show|opinion|consensus|history>');
        }
        break;
      }

      case 'announce': {
        const message = args.slice(1).join(' ');
        const priorityIndex = args.indexOf('--priority');
        const priority = priorityIndex !== -1 ? args[priorityIndex + 1] : 'normal';
        const targetIndex = args.indexOf('--to');
        const target = targetIndex !== -1 ? args[targetIndex + 1] : undefined;

        if (!message || message.startsWith('--')) {
          cli.error('Message is required');
          console.log(
            '\nUsage: nezha announce <message> [--priority <low|normal|high|critical>] [--to <agent-id>]'
          );
          console.log('\nExamples:');
          console.log('  nezha announce "System maintenance in 5 minutes"');
          console.log('  nezha announce "Critical bug found!" --priority critical');
          console.log('  nezha announce "Hey OpenCode" --to opencode-ai --priority high');
          process.exit(1);
        }

        const db = await cliInstance.getDb();
        const { BroadcastService } = await import('../services/BroadcastService.js');
        const broadcastService = await BroadcastService.create(db);

        const validPriorities = ['low', 'normal', 'high', 'critical'];
        const broadcastPriority = validPriorities.includes(priority || 'normal')
          ? (priority as 'low' | 'normal' | 'high' | 'critical')
          : 'normal';

        const id = await broadcastService.sendBroadcast(message, {
          priority: broadcastPriority,
          targetAgent: target,
        });

        const icon =
          broadcastPriority === 'critical' ? '🚨' : broadcastPriority === 'high' ? '⚠️' : '📢';
        console.log(`\n${icon} Broadcast sent successfully!`);
        console.log(`   ID: ${id}`);
        console.log(`   Priority: ${broadcastPriority}`);
        console.log(`   Target: ${target || 'all-ais'}`);
        break;
      }

      case 'who-is-working':
      case 'working': {
        const db = await cliInstance.getDb();

        const runningTasks = await db.query<{
          id: string;
          title: string;
          status: string;
          priority: number;
          assigned_to: string | null;
          agent_id: string | null;
          agent_name: string | null;
          git_hash: string | null;
          started_at: Date | null;
          created_by: string | null;
          session_id: string | null;
          agent_type: string | null;
        }>(
          `SELECT t.id, t.title, t.status, t.priority, t.assigned_to, t.agent_id, t.agent_name, 
                  t.git_hash, t.started_at, t.created_by, t.session_id, s.agent_type
           FROM tasks t
           LEFT JOIN agent_sessions s ON t.session_id = s.id
           WHERE t.status = 'RUNNING'
           ORDER BY t.priority DESC, t.started_at DESC`
        );

        const pendingTasks = await db.query<{
          id: string;
          title: string;
          status: string;
          priority: number;
          assigned_to: string | null;
          created_at: Date;
        }>(
          `SELECT id, title, status, priority, assigned_to, created_at
           FROM tasks
           WHERE status = 'PENDING'
           ORDER BY priority DESC, created_at ASC
           LIMIT 10`
        );

        console.log(
          '\n' +
            colors.bright +
            '═══════════════════════════════════════════════════════════════' +
            colors.reset
        );
        console.log(colors.bright + '  WHO IS WORKING ON WHAT' + colors.reset);
        console.log(
          colors.bright +
            '═══════════════════════════════════════════════════════════════' +
            colors.reset
        );

        if (runningTasks.rows.length === 0) {
          console.log('\n  No tasks currently running.');
        } else {
          console.log('\n' + colors.bright + '  🔄 RUNNING TASKS:' + colors.reset);
          for (const task of runningTasks.rows) {
            const agentDisplay = task.agent_type
              ? `${task.agent_type} (${task.session_id?.substring(0, 12)}...)`
              : task.agent_name ||
                task.agent_id?.substring(0, 8) ||
                task.assigned_to ||
                'unassigned';
            const started = task.started_at
              ? new Date(task.started_at).toLocaleTimeString()
              : 'N/A';
            const gitInfo = task.git_hash ? ` @ ${task.git_hash}` : '';
            console.log(`\n  📋 ${task.title}`);
            console.log(`     Priority: ${task.priority} | Agent: ${agentDisplay}${gitInfo}`);
            console.log(`     Started: ${started} | ID: ${task.id.substring(0, 8)}...`);
          }
        }

        const activeSessions = await db.query<{
          id: string;
          started_at: Date;
          last_heartbeat: Date;
          git_branch: string | null;
          working_on: string | null;
          agent_type: string;
        }>(
          `SELECT id, started_at, last_heartbeat, git_branch, working_on, agent_type
           FROM agent_sessions
           WHERE status = 'alive'
           ORDER BY last_heartbeat DESC`
        );

        if (activeSessions.rows.length > 0) {
          console.log('\n' + colors.bright + '  🤖 ACTIVE AI SESSIONS:' + colors.reset);
          for (const session of activeSessions.rows) {
            const started = new Date(session.started_at).toLocaleTimeString();
            const heartbeat = new Date(session.last_heartbeat).toLocaleTimeString();
            const work = session.working_on ? ` - ${session.working_on.substring(0, 50)}` : '';
            console.log(`\n  🤖 ${session.id}`);
            console.log(
              `     Type: ${session.agent_type} | Branch: ${session.git_branch || 'N/A'}`
            );
            console.log(`     Started: ${started} | Heartbeat: ${heartbeat}`);
            if (work) console.log(`     Working:${work}`);
          }
        }

        if (pendingTasks.rows.length > 0) {
          console.log('\n' + colors.bright + '  ⏳ URGENT PENDING TASKS:' + colors.reset);
          for (const task of pendingTasks.rows) {
            const created = new Date(task.created_at).toLocaleTimeString();
            console.log(`\n  📋 ${task.title}`);
            console.log(`     Priority: ${task.priority} | Created: ${created}`);
          }
        }

        const activityLog = await db.query<{
          agent_id: string;
          activity: string;
          context: Record<string, unknown>;
          timestamp: Date;
          git_hash: string | null;
        }>(
          `SELECT agent_id, activity, context, timestamp, git_hash
           FROM activity_log
           WHERE activity IN ('task_started', 'task_completed', 'task_failed')
           ORDER BY timestamp DESC
           LIMIT 10`
        );

        if (activityLog.rows.length > 0) {
          console.log('\n' + colors.bright + '  📊 RECENT ACTIVITY:' + colors.reset);
          for (const log of activityLog.rows) {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const icon =
              log.activity === 'task_completed'
                ? '✅'
                : log.activity === 'task_failed'
                  ? '❌'
                  : '🔄';
            const taskTitle = log.context?.taskTitle || log.context?.taskId || 'unknown';
            console.log(
              `  ${icon} ${log.agent_id.substring(0, 8)}... ${log.activity}: ${taskTitle} (${time})`
            );
          }
        }

        console.log(
          '\n' +
            colors.bright +
            '═══════════════════════════════════════════════════════════════' +
            colors.reset
        );
        break;
      }

      case 'activity': {
        const subcommand = args[1];
        const db = await cliInstance.getDb();
        const { ActivityLogService } = await import('../services/ActivityLogService.js');
        const activityService = new ActivityLogService(db);

        if (subcommand === 'stats') {
          const stats = await activityService.getActivityStats();
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
          console.log(colors.bright + '  ACTIVITY STATISTICS' + colors.reset);
          console.log(
            colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
          console.log(`\n  Total Activities: ${stats.totalActivities}`);
          console.log(`  Recent Errors (24h): ${stats.recentErrors}`);

          console.log('\n' + colors.bright + '  By Type:' + colors.reset);
          for (const [type, count] of Object.entries(stats.activitiesByType)) {
            console.log(`    ${type}: ${count}`);
          }

          console.log('\n' + colors.bright + '  By Agent (Top 10):' + colors.reset);
          for (const [agent, count] of Object.entries(stats.activitiesByAgent)) {
            console.log(`    ${agent.substring(0, 12)}...: ${count}`);
          }
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
        } else if (subcommand === 'recent') {
          const limit = parseInt(args[args.indexOf('--limit') + 1] || '20', 10);
          const activities = await activityService.getRecentActivities(limit);

          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
          console.log(colors.bright + '  RECENT ACTIVITIES' + colors.reset);
          console.log(
            colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );

          for (const activity of activities) {
            const time = new Date(activity.timestamp).toLocaleString();
            console.log(`\n  📌 ${activity.activity}`);
            console.log(`     Agent: ${activity.agentId.substring(0, 12)}...`);
            console.log(`     Time: ${time}`);
            if (activity.gitHash) {
              console.log(`     Git: ${activity.gitHash} (${activity.gitBranch || 'unknown'})`);
            }
            console.log(`     Env: ${activity.environment}`);
          }
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
        } else {
          console.log('\nUsage: nezha activity <subcommand>');
          console.log('\nSubcommands:');
          console.log('  stats              Show activity statistics');
          console.log('  recent [--limit]   Show recent activities');
        }
        break;
      }

      case 'broadcasts': {
        const subcommand = args[1];
        const db = await cliInstance.getDb();
        const { BroadcastService } = await import('../services/BroadcastService.js');
        const broadcastService = await BroadcastService.create(db);

        if (subcommand === 'list') {
          const broadcasts = await broadcastService.getBroadcasts(20);
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
          console.log(colors.bright + '  BROADCASTS' + colors.reset);
          console.log(
            colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );

          for (const broadcast of broadcasts) {
            const icon =
              broadcast.priority === 'critical'
                ? '🚨'
                : broadcast.priority === 'high'
                  ? '⚠️'
                  : '📢';
            const readIcon = broadcast.readAt ? '✓' : '○';
            const time = new Date(broadcast.createdAt).toLocaleString();
            console.log(`\n  ${icon} [${broadcast.priority}] ${readIcon}`);
            console.log(
              `     ${broadcast.message.substring(0, 100)}${broadcast.message.length > 100 ? '...' : ''}`
            );
            console.log(
              `     From: ${broadcast.fromAgentName || broadcast.fromAgent.substring(0, 12)}...`
            );
            if (broadcast.gitHash) {
              console.log(`     Git: ${broadcast.gitHash} (${broadcast.gitBranch || 'unknown'})`);
            }
            console.log(`     Time: ${time}`);
          }
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
        } else if (subcommand === 'unread') {
          const broadcasts = await broadcastService.getUnreadBroadcasts();
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
          console.log(colors.bright + '  UNREAD BROADCASTS' + colors.reset);
          console.log(
            colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );

          if (broadcasts.length === 0) {
            console.log('\n  No unread broadcasts.');
          } else {
            for (const broadcast of broadcasts) {
              const icon =
                broadcast.priority === 'critical'
                  ? '🚨'
                  : broadcast.priority === 'high'
                    ? '⚠️'
                    : '📢';
              const time = new Date(broadcast.createdAt).toLocaleString();
              console.log(`\n  ${icon} [${broadcast.priority}]`);
              console.log(
                `     ${broadcast.message.substring(0, 100)}${broadcast.message.length > 100 ? '...' : ''}`
              );
              console.log(
                `     From: ${broadcast.fromAgentName || broadcast.fromAgent.substring(0, 12)}...`
              );
              console.log(`     Time: ${time}`);
            }
          }
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
        } else if (subcommand === 'read') {
          const count = await broadcastService.markAllAsRead();
          console.log(`\n✓ Marked ${count} broadcasts as read.`);
        } else if (subcommand === 'resolve') {
          const pattern = args[2];
          const resolution = args[3] || 'resolved';
          if (!pattern) {
            console.log('\nUsage: nezha broadcasts resolve <pattern> [resolution]');
            console.log('  Resolves all broadcasts matching the pattern.');
          } else {
            const count = await broadcastService.resolveRelatedBroadcasts(pattern, resolution);
            console.log(`\n✓ Resolved ${count} broadcasts matching "${pattern}"`);
          }
        } else if (subcommand === 'end') {
          const id = args[2];
          const resolution = args[3];
          if (!id) {
            console.log('\nUsage: nezha broadcasts end <id> [resolution]');
          } else {
            await broadcastService.endBroadcast(id, resolution);
            console.log(`\n✓ Ended broadcast: ${id}`);
          }
        } else {
          console.log('\nUsage: nezha broadcasts <subcommand>');
          console.log('\nSubcommands:');
          console.log('  list       List all broadcasts');
          console.log('  unread     List unread broadcasts');
          console.log('  read       Mark all broadcasts as read');
          console.log('  resolve    Resolve broadcasts matching pattern');
          console.log('  end        End a specific broadcast by ID');
        }
        break;
      }

      case 'agents':
      case 'agent': {
        const subcommand = args[1];
        const db = await cliInstance.getDb();
        const { AgentScoringService } = await import('../services/AgentScoringService.js');
        const agentScoring = new AgentScoringService(db);

        if (subcommand === 'scores' || subcommand === 'top') {
          const limit = parseInt(args[2] || '10', 10);
          const agents = await agentScoring.getTopAgents(limit);

          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
          console.log(colors.bright + '  TOP AI AGENTS BY SCORE' + colors.reset);
          console.log(
            colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );

          for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (!agent) continue;
            const rank = i + 1;
            const protectedIcon = agent.isProtected ? '🔒' : '  ';
            const shortId = agent.agentId.substring(0, 20) + '...';
            console.log(`\n  ${rank}. ${protectedIcon} ${colors.cyan}${shortId}${colors.reset}`);
            console.log(
              `     Score: ${colors.green}${agent.compositeScore.toFixed(2)}${colors.reset}`
            );
            console.log(
              `     Commits: ${agent.commitsCount} | Tasks: ${agent.tasksCompleted}✓ ${agent.tasksFailed}✗ | Meetings: ${agent.meetingContributions}`
            );
            console.log(`     Last active: ${agent.lastActive.toLocaleString()}`);
          }
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
        } else if (subcommand === 'stats') {
          const stats = await agentScoring.getStats();
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
          console.log(colors.bright + '  AGENT SCORING STATISTICS' + colors.reset);
          console.log(
            colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
          console.log(`\n  Total Agents: ${stats.totalAgents}`);
          console.log(`  Average Score: ${stats.averageScore.toFixed(2)}`);
          console.log('\n  Top 5 Agents:');
          for (const agent of stats.topAgents) {
            console.log(
              `    - ${agent.agentId.substring(0, 20)}... (${agent.compositeScore.toFixed(2)})`
            );
          }
          console.log(
            '\n' +
              colors.bright +
              '═══════════════════════════════════════════════════════════════' +
              colors.reset
          );
        } else if (subcommand === 'whoami') {
          const db = await cliInstance.getDb();
          const { AgentIdentityService } = await import('../services/AgentIdentityService.js');
          const identityService = new AgentIdentityService(db);
          const resolved = await identityService.resolve();
          await db.close();
          console.log(`\n  Agent ID: ${colors.cyan}${resolved.id}${colors.reset}`);
          if (resolved.displayName) {
            console.log(`  Display Name: ${colors.cyan}${resolved.displayName}${colors.reset}`);
          }
          console.log(`  Session: ${getCurrentSessionId() || '(none)'}`);
          console.log('');
        } else if (subcommand === 'soul-id') {
          const db = await cliInstance.getDb();
          const { SoulService } = await import('../services/SoulService.js');
          const soulService = new SoulService(db);
          const { AgentIdentityService } = await import('../services/AgentIdentityService.js');
          const identityService = new AgentIdentityService(db);
          const resolved = await identityService.resolve();
          const soul = await soulService.getSoul(resolved.id);
          await db.close();
          if (soul?.id) {
            console.log(soul.id);
          } else {
            console.log(resolved.id);
          }
        } else if (subcommand === 'sync') {
          console.log('\nSyncing agent scores from git commits...');
          const commitCounts = await agentScoring.syncGitCommits();
          console.log(`✓ Synced commits for ${commitCounts.size} agents`);

          console.log('Syncing agent scores from tasks...');
          await agentScoring.syncTaskStats();
          console.log('✓ Synced task stats');
        } else if (subcommand === 'protect') {
          const agentId = args[2];
          if (!agentId) {
            console.log('Usage: nezha agents protect <agent_id>');
            break;
          }
          await agentScoring.setProtected(agentId, true);
          console.log(`\n✓ Protected agent: ${agentId}`);
        } else if (subcommand === 'unprotect') {
          const agentId = args[2];
          if (!agentId) {
            console.log('Usage: nezha agents unprotect <agent_id>');
            break;
          }
          await agentScoring.setProtected(agentId, false);
          console.log(`\n✓ Unprotected agent: ${agentId}`);
        } else if (subcommand === 'show') {
          const agentId = args[2];
          if (!agentId) {
            console.log('Usage: nezha agents show <agent_id>');
            break;
          }
          const score = await agentScoring.getAgentScore(agentId);
          if (!score) {
            console.log(`\nAgent not found: ${agentId}`);
          } else {
            console.log(
              '\n' +
                colors.bright +
                '═══════════════════════════════════════════════════════════════' +
                colors.reset
            );
            console.log(colors.bright + '  AGENT SCORE DETAILS' + colors.reset);
            console.log(
              colors.bright +
                '═══════════════════════════════════════════════════════════════' +
                colors.reset
            );
            console.log(`\n  Agent ID: ${score.agentId}`);
            console.log(
              `  Composite Score: ${colors.green}${score.compositeScore.toFixed(2)}${colors.reset}`
            );
            console.log(`  Protected: ${score.isProtected ? '🔒 Yes' : 'No'}`);
            console.log('\n  Metrics:');
            console.log(`    Commits: ${score.commitsCount}`);
            console.log(`    Tasks Completed: ${score.tasksCompleted}`);
            console.log(`    Tasks Failed: ${score.tasksFailed}`);
            console.log(`    Meeting Contributions: ${score.meetingContributions}`);
            console.log(`    Code Reviews: ${score.codeReviews}`);
            console.log('\n  Timeline:');
            console.log(`    First Seen: ${score.firstSeen.toLocaleString()}`);
            console.log(`    Last Active: ${score.lastActive.toLocaleString()}`);
            console.log(
              '\n' +
                colors.bright +
                '═══════════════════════════════════════════════════════════════' +
                colors.reset
            );
          }
        } else {
          console.log('\nUsage: nezha agents <subcommand>');
          console.log('\nSubcommands:');
          console.log('  whoami               Show current agent identity');
          console.log('  scores [n]          Show top n agents by score (default: 10)');
          console.log('  stats               Show agent scoring statistics');
          console.log('  show <agent_id>     Show details for a specific agent');
          console.log('  sync                Sync scores from git commits and tasks');
          console.log('  protect <id>        Protect an agent from being killed');
          console.log('  unprotect <id>      Remove protection from an agent');
        }
        break;
      }

      case 'help': {
        const searchTerm = args[1]?.toLowerCase();
        if (searchTerm && searchTerm !== '--help' && searchTerm !== '-h') {
          showHelpFiltered(searchTerm);
        } else {
          showHelp();
        }
        break;
      }

      default:
        showHelp();
        break;
    }
  } catch (error) {
    cli.error(error instanceof Error ? error.message : String(error));
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

function showHelp(): void {
  cli.header('Nezha CLI - Autonomous Development System');
  console.log(`
  ${colors.bright}Usage:${colors.reset} nezha <command> [options]

  ${colors.bright}Commands:${colors.reset}
    start                         Start the heartbeat service
    stop                          Stop the heartbeat service
    status                        Show current status
    install                       Install Nezha as launchd daemon (macOS)
    uninstall                     Uninstall Nezha daemon
    setup-hooks                   Install git hooks for auto agent ID in commits
    validate-commit <file>        Validate commit message has task/issue/review ID
    daemon-status                 Show daemon installation status
    health                        Show health information
    processes                     Show opencode run processes
    processes kill                Kill all opencode run processes
    skill-sync                    Sync approved skills to Trae AI (.trae/skills/)
    task-add <title> [desc]      Add a new task
    schedule <name> <desc> <cron> Create a scheduled task
    continuous-improvement       Add a continuous improvement cycle task
    improve                      (alias for continuous-improvement)
    learn <insight>              Save learning to memory [--context] [--importance 1-10]
    prompt-suggest <cur> <sug> [reason]  Suggest a prompt improvement
    areflect <text>             Parse reflection markers (for Trae AI)
    reflection-stats              Show reflection system statistics
    reflection-summary            Generate daily reflection summary
    reflection-trends             Show 7-day reflection trends
    import-docs                   Import docs/ folder to memory
    share <text>                Broadcast a reflection to all AIs
    workflow-validate          Validate code change has valid source (Issue/Task/Review)
    tasks [--tag <tag>]          List tasks (filter by tag, status, category)
    table-of-tasks (tot)          Show task table with summary
    templates <cmd>               Manage task templates
    auto-tag-rules <cmd>         Manage auto-tagging rules
    api-key create <name>         Create API key
    api-key list                  List API keys
    api-key revoke <name>         Revoke API key
    review-request [commit]       Request AI review of current changes
    review-show [id]              Show review details or pending reviews
    review-stats                  Show review statistics
    review-respond <id> <msg>     Respond to a review

  ${colors.bright}Monitoring Commands:${colors.reset}
    dlq list                      List dead letter queue
    dlq resolve <id> [--notes]    Mark DLQ item as resolved
    dlq retry <id>                Retry DLQ item as new task
    dlq retry-all                 Retry all DLQ items as new tasks
    dlq delete <id>               Delete DLQ item
    reset-failed [--older-than]   Reset all FAILED tasks to PENDING
    learn-from-failures           Create improvement tasks from failure patterns
    alerts list                   List failure alerts
    alerts ack <id>               Acknowledge an alert
    alerts stats                  Show alert statistics
    watchdog stats                Show watchdog statistics
    watchdog cleanup              Clean up orphaned processes
    longtasks stats               Show long task statistics
    longtasks paused              List paused tasks
    longtasks failures            Show failure statistics by category

  ${colors.bright}Meeting Commands:${colors.reset}
    meeting discuss <title>       Create an AI discussion
    meeting list [--status]       List active discussions
    meeting show [id]             Show discussion details
    meeting opinion <id> <author> Record an opinion
    meeting consensus <t> <p> <d> Record consensus reached
    meeting history [--limit]     Show consensus history

  ${colors.bright}Broadcast & Activity Commands:${colors.reset}
    announce <message>            Broadcast message to all AIs
    announce <msg> --priority <p> Broadcast with priority (low|normal|high|critical)
    announce <msg> --to <agent>   Send direct message to specific AI
    who-is-working                Show which AI is working on what
    broadcasts list               List all broadcasts
    broadcasts unread             List unread broadcasts
    broadcasts read               Mark all broadcasts as read
    activity stats                Show activity statistics
    activity recent [--limit]     Show recent activities

  ${colors.bright}Agent Scoring Commands:${colors.reset}
    agents scores [n]             Show top n agents by score
    agents stats                  Show agent scoring statistics
    agents show <id>              Show details for a specific agent
    agents sync                   Sync scores from git commits and tasks
    agents protect <id>           Protect an agent from being killed
    agents unprotect <id>         Remove protection from an agent

    help                          Show this help

 ${colors.bright}Options:${colors.reset}
   --transport <mode>           Transport mode: http or cli (default: http)
   --stream                     Enable streaming output (CLI mode only)
   --verbose                    Enable verbose logging
   --priority <n>                Task priority (0-100)
   --depends-on <uuid...>       Task IDs this task depends on
   --tag <tag>                  Filter by tag
   --status <status>            Filter by status
   --category <category>       Filter by category (security, performance, feature, bugfix)
   --dry-run                    Show what would be done without executing
   --json                       Output as JSON
   --format=json                Output as JSON

 ${colors.bright}Environment Variables:${colors.reset}
   NEZHA_TRANSPORT_MODE          Default transport mode (http or cli)
   NEZHA_OPENCODE_API_URL       OpenCode API URL for HTTP transport

  ${colors.bright}Examples:${colors.reset}
    ${colors.cyan}$ nezha start${colors.reset}
    ${colors.cyan}$ nezha start --transport cli --verbose${colors.reset}
    ${colors.cyan}$ nezha task-add "Review PR #123" "Check for bugs" --priority 5${colors.reset}
    ${colors.cyan}$ nezha task-add "Deploy" "Deploy to prod" --depends-on build-uuid --dry-run${colors.reset}
    ${colors.cyan}$ nezha task-add "Fix bug" "Critical bug" --json${colors.reset}
    ${colors.cyan}$ nezha schedule "Daily Cleanup" "Clean up" "0 2 * * *" --priority 10${colors.reset}
    ${colors.cyan}$ nezha tasks --status PENDING --tag urgent${colors.reset}
    ${colors.cyan}$ nezha tasks --category bugfix --json${colors.reset}
    ${colors.cyan}$ nezha tasks --format=json${colors.reset}
    ${colors.cyan}$ nezha meeting discuss "API Design" "REST or GraphQL?"${colors.reset}
    ${colors.cyan}$ nezha meeting list${colors.reset}
    ${colors.cyan}$ nezha meeting history${colors.reset}
  `);
}

function showHelpFiltered(searchTerm: string): void {
  const allCommands = [
    { cmd: 'start', desc: 'Start the heartbeat service' },
    { cmd: 'stop', desc: 'Stop the heartbeat service' },
    { cmd: 'status', desc: 'Show current status' },
    { cmd: 'install', desc: 'Install Nezha as launchd daemon (macOS)' },
    { cmd: 'uninstall', desc: 'Uninstall Nezha daemon' },
    { cmd: 'setup-hooks', desc: 'Install git hooks for auto agent ID in commits' },
    { cmd: 'validate-commit', desc: 'Validate commit message has task/issue/review ID' },
    { cmd: 'daemon-status', desc: 'Show daemon installation status' },
    { cmd: 'health', desc: 'Show health information' },
    { cmd: 'processes', desc: 'Show opencode run processes' },
    { cmd: 'processes kill', desc: 'Kill all opencode run processes' },
    { cmd: 'skill-sync', desc: 'Sync approved skills to Trae AI (.trae/skills/)' },
    { cmd: 'task-add <title> [desc]', desc: 'Add a new task' },
    { cmd: 'schedule <name> <desc> <cron>', desc: 'Create a scheduled task' },
    { cmd: 'continuous-improvement', desc: 'Add a continuous improvement cycle task' },
    { cmd: 'improve', desc: '(alias for continuous-improvement)' },
    { cmd: 'learn <insight>', desc: 'Save learning to memory [--context] [--importance 1-10]' },
    { cmd: 'prompt-suggest <cur> <sug> [reason]', desc: 'Suggest a prompt improvement' },
    { cmd: 'areflect <text>', desc: 'Parse reflection markers (for Trae AI)' },
    { cmd: 'reflection-stats', desc: 'Show reflection system statistics' },
    { cmd: 'reflection-summary', desc: 'Generate daily reflection summary' },
    { cmd: 'reflection-trends', desc: 'Show 7-day reflection trends' },
    { cmd: 'import-docs', desc: 'Import docs/ folder to memory' },
    { cmd: 'share <text>', desc: 'Broadcast a reflection to all AIs' },
    { cmd: 'workflow-validate', desc: 'Validate code has Issue/Task/Review source' },
    { cmd: 'tasks [--tag <tag>]', desc: 'List tasks (filter by tag, status, category)' },
    { cmd: 'table-of-tasks (tot)', desc: 'Show task table with summary' },
    { cmd: 'templates <cmd>', desc: 'Manage task templates' },
    { cmd: 'auto-tag-rules <cmd>', desc: 'Manage auto-tagging rules' },
    { cmd: 'api-key create <name>', desc: 'Create API key' },
    { cmd: 'api-key list', desc: 'List API keys' },
    { cmd: 'api-key revoke <name>', desc: 'Revoke API key' },
    { cmd: 'review-request [commit]', desc: 'Request AI review of current changes' },
    { cmd: 'review-show [id]', desc: 'Show review details or pending reviews' },
    { cmd: 'review-stats', desc: 'Show review statistics' },
    { cmd: 'review-respond <id> <msg>', desc: 'Respond to a review' },
    { cmd: 'dlq list', desc: 'List dead letter queue' },
    { cmd: 'dlq resolve <id> [--notes]', desc: 'Mark DLQ item as resolved' },
    { cmd: 'dlq retry <id>', desc: 'Retry DLQ item as new task' },
    { cmd: 'dlq retry-all', desc: 'Retry all DLQ items as new tasks' },
    { cmd: 'dlq delete <id>', desc: 'Delete DLQ item' },
    { cmd: 'reset-failed [--older-than]', desc: 'Reset all FAILED tasks to PENDING' },
    { cmd: 'learn-from-failures', desc: 'Create improvement tasks from failure patterns' },
    { cmd: 'alerts list', desc: 'List failure alerts' },
    { cmd: 'alerts ack <id>', desc: 'Acknowledge an alert' },
    { cmd: 'alerts stats', desc: 'Show alert statistics' },
    { cmd: 'watchdog stats', desc: 'Show watchdog statistics' },
    { cmd: 'watchdog cleanup', desc: 'Clean up orphaned processes' },
    { cmd: 'longtasks stats', desc: 'Show long task statistics' },
    { cmd: 'longtasks paused', desc: 'List paused tasks' },
    { cmd: 'longtasks failures', desc: 'Show failure statistics by category' },
    { cmd: 'meeting discuss <title>', desc: 'Create an AI discussion' },
    { cmd: 'meeting list [--status]', desc: 'List active discussions' },
    { cmd: 'meeting show [id]', desc: 'Show discussion details' },
    { cmd: 'meeting opinion <id> <author>', desc: 'Record an opinion' },
    { cmd: 'meeting consensus <t> <p> <d>', desc: 'Record consensus reached' },
    { cmd: 'meeting history [--limit]', desc: 'Show consensus history' },
    { cmd: 'announce <message>', desc: 'Broadcast message to all AIs' },
    { cmd: 'announce <msg> --priority <p>', desc: 'Broadcast with priority' },
    { cmd: 'announce <msg> --to <agent>', desc: 'Send direct message to specific AI' },
    { cmd: 'who-is-working', desc: 'Show which AI is working on what' },
    { cmd: 'broadcasts list', desc: 'List all broadcasts' },
    { cmd: 'broadcasts unread', desc: 'List unread broadcasts' },
    { cmd: 'broadcasts read', desc: 'Mark all broadcasts as read' },
    { cmd: 'activity stats', desc: 'Show activity statistics' },
    { cmd: 'activity recent [--limit]', desc: 'Show recent activities' },
    { cmd: 'agents scores [n]', desc: 'Show top n agents by score' },
    { cmd: 'agents stats', desc: 'Show agent scoring statistics' },
    { cmd: 'agents show <id>', desc: 'Show details for a specific agent' },
    { cmd: 'agents sync', desc: 'Sync scores from git commits and tasks' },
    { cmd: 'agents protect <id>', desc: 'Protect an agent from being killed' },
    { cmd: 'agents unprotect <id>', desc: 'Remove protection from an agent' },
    { cmd: 'issue create <title>', desc: 'Create an issue' },
    { cmd: 'issue list', desc: 'List issues' },
    { cmd: 'issue show <id>', desc: 'Show issue details' },
    { cmd: 'issue close <id>', desc: 'Close an issue' },
    { cmd: 'help [keyword]', desc: 'Show this help (or search by keyword)' },
  ];

  const filtered = allCommands.filter(
    c => c.cmd.toLowerCase().includes(searchTerm) || c.desc.toLowerCase().includes(searchTerm)
  );

  if (filtered.length === 0) {
    console.log(`${colors.yellow}No commands found matching "${searchTerm}"${colors.reset}`);
    console.log(`\nTry: nezha help (to see all commands)`);
    return;
  }

  cli.header(`Nezha CLI - Commands matching "${searchTerm}"`);
  console.log('');
  filtered.forEach(c => {
    console.log(`  ${colors.cyan}${c.cmd.padEnd(35)}${colors.reset} ${c.desc}`);
  });
  console.log(`\n${colors.bright}Total: ${filtered.length} command(s)${colors.reset}`);
}

main();
