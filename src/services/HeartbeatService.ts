import { Scheduler } from '../core/Scheduler.js';
import { Agent } from '../core/Agent.js';
import { MemoryService } from '../core/Memory.js';
import { DATABASE_TABLES, TASK_STATUS } from '../config/constants.js';
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
    
    // Connect scheduler to task execution
    this.scheduler.onTaskReady = this.executeTask.bind(this);
  }

  async start(): Promise<void> {
    console.log('Starting HeartbeatService...');
    await this.scheduler.start();
    console.log('HeartbeatService running');
  }

  async stop(): Promise<void> {
    console.log('Stopping HeartbeatService...');
    await this.scheduler.stop();
    await this.db.close();
    console.log('HeartbeatService stopped');
  }

  async executeTask(taskId: string, title: string, description?: string): Promise<void> {
    console.log(`[Heartbeat] Executing task: ${title}`);
    
    const result = await this.agent.executeTask(description || title);
    
    const tableName = DATABASE_TABLES.TASKS;
    
    if (result.success) {
      console.log(`[Heartbeat] Task completed successfully`);
      
      // Mark task as completed
      await this.db.query(
        `UPDATE ${tableName} SET status = $1, result = $2, completed_at = NOW() WHERE id = $3`,
        [TASK_STATUS.COMPLETED, JSON.stringify({ message: result.message }), taskId]
      );
      
      // Save to memory
      await this.memory.save({
        id: crypto.randomUUID(),
        projectId: undefined,
        content: `Task: ${title}\nResult: ${result.message}`,
        metadata: { type: 'task_result', success: true },
      });
    } else {
      console.error(`[Heartbeat] Task failed:`, result.message);
      
      // Mark task as failed
      await this.db.query(
        `UPDATE ${tableName} SET status = $1, error = $2 WHERE id = $3`,
        [TASK_STATUS.FAILED, result.message, taskId]
      );
    }
  }

  isRunning(): boolean {
    return this.scheduler.isActive();
  }
}
