import { DatabaseClient } from '../db/DatabaseClient.js';
import { LearningAnalysisService } from './LearningAnalysis.js';
import { logger } from '../utils/logger.js';

export interface LearningRecord {
  id: string;
  taskId: string;
  learning: string;
  context?: string;
  category: string;
  importance: number;
  createdAt: Date;
}

export interface LearningFilter {
  taskId?: string;
  category?: string;
  minImportance?: number;
  limit?: number;
  offset?: number;
}

export class LearningRecorder {
  private readonly db: DatabaseClient;
  private readonly learningAnalysis: LearningAnalysisService;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.learningAnalysis = new LearningAnalysisService(db);
  }

  async recordLearning(
    taskId: string,
    learning: string,
    options?: {
      context?: string;
      category?: string;
      importance?: number;
      projectId?: string;
    }
  ): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO memory (content, project_id, importance, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        learning,
        options?.projectId || null,
        options?.importance || 7,
        JSON.stringify({
          type: 'learning',
          taskId,
          context: options?.context,
          category: options?.category || 'general',
          source: 'LearningRecorder',
        }),
      ]
    );

    const id = result.rows[0]?.id || '';

    logger.info(
      `[LearningRecorder] Recorded learning for task ${taskId}: ${learning.substring(0, 50)}...`
    );

    return id;
  }

  async getLearnings(filter?: LearningFilter): Promise<LearningRecord[]> {
    let query = `SELECT id, metadata->>'taskId' as "taskId", content as learning, 
                 metadata->>'context' as context, metadata->>'category' as category,
                 importance, created_at as "createdAt"
                 FROM memory WHERE metadata->>'type' = 'learning'`;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (filter?.taskId) {
      query += ` AND metadata->>'taskId' = $${paramIndex}`;
      params.push(filter.taskId);
      paramIndex++;
    }

    if (filter?.category) {
      query += ` AND metadata->>'category' = $${paramIndex}`;
      params.push(filter.category);
      paramIndex++;
    }

    if (filter?.minImportance) {
      query += ` AND importance >= $${paramIndex}`;
      params.push(filter.minImportance);
      paramIndex++;
    }

    query += ` ORDER BY importance DESC, created_at DESC`;

    if (filter?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filter.limit);
      paramIndex++;
    }

    if (filter?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filter.offset);
    }

    const result = await this.db.query<{
      id: string;
      taskId: string;
      learning: string;
      context: string | null;
      category: string | null;
      importance: number;
      createdAt: Date;
    }>(query, params);

    return result.rows.map(row => ({
      id: row.id,
      taskId: row.taskId,
      learning: row.learning,
      context: row.context || undefined,
      category: row.category || 'general',
      importance: row.importance,
      createdAt: row.createdAt,
    }));
  }

  async getLearningsForTask(taskId: string): Promise<LearningRecord[]> {
    return this.getLearnings({ taskId, limit: 100 });
  }

  async recordOutcome(
    taskId: string,
    status: 'COMPLETED' | 'FAILED',
    options?: {
      errorMessage?: string;
      solutionApplied?: string;
      executionTimeMs?: number;
    }
  ): Promise<void> {
    await this.learningAnalysis.recordOutcome(taskId, status, options);
    logger.info(`[LearningRecorder] Recorded outcome for task ${taskId}: ${status}`);
  }

  async getRelevantLearnings(query: string, limit: number = 5): Promise<LearningRecord[]> {
    const result = await this.db.query<{
      id: string;
      taskId: string;
      learning: string;
      context: string | null;
      category: string | null;
      importance: number;
      createdAt: Date;
    }>(
      `SELECT id, metadata->>'taskId' as "taskId", content as learning,
              metadata->>'context' as context, metadata->>'category' as category,
              importance, created_at as "createdAt"
       FROM memory 
       WHERE metadata->>'type' = 'learning'
         AND content ILIKE $1
       ORDER BY importance DESC, created_at DESC
       LIMIT $2`,
      [`%${query}%`, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      taskId: row.taskId,
      learning: row.learning,
      context: row.context || undefined,
      category: row.category || 'general',
      importance: row.importance,
      createdAt: row.createdAt,
    }));
  }
}
