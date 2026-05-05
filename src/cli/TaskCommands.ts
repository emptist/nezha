import { DatabaseClient } from '../db/DatabaseClient.js';

export class TaskCommands {
  constructor(private db: DatabaseClient) {}

  async create(
    title: string,
    description: string = '',
    options?: { priority?: number; category?: string }
  ): Promise<string> {
    const id = crypto.randomUUID();
    const priority = options?.priority ?? 5;
    const category = options?.category ?? 'feature';

    await this.db.query(
      `INSERT INTO tasks (id, title, description, status, priority, category)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, title, description, 'PENDING', priority, category]
    );
    return id;
  }

  async updateStatus(taskId: string, status: string): Promise<boolean> {
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid: ${validStatuses.join(', ')}`);
    }
    
    const result = await this.db.query(
      `UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3 RETURNING id`,
      [status, status === 'COMPLETED' ? new Date() : null, taskId]
    );
    return result.rows.length > 0;
  }

  async list(options?: { status?: string; limit?: number; json?: boolean }): Promise<void> {
    const limit = options?.limit ?? 10;
    const status = options?.status ?? 'PENDING';

    const result = await this.db.query(
      `SELECT id, title, status, priority, description, created_at FROM tasks WHERE status = $1 ORDER BY priority DESC, created_at DESC LIMIT $2`,
      [status, limit]
    );

    if (options?.json) {
      console.log(JSON.stringify(result.rows, null, 2));
      return;
    }

    if (result.rows.length === 0) {
      console.log(`No ${status} tasks`);
      return;
    }

    console.log(`\n=== ${status} TASKS ===\n`);
    for (const row of result.rows) {
      console.log(`[${row.priority}] ${row.title?.slice(0, 60)} (${row.id?.slice(0, 8)})`);
    }
  }
}
