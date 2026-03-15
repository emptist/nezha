import { Scheduler } from '../core/Scheduler.js';
import { Agent } from '../core/Agent.js';
import { MemoryService } from '../core/Memory.js';
import { DATABASE_TABLES, TASK_STATUS } from '../config/constants.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';

export interface HeartbeatServiceConfig {
  heartbeatIntervalMs?: number;
  workspaceDir?: string;
}

export interface HeartbeatHealth {
  isRunning: boolean;
  stats: {
    tasksExecuted: number;
    tasksSucceeded: number;
    tasksFailed: number;
  };
  lastError: string | null;
}

export class HeartbeatService {
  private readonly scheduler: Scheduler;
  private readonly agent: Agent;
  private readonly memory: MemoryService;
  private readonly workspaceDir: string;
  private lastError: string | null = null;
  private stats = {
    tasksExecuted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
  };

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
    const maxRetries = 3;
    const retryDelayMs = 30000; // 30 seconds
    
    this.stats.tasksExecuted++;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[Heartbeat] Executing task: ${title} (attempt ${attempt}/${maxRetries})`);
      
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
        
        this.stats.tasksSucceeded++;
        return; // Success, exit
      } else {
        console.error(`[Heartbeat] Task failed (attempt ${attempt}/${maxRetries}):`, result.message);
        this.lastError = result.message || 'Unknown error';
        
        if (attempt < maxRetries) {
          console.log(`[Heartbeat] Waiting ${retryDelayMs / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    
    // All retries failed
    console.error(`[Heartbeat] Task failed after ${maxRetries} attempts`);
    const tableName = DATABASE_TABLES.TASKS;
    await this.db.query(
      `UPDATE ${tableName} SET status = $1, error = $2 WHERE id = $3`,
      [TASK_STATUS.FAILED, 'Max retries exceeded', taskId]
    );
    
    this.stats.tasksFailed++;
  }

  isRunning(): boolean {
    return this.scheduler.isActive();
  }

  getHealth(): HeartbeatHealth {
    return {
      isRunning: this.isRunning(),
      stats: { ...this.stats },
      lastError: this.lastError,
    };
  }

  healthCheck(): HeartbeatHealth {
    return {
      isRunning: this.isRunning(),
      stats: { ...this.stats },
      lastError: this.lastError,
    };
  }
}
