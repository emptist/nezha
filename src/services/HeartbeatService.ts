import { Scheduler } from '../core/Scheduler.js';
import { Agent } from '../core/Agent.js';
import { MemoryService } from '../core/Memory.js';
import { DATABASE_TABLES, TASK_STATUS, TASK_CONFIG } from '../config/constants.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';

export interface HeartbeatServiceConfig {
  heartbeatIntervalMs?: number;
  workspaceDir?: string;
}

export class HeartbeatService {
  private readonly scheduler: Scheduler;
  private readonly agent: Agent;
  private readonly memory: MemoryService;
  private readonly workspaceDir: string;

  constructor(
    private readonly db: DatabaseClient,
    config?: HeartbeatServiceConfig
  ) {
    this.scheduler = new Scheduler(db, config?.heartbeatIntervalMs);
    this.agent = new Agent();
    this.memory = new MemoryService(db);
    this.workspaceDir = config?.workspaceDir ?? process.cwd();
  }

  async start(): Promise<void> {
    console.log('Starting HeartbeatService...');
    await this.scheduler.start();
    console.log('HeartbeatService started');
  }

  async stop(): Promise<void> {
    console.log('Stopping HeartbeatService...');
    await this.scheduler.stop();
    await this.db.close();
    console.log('HeartbeatService stopped');
  }

  async executeTask(taskDescription: string): Promise<void> {
    console.log(`Executing task: ${taskDescription}`);
    
    const result = await this.agent.executeTask(taskDescription);
    
    if (result.success) {
      console.log('Task executed successfully');
      
      // Save to memory
      await this.memory.save({
        id: crypto.randomUUID(),
        projectId: 'default',
        content: `Task: ${taskDescription}\nResult: ${result.message}`,
        metadata: { type: 'task_result', success: true },
      });
    } else {
      console.error('Task failed:', result.message);
    }
  }

  isRunning(): boolean {
    return this.scheduler.isActive();
  }
}
