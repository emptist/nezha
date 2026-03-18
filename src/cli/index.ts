import { config } from 'dotenv';
config();

import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { HeartbeatService } from '../services/HeartbeatService.js';
import { HealthServer } from '../services/HealthServer.js';
import { CheckpointService } from '../services/CheckpointService.js';
import { TASK_STATUS } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { cli, colors } from '../utils/cli.js';
import {
  sanitizeTaskTitle,
  sanitizeTaskDescription,
  sanitizePriority,
  sanitizeUUID,
  sanitizeTags,
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

  constructor() {
    this.config = Config.getInstance();
    this.checkpointService = new CheckpointService();
  }

  private async getDb(): Promise<DatabaseClient> {
    if (!this.db) {
      this.db = new DatabaseClient(this.config);
    }
    return this.db;
  }

  async start(): Promise<void> {
    const db = await this.getDb();

    const embeddingConfig = this.config.getEmbeddingConfig();
    this.heartbeatService = new HeartbeatService(db, {
      heartbeatIntervalMs: this.config.getTaskConfig().heartbeatIntervalMs,
      embedding: embeddingConfig,
    });

    // Pass checkpoint service to heartbeat service for state tracking
    this.heartbeatService.setCheckpointService(this.checkpointService);

    // HeartbeatService handles checkpoint loading and orphaned task reset
    await this.heartbeatService.start();

    this.healthServer = new HealthServer(db, 4097);
    await this.healthServer.start();

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
    console.log(`Heartbeat running: ${this.heartbeatService?.isRunning() ?? false}`);
    console.log(`Pending tasks: ${pendingCount}`);
  }

  async health(): Promise<void> {
    const health = this.heartbeatService?.getHealth();
    if (health) {
      console.log(JSON.stringify(health, null, 2));
    } else {
      console.log('Heartbeat service not initialized');
    }
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
    jsonOutput: boolean = false
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
      finalTitle = title || template.description.split('\n')[0];
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
    const maxRetries = this.config.getTaskConfig().maxRetries;
    const taskId = crypto.randomUUID();
    await db.query(
      `INSERT INTO tasks (id, title, description, status, priority, depends_on, max_retries, timeout_seconds, is_long_running, type, assigned_to, category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        taskId,
        taskData.title,
        taskData.description,
        TASK_STATUS.PENDING,
        taskData.priority,
        taskData.dependsOn,
        maxRetries,
        taskData.timeoutSeconds,
        taskData.timeoutSeconds && taskData.timeoutSeconds > 600,
        taskData.taskType,
        taskData.assignedTo,
        taskData.category,
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

    const cronParts = cronExpression.trim().split(/\s+/);
    if (cronParts.length !== 5) {
      cli.error(
        `Invalid cron expression: expected 5 parts (minute hour day month weekday), got ${cronParts.length}`
      );
      process.exit(1);
    }

    const taskData = {
      name: name.trim(),
      description: description.trim(),
      cronExpression,
      priority,
    };

    if (dryRun) {
      cli.dryRun('Would create scheduled task:');
      cli.dim(JSON.stringify(taskData, null, 2));
      return;
    }

    const db = await this.getDb();

    await db.query(
      `INSERT INTO scheduled_tasks (name, description, cron_expression, priority, next_run) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [taskData.name, taskData.description, taskData.cronExpression, taskData.priority]
    );
    cli.success(`Scheduled task created: "${name}" (cron: ${cronExpression})`);
  }

  async addContinuousImprovementTask(): Promise<void> {
    const description = `Continuous Improvement Cycle:
1. Read HEARTBEAT.md to get task list
2. For each task in the list:
   a. Execute the task
   b. Review the results
   c. If issues found, fix them
   d. Update documentation if needed
   e. Run tests/build
   f. Commit and push changes
3. Update HEARTBEAT.md with completed tasks and new tasks
4. Report what was accomplished`;

    await this.addTask('Continuous Improvement Cycle', description, 10);
  }

  async listTasks(
    tag?: string,
    status?: string,
    category?: string,
    jsonOutput: boolean = false
  ): Promise<void> {
    const db = await this.getDb();
    let query = `SELECT id, title, status, priority, tags, category, created_at FROM tasks WHERE 1=1`;
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

    query += ` ORDER BY priority DESC, created_at DESC LIMIT 20`;

    const result = await db.query<TaskRow>(query, params);

    if (jsonOutput) {
      console.log(JSON.stringify(result.rows, null, 2));
      return;
    }

    if (result.rows.length === 0) {
      cli.info('No tasks found');
      return;
    }

    cli.info(`Found ${result.rows.length} task(s):\n`);
    cli.table(
      ['Status', 'Category', 'Title', 'Priority', 'Tags'],
      result.rows.map(row => [
        row.status,
        row.category || '-',
        row.title.substring(0, 35) + (row.title.length > 35 ? '...' : ''),
        row.priority.toString(),
        (row.tags || []).join(', '),
      ])
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

    const result = await db.query(`DELETE FROM auto_tag_rules WHERE keyword = $1`, [
      keyword.toLowerCase(),
    ]);

    cli.success(`Auto-tag rule "${keyword}" deleted`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';

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

      case 'health':
        await cliInstance.health();
        break;

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
          priority = parseInt(args[priorityIndex + 1], 10) || 0;
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

        await cliInstance.scheduleTask(name, description, cronExpression, priority, dryRun);
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

        await cliInstance.listTasks(tag, status, category, jsonOutput);
        break;
      }

      case 'api-key': {
        const subcommand = args[1];

        if (subcommand === 'create') {
          const name = args[2];
          const rateIndex = args.indexOf('--rate');
          const rateLimit =
            rateIndex !== -1 && args[rateIndex + 1] ? parseInt(args[rateIndex + 1], 10) : 100;

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
            priority = parseInt(args[priorityIndex + 1], 10) || 0;
          }

          const typeIndex = args.indexOf('--type');
          if (typeIndex !== -1 && typeIndex + 1 < args.length) {
            taskType = args[typeIndex + 1];
          }

          const timeoutIndex = args.indexOf('--timeout');
          if (timeoutIndex !== -1 && timeoutIndex + 1 < args.length) {
            timeoutSeconds = parseInt(args[timeoutIndex + 1], 10) || 300;
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

      case 'help':
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
    health                        Show health information
    task-add <title> [desc]      Add a new task
    schedule <name> <desc> <cron> Create a scheduled task
    tasks [--tag <tag>] [--status <status>] [--category <category>] List tasks (filter by tag, status, category)
    templates <cmd>              Manage task templates
    auto-tag-rules <cmd>         Manage auto-tagging rules
    tasks [--tag <tag>]          List tasks
    api-key create <name>        Create API key
    api-key list                  List API keys
    api-key revoke <name>         Revoke API key
    help                          Show this help

  ${colors.bright}Options:${colors.reset}
   --priority <n>                Task priority (0-100)
   --depends-on <uuid...>       Task IDs this task depends on
   --tag <tag>                  Filter by tag
    --status <status>            Filter by status
    --category <category>       Filter by category (security, performance, feature, bugfix)
    --dry-run                    Show what would be done without executing
    --json                       Output as JSON
    --format=json                Output as JSON

 ${colors.bright}Examples:${colors.reset}
   ${colors.cyan}$ nezha start${colors.reset}
   ${colors.cyan}$ nezha task-add "Review PR #123" "Check for bugs" --priority 5${colors.reset}
   ${colors.cyan}$ nezha task-add "Deploy" "Deploy to prod" --depends-on build-uuid --dry-run${colors.reset}
   ${colors.cyan}$ nezha task-add "Fix bug" "Critical bug" --json${colors.reset}
   ${colors.cyan}$ nezha schedule "Daily Cleanup" "Clean up" "0 2 * * *" --priority 10${colors.reset}
   ${colors.cyan}$ nezha tasks --status PENDING --tag urgent${colors.reset}
   ${colors.cyan}$ nezha tasks --category bugfix --json${colors.reset}
   ${colors.cyan}$ nezha tasks --format=json${colors.reset}
`);
}

main();
