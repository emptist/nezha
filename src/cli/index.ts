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
  sanitizeTags 
} from '../utils/sanitization.js';

interface TaskRow {
  id: number;
  title: string;
  status: string;
  priority: number;
  tags?: string[];
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
      embedding: embeddingConfig
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

  async addTask(title: string, description: string, priority: number = 0, dependsOn?: string[], dryRun: boolean = false)
  : Promise<void> {
    cli.step('Validating task input...');
    
    const titleResult = sanitizeTaskTitle(title);
    if (!titleResult.valid) {
      cli.error(`Invalid title: ${titleResult.error}`);
      process.exit(1);
    }
    
    const descResult = sanitizeTaskDescription(description);
    if (!descResult.valid) {
      cli.error(`Invalid description: ${descResult.error}`);
      process.exit(1);
    }
    
    const priorityResult = sanitizePriority(priority);
    if (!priorityResult.valid) {
      cli.error(`Invalid priority: ${priorityResult.error}`);
      process.exit(1);
    }

    const taskData = {
      title: titleResult.sanitized,
      description: descResult.sanitized || '',
      priority: parseInt(priorityResult.sanitized || '0', 10),
      dependsOn: dependsOn || [],
    };

    if (dryRun) {
      cli.dryRun('Would create task:');
      cli.dim(JSON.stringify(taskData, null, 2));
      return;
    }

    const db = await this.getDb();
    await db.query(
      `INSERT INTO tasks (title, description, status, priority, depends_on) VALUES ($1, $2, $3, $4, $5)`,
      [taskData.title, taskData.description, TASK_STATUS.PENDING, taskData.priority, taskData.dependsOn]
    );
    
    if (dependsOn && dependsOn.length > 0) {
      cli.success(`Task created: "${taskData.title}" (depends on: ${dependsOn.join(', ')})`);
    } else {
      cli.success(`Task created: "${taskData.title}"`);
    }
  }

  async scheduleTask(name: string, description: string, cronExpression: string, priority: number = 0, dryRun: boolean = 
  false): Promise<void> {
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
      cli.error(`Invalid cron expression: expected 5 parts (minute hour day month weekday), got ${cronParts.length}`);
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
    
    await this.addTask("Continuous Improvement Cycle", description, 10);
  }

  async listTasks(tag?: string, status?: string): Promise<void> {
    const db = await this.getDb();
    let query = `SELECT id, title, status, priority, tags, created_at FROM tasks WHERE 1=1`;
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

    query += ` ORDER BY priority DESC, created_at DESC LIMIT 20`;

    const result = await db.query<TaskRow>(query, params);

    if (result.rows.length === 0) {
      cli.info('No tasks found');
      return;
    }

    cli.info(`Found ${result.rows.length} task(s):\n`);
    cli.table(['Status', 'Title', 'Priority', 'Tags'], 
      result.rows.map(row => [
        row.status,
        row.title.substring(0, 40) + (row.title.length > 40 ? '...' : ''),
        row.priority.toString(),
        (row.tags || []).join(', ')
      ])
    );
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
        const title = args[1];
        let description = args[2] ?? '';
        let priority = 0;
        let dependsOn: string[] | undefined;
        const dryRun = args.includes('--dry-run');
        
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
        
        if (!title) {
          cli.error('Task title is required');
          console.log('\nUsage: nezha task-add <title> [description] [--priority <n>] [--depends-on <uuid...>] [--dry-run]');
          console.log('\nExamples:');
          console.log('  nezha task-add "Review PR #123" "Check for bugs" --priority 5');
          console.log('  nezha task-add "Deploy" "Deploy to prod" --depends-on build-id --dry-run');
          process.exit(1);
        }
        
        await cliInstance.addTask(title, description, priority, dependsOn, dryRun);
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
          console.log('\nUsage: nezha schedule <name> <description> <cron> [--priority <n>] [--dry-run]');
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
        const tag = tagIndex !== -1 ? args[tagIndex + 1] : undefined;
        const status = statusIndex !== -1 ? args[statusIndex + 1] : undefined;
        
        await cliInstance.listTasks(tag, status);
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
  tasks [--tag <tag>]          List tasks
  help                          Show this help

${colors.bright}Options:${colors.reset}
  --priority <n>                Task priority (0-100)
  --depends-on <uuid...>       Task IDs this task depends on
  --tag <tag>                  Filter by tag
  --status <status>            Filter by status
  --dry-run                    Show what would be done without executing

${colors.bright}Examples:${colors.reset}
  ${colors.cyan}$ nezha start${colors.reset}
  ${colors.cyan}$ nezha task-add "Review PR #123" "Check for bugs" --priority 5${colors.reset}
  ${colors.cyan}$ nezha task-add "Deploy" "Deploy to prod" --depends-on build-uuid --dry-run${colors.reset}
  ${colors.cyan}$ nezha schedule "Daily Cleanup" "Clean up" "0 2 * * *" --priority 10${colors.reset}
  ${colors.cyan}$ nezha tasks --status PENDING --tag urgent${colors.reset}
`);
}

main();
