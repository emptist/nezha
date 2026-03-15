import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { HeartbeatService } from '../services/HeartbeatService.js';
import { TASK_STATUS } from '../config/constants.js';

interface CliArgs {
  command: string;
  options: Record<string, string>;
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
    const result = await db.query(
      `SELECT COUNT(*) as count FROM tasks WHERE status = $1`,
      [TASK_STATUS.PENDING]
    );
    console.log(`Pending tasks: ${result.rows[0]?.count ?? 0}`);
    console.log(`Heartbeat running: ${this.heartbeatService?.isRunning() ?? false}`);
  }

  async addTask(title: string, description: string, priority: number = 0): Promise<void> {
    const db = await this.getDb();
    await db.query(
      `INSERT INTO tasks (title, description, status, priority) VALUES ($1, $2, $3, $4)`,
      [title, description, TASK_STATUS.PENDING, priority]
    );
    console.log(`Task added: ${title}`);
  }

  async listTasks(): Promise<void> {
    const db = await this.getDb();
    const result = await db.query(
      `SELECT id, title, status, priority FROM tasks ORDER BY priority DESC, created_at DESC LIMIT 10`
    );
    console.log('Recent tasks:');
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
      console.log('Commands: start, stop, status, task-add, tasks');
  }
}

main();
