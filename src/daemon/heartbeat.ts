import { getPool, closePool } from "../db/client.js";
import { getDbConfig } from "../db/config.js";

interface HeartbeatConfig {
  intervalMs: number;
  workspaceDir: string;
  opencodeUrl: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "completed" | "failed";
}

class HeartbeatDaemon {
  private config: HeartbeatConfig;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = {
      intervalMs: config.intervalMs ?? 30 * 60 * 1000, // 30 minutes
      workspaceDir: config.workspaceDir ?? process.cwd(),
      opencodeUrl: config.opencodeUrl ?? "http://127.0.0.1:4098",
    };
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting Heartbeat Daemon (interval: ${this.config.intervalMs / 1000 / 60} min)`);
            this.isRunning = true;
    
    // Run once immediately
    await this.runHeartbeat();

    // Then run periodically
    this.timer = setInterval(() => {
      this.runHeartbeat().catch(console.error);
    }, this.config.intervalMs);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await closePool();
      }

  private async runHeartbeat(): Promise<void> {
    if (!this.isRunning) return;
    
    const startTime = Date.now();
    console.log(`\n❤️ Heartbeat at ${new Date().toISOString()}`);

    try {
      // 1. Check for pending tasks
      const tasks = await this.getPendingTasks();
      
      if (tasks.length === 0) {
                await this.logHeartbeat("ok", 0, Date.now() - startTime);
        return;
      }

      console.log(`   📋 Found ${tasks.length} pending task(s)`);

      // 2. Execute first task
      const task = tasks[0];
            const result = await this.executeTask(task);
      
      if (result.success) {
                await this.updateTaskStatus(task.id, "completed");
      } else {
                await this.updateTaskStatus(task.id, "failed");
      }

      await this.logHeartbeat("executed", tasks.length, Date.now() - startTime);
      
    } catch (error) {
      console.error(`   ❌ Heartbeat error:`, error);
      await this.logHeartbeat("error", 0, Date.now() - startTime, String(error));
    }
  }

  private async getPendingTasks(): Promise<Task[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, title, description, status 
       FROM tasks 
       WHERE status = 'pending' 
       ORDER BY priority DESC, created_at ASC 
       LIMIT 1`
    );
    return result.rows;
  }

  private async executeTask(task: Task): Promise<{ success: boolean; error?: string }> {
    // Call opencode API to execute the task
    const sessionResponse = await fetch(`${this.config.opencodeUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!sessionResponse.ok) {
      return { success: false, error: "Failed to create session" };
    }

    const session = await sessionResponse.json();
    const sessionId = session.id;

    // Send task as message
    const messageResponse = await fetch(
      `${this.config.opencodeUrl}/session/${sessionId}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: task.description || task.title }],
        }),
      }
    );

    if (!messageResponse.ok) {
      return { success: false, error: "Failed to send message" };
    }

    // For now, just return success - need to handle async response
    return { success: true };
  }

  private async updateTaskStatus(
    taskId: string,
    status: "completed" | "failed"
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, taskId]
    );
  }

  private async logHeartbeat(
    status: string,
    tasksCount: number,
    durationMs: number,
    error?: string
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO heartbeats (status, tasks_count, duration_ms, error) 
       VALUES ($1, $2, $3, $4)`,
      [status, tasksCount, durationMs, error]
    );
  }
}

async function main() {
  const daemon = new HeartbeatDaemon({
    intervalMs: 30 * 60 * 1000, // 30 minutes
    workspaceDir: process.cwd(),
  });

  process.on("SIGINT", async () => {
    await daemon.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await daemon.stop();
    process.exit(0);
  });

  await daemon.start();
}

main().catch(console.error);
