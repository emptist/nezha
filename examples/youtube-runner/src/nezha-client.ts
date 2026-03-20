import { Pool } from 'pg';
import type { Config } from './config.js';

export class NezhaClient {
  private pool: Pool;

  constructor(config: Config) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
    });
  }

  async createTask(title: string, description: string, priority: number = 5): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO tasks (title, description, priority, status, tags)
       VALUES ($1, $2, $3, 'PENDING', ARRAY['youtube-runner'])
       RETURNING id`,
      [title, description, priority]
    );
    return result.rows[0].id;
  }

  async getPendingTasks(): Promise<Array<{ id: string; title: string; description: string }>> {
    const result = await this.pool.query(
      `SELECT id, title, description FROM tasks 
       WHERE status = 'PENDING' AND 'youtube-runner' = ANY(tags)
       ORDER BY priority DESC, created_at ASC`
    );
    return result.rows;
  }

  async completeTask(taskId: string, result?: string): Promise<void> {
    await this.pool.query(
      `UPDATE tasks SET status = 'COMPLETED', result = $1::jsonb, completed_at = NOW() 
       WHERE id = $2`,
      [result ? JSON.stringify({ message: result }) : '{}', taskId]
    );
  }

  async failTask(taskId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE tasks SET status = 'FAILED', error = $1, completed_at = NOW() 
       WHERE id = $2`,
      [error, taskId]
    );
  }

  async createIssue(title: string, description: string, severity: string = 'medium'): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO issues (title, description, severity, status, labels)
       VALUES ($1, $2, $3, 'OPEN', ARRAY['youtube', 'automation'])
       RETURNING id`,
      [title, description, severity]
    );
    return result.rows[0].id;
  }

  async saveLearning(insight: string, context: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO memory (content, source, tags, metadata)
       VALUES ($1::text, 'youtube-runner', ARRAY['learning', 'youtube'], jsonb_build_object('context', $2::text))`,
      [insight, context]
    );
  }

  async getSkill(name: string): Promise<{ name: string; content: string } | null> {
    const result = await this.pool.query(
      `SELECT name, content FROM skills WHERE name = $1 AND status = 'approved'`,
      [name]
    );
    return result.rows[0] || null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
