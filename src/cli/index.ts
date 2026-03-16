import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { HeartbeatService } from '../services/HeartbeatService.js';
import { TASK_STATUS } from '../config/constants.js';

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

  constructor() {
    this.config = Config.getInstance();
  }

  private async getDb(): Promise<DatabaseClient> {
    if (!this.db) {
      this.db = new DatabaseClient(this.config);
    }
    return this.db;
  }

  async start(): Promise<void> {
    const db = await this.getDb();
    this.heartbeatService = new HeartbeatService(db);
    await this.heartbeatService.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      await this.stop();
      process.exit(0);
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatService) {
      await this.heartbeatService.stop();
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

  async addTask(title: string, description: string, priority: number = 0): Promise<void> {
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
      `INSERT INTO tasks (title, description, status, priority) VALUES ($1, $2, $3, $4)`,
      [title.trim(), description.trim(), TASK_STATUS.PENDING, priority]
    );
    console.log(`Task added: ${title}`);
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
      const description = args[2] ?? '';
      const priority = parseInt(args[3] ?? '0', 10);
      if (title) {
        await cli.addTask(title, description, priority);
      } else {
        console.error('Usage: nezha task-add <title> [description] [priority]');
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

Examples:
  nezha start
  nezha task-add "Review code" "Review src/core for issues" 5
  nezha tasks
`);
      break;
  }
}

main();
