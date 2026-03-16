import { Scheduler } from '../core/Scheduler.js';
import { Agent } from '../core/Agent.js';
import { MemoryService } from '../core/Memory.js';
import { DATABASE_TABLES, TASK_STATUS } from '../config/constants.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import { waitForever } from '../utils/wait.js';

export interface HeartbeatServiceConfig {
  heartbeatIntervalMs?: number;
  workspaceDir?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface HeartbeatHealth {
  isRunning: boolean;
  stats: {
    tasksExecuted: number;
    tasksSucceeded: number;
    tasksFailed: number;
    reconnectAttempts: number;
  };
  lastError: string | null;
}

export class HeartbeatService {
  private readonly scheduler: Scheduler;
  private readonly agent: Agent;
  private readonly memory: MemoryService;
  private readonly workspaceDir: string;
  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly heartbeatIntervalMs: number;
  private lastError: string | null = null;
  private reconnectAttempts = 0;
  private stats = {
    tasksExecuted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    reconnectAttempts: 0,
  };
  private abortController: AbortController | null = null;

  constructor(
    private readonly db: DatabaseClient,
    config?: HeartbeatServiceConfig,
    scheduler?: Scheduler
  ) {
    this.scheduler = scheduler ?? new Scheduler(db, config?.heartbeatIntervalMs);
    this.agent = new Agent();
    this.memory = new MemoryService(db);
    this.workspaceDir = config?.workspaceDir ?? process.cwd();
    this.autoReconnect = config?.autoReconnect ?? true;
    this.maxReconnectAttempts = config?.maxReconnectAttempts ?? 5;
    this.heartbeatIntervalMs = config?.heartbeatIntervalMs ?? 60000;
    
    // Connect scheduler to task execution
    this.scheduler.onTaskReady = this.executeTask.bind(this);
  }

  async start(): Promise<void> {
    console.log('Starting HeartbeatService...');
    this.abortController = new AbortController();
    
    // Start the continuous loop
    await this.runContinuousLoop();
  }

  private async runContinuousLoop(): Promise<void> {
    while (!this.abortController?.signal.aborted) {
      try {
        // 1. Start scheduler
        await this.scheduler.start();
        console.log('HeartbeatService running');
        
        // 2. Wait for scheduler to stop or abort
        await Promise.race([
          this.scheduler.waitUntilStopped(),
          this.waitForAbort(),
        ]);
        
        // 3. Check if we should stop
        if (this.abortController?.signal.aborted) {
          break;
        }
        
        // 4. Auto-reconnect if enabled
        if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.stats.reconnectAttempts++;
          console.log(`[Heartbeat] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          
          // Exponential backoff
          const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          // Continue loop (reconnect)
          continue;
        } else {
          // Stop if auto-reconnect is disabled or max attempts reached
          console.log('[Heartbeat] Stopping (auto-reconnect disabled or max attempts reached)');
          break;
        }
      } catch (error) {
        console.error('[Heartbeat] Error in continuous loop:', error);
        this.lastError = error instanceof Error ? error.message : 'Unknown error';
        
        if (!this.autoReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
          break;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log('HeartbeatService stopped');
  }

  private async waitForAbort(): Promise<void> {
    if (!this.abortController) {
      return waitForever();
    }
    
    return new Promise<void>((resolve) => {
      this.abortController!.signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }

  async stop(): Promise<void> {
    console.log('Stopping HeartbeatService...');
    
    // Abort the continuous loop
    this.abortController?.abort();
    
    // Stop scheduler
    await this.scheduler.stop();
    
    // Close database
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
}
