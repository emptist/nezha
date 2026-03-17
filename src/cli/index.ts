import { config } from 'dotenv';
config();

import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { HeartbeatService } from '../services/HeartbeatService.js';
import { HealthServer } from '../services/HealthServer.js';
import { CheckpointService } from '../services/CheckpointService.js';
import { TASK_STATUS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

interface TaskRow {
  id: number;
  title: string;
  status: string;
  priority: number;
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
    
    // Load previous state if exists
    const savedState = await this.checkpointService.loadState();
    if (savedState) {
      logger.info('Found saved state, resuming...');
      await this.checkpointService.resetRunningTasks(db);
    }
    
    const embeddingConfig = this.config.getEmbeddingConfig();
    this.heartbeatService = new HeartbeatService(db, {
      heartbeatIntervalMs: this.config.getTaskConfig().heartbeatIntervalMs,
      embedding: embeddingConfig
    });
    
    // Pass checkpoint service to heartbeat service for state tracking
    this.heartbeatService.setCheckpointService(this.checkpointService);
    
    await this.heartbeatService.start();
    
    this.healthServer = new HealthServer(db, 4097);
    await this.healthServer.start();
    
    // Handle graceful shutdown - save state before exit
    const shutdown = async () => {
      logger.info('Graceful shutdown initiated...');
      await this.checkpointService.saveState();
      await this.stop();
    };
    
    process.on('SIGINT', async () => {
      await shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      await shutdown();
      process.exit(0);
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatService) {
      await this.heartbeatService.stop();
    }
    if (this.healthServer) {
      await this.healthServer.stop();
    }
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

  async addTask(title: string, description: string, priority: number = 0, dependsOn?: string[]): Promise<void> {
    if (!title || title.trim().length === 0) {
      throw new Error('Task title is required');
    }
    if (title.length > 500) {
      throw new Error('Task title must be less than 500 characters');
    }
    if (description && description.length > 5000) {
      throw new Error('Task description must be less than 5000 characters');
    }
    if (priority < 0 || priority > 100) {
      throw new Error('Priority must be between 0 and 100');
    }
    
    const db = await this.getDb();
    await db.query(
      `INSERT INTO tasks (title, description, status, priority, depends_on) VALUES ($1, $2, $3, $4, $5)`,
      [title.trim(), description.trim(), TASK_STATUS.PENDING, priority, dependsOn || []]
    );
    if (dependsOn && dependsOn.length > 0) {
      console.log(`Task added: ${title} (depends on: ${dependsOn.join(', ')})`);
    } else {
      console.log(`Task added: ${title}`);
    }
  }

  async scheduleTask(name: string, description: string, cronExpression: string, priority: number = 0): Promise<void> {
    if (!name || name.trim().length === 0) {
      throw new Error('Task name is required');
    }
    if (!cronExpression || cronExpression.trim().length === 0) {
      throw new Error('Cron expression is required');
    }
    
    const db = await this.getDb();
    
    // Validate cron expression (basic check)
    const cronParts = cronExpression.trim().split(/\s+/);
    if (cronParts.length !== 5) {
      throw new Error('Invalid cron expression: expected 5 parts (minute hour day month weekday)');
    }
    
    await db.query(
      `INSERT INTO scheduled_tasks (name, description, cron_expression, priority, next_run) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [name.trim(), description.trim(), cronExpression, priority]
    );
    console.log(`Scheduled task added: ${name} (cron: ${cronExpression})`);
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

  async listTasks(): Promise<void> {
    const db = await this.getDb();
    const result = await db.query<TaskRow>(
      `SELECT id, title, status, priority FROM tasks ORDER BY priority DESC, created_at DESC LIMIT 10`
    );
    for (const row of result.rows) {
      console.log(`  [${row.status}] ${row.title} (priority: ${row.priority})`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';
  
  const cli = new Cli();

  switch (command) {
    case 'start':
      await cli.start();
      break;
    case 'stop':
      await cli.stop();
      break;
    case 'status':
      await cli.status();
      break;
    case 'health':
      await cli.health();
      break;
    case 'task-add':
      const title = args[1];
      let description = args[2] ?? '';
      let priority = parseInt(args[3] ?? '0', 10);
      let dependsOn: string[] | undefined;
      
      // Check for --depends-on flag
      const dependsOnIndex = args.indexOf('--depends-on');
      if (dependsOnIndex !== -1 && dependsOnIndex < args.length - 1) {
        dependsOn = args.slice(dependsOnIndex + 1).filter(a => !a.startsWith('--'));
      }
      
      // Check for --priority flag
      const priorityIndex = args.indexOf('--priority');
      if (priorityIndex !== -1 && priorityIndex < args.length - 1) {
        priority = parseInt(args[priorityIndex + 1], 10);
      }
      
      if (title) {
        await cli.addTask(title, description, priority, dependsOn);
      } else {
        console.error('Usage: nezha task-add <title> [description] [--priority <n>] [--depends-on <uuid1> <uuid2> ...]')
  ;
      }
      break;
    case 'tasks':
      await cli.listTasks();
      break;
    case 'help':
    default:
      console.log(`
Nezha CLI - Task automation with continuous improvement

Usage: nezha <command>

Commands:
  start                       Start the heartbeat service
  stop                        Stop the heartbeat service
  status                      Show current status
  health                      Show health information
  task-add <title> [desc]     Add a new task
  tasks                       List pending tasks
  help                        Show this help message

Options:
  --priority <n>              Task priority (0-100)
  --depends-on <uuid>        Task IDs this task depends on

Examples:
  nezha start
  nezha task-add "Review code" "Review src/core for issues" --priority 5
  nezha task-add "Deploy" "Deploy to production" --depends-on build-task-id
  nezha task-add "Test" "" --priority 10 --depends-on build-task-id integration-task-id
  nezha tasks
`);
      break;
  }
}

main();
