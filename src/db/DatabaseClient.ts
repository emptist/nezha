import pg, { type Pool, type PoolConfig, type QueryResultRow } from 'pg';
import { type IConfig, type QueryResult } from '../config/types.js';
import { DATABASE_TABLES } from '../config/constants.js';
import { logDbQuery, isVerboseMode } from '../utils/verboseLogger.js';

const { Pool: PgPool } = pg;

export interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
}

export class DatabaseClient {
  private readonly pool: Pool;
  private readonly config: IConfig;
  private isClosed: boolean = false;

  constructor(config: IConfig) {
    this.config = config;
    const dbConfig = config.getDbConfig();
    const poolConfig: PoolConfig = {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      // Only include password if it's not empty (for trust authentication)
      ...(dbConfig.password && dbConfig.password.trim() !== '' && { password: dbConfig.password }),
      max: dbConfig.max,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
    };
    this.pool = new PgPool(poolConfig);

    this.pool.on('connect', async client => {
      const branch = await this.getGitBranch();
      if (branch) {
        try {
          await client.query(`SET app.git_branch = '${branch}'`);
        } catch {
          // Ignore errors - branch setting is optional
        }
      }
    });
  }

  private async getGitBranch(): Promise<string | null> {
    const { execSync } = await import('child_process');
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    if (this.isClosed) {
      throw new Error('DatabaseClient is closed');
    }

    const startTime = isVerboseMode() ? Date.now() : undefined;
    try {
      const result = await this.pool.query<T>(sql, params);
      logDbQuery(
        this.sanitizeSql(sql),
        params,
        { rowCount: result.rowCount ?? undefined },
        undefined,
        startTime
      );
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      logDbQuery(this.sanitizeSql(sql), params, undefined, error as Error, startTime);
      throw error;
    }
  }

  private sanitizeSql(sql: string): string {
    const trimmed = sql.trim();
    if (trimmed.length > 60) {
      return trimmed.substring(0, 60) + '...';
    }
    return trimmed;
  }

  async close(): Promise<void> {
    if (!this.isClosed) {
      await this.pool.end();
      this.isClosed = true;
    }
  }

  getPool(): Pool {
    return this.pool;
  }

  getPoolStats(): PoolStats {
    const poolState = this.pool;
    const total = poolState.totalCount || 0;
    const idle = poolState.idleCount || 0;
    return {
      totalConnections: total,
      idleConnections: idle,
      activeConnections: total - idle,
      waitingClients: poolState.waitingCount || 0,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { healthy: true, latency_ms: Date.now() - start };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  getTableNames(): typeof DATABASE_TABLES {
    return DATABASE_TABLES;
  }

  async setProjectContext(projectId: string | null): Promise<void> {
    if (projectId === null) {
      await this.pool.query(`SELECT disable_cross_project_learning()`);
    } else if (projectId === 'ALL') {
      await this.pool.query(`SELECT enable_cross_project_learning()`);
    } else {
      await this.pool.query(`SELECT set_project_context($1)`, [projectId]);
    }
  }

  async getCrossProjectLearnings(days: number = 7, limit: number = 50): Promise<unknown[]> {
    const result = await this.pool.query(`SELECT * FROM get_cross_project_learnings($1, $2)`, [
      days,
      limit,
    ]);
    return result.rows;
  }

  async saveCrossProjectLearning(
    content: string,
    projectId: string | null,
    tags: string[] = [],
    importance: number = 5,
    source: string = 'cross-project-learning'
  ): Promise<string> {
    const result = await this.pool.query(`SELECT save_cross_project_learning($1, $2, $3, $4, $5)`, [
      content,
      projectId,
      tags,
      importance,
      source,
    ]);
    return result.rows[0]?.save_cross_project_learning;
  }

  async saveConversation(conversation: {
    id?: string;
    projectId?: string;
    sessionId: string;
    taskId?: string;
    conversationType: string;
    title: string;
    participants: string[];
    messages: unknown[];
    result?: unknown;
    success?: boolean;
    durationMs?: number;
    tokensUsed?: number;
    model?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const id = conversation.id || crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO conversations (id, project_id, session_id, task_id, conversation_type, title, participants, messages, result, success, duration_ms, tokens_used, model, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         messages = EXCLUDED.messages,
         result = EXCLUDED.result,
         success = EXCLUDED.success,
         duration_ms = EXCLUDED.duration_ms,
         tokens_used = EXCLUDED.tokens_used,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING id`,
      [
        id,
        conversation.projectId,
        conversation.sessionId,
        conversation.taskId,
        conversation.conversationType,
        conversation.title,
        conversation.participants,
        JSON.stringify(conversation.messages),
        conversation.result ? JSON.stringify(conversation.result) : null,
        conversation.success,
        conversation.durationMs,
        conversation.tokensUsed,
        conversation.model,
        JSON.stringify(conversation.metadata || {}),
      ]
    );
    return result.rows[0]?.id;
  }

  async getConversation(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(
      `SELECT c.*, t.title as task_title, t.description as task_description
       FROM conversations c
       LEFT JOIN tasks t ON c.task_id = t.id
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getConversationBySessionId(sessionId: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(
      `SELECT c.*, t.title as task_title, t.description as task_description
       FROM conversations c
       LEFT JOIN tasks t ON c.task_id = t.id
       WHERE c.session_id = $1`,
      [sessionId]
    );
    return result.rows[0] || null;
  }

  async searchConversations(params: {
    query?: string;
    projectId?: string;
    taskId?: string;
    conversationType?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(
      `SELECT * FROM search_conversations($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.query || null,
        params.projectId || null,
        params.taskId || null,
        params.conversationType || null,
        params.success ?? null,
        params.startDate || null,
        params.endDate || null,
        params.limit || 50,
        params.offset || 0,
      ]
    );
    return result.rows;
  }

  async getConversationsByTaskId(taskId: string): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(
      `SELECT * FROM conversations WHERE task_id = $1 ORDER BY created_at DESC`,
      [taskId]
    );
    return result.rows;
  }

  async getConversationsByDateRange(
    startDate: Date,
    endDate: Date,
    projectId?: string
  ): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(
      `SELECT * FROM conversations 
       WHERE created_at >= $1 AND created_at <= $2
       ${projectId ? 'AND project_id = $3' : ''}
       ORDER BY created_at DESC`,
      projectId ? [startDate, endDate, projectId] : [startDate, endDate]
    );
    return result.rows;
  }

  async getConversationStats(params: {
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(`SELECT * FROM get_conversation_stats($1, $2, $3)`, [
      params.projectId || null,
      params.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      params.endDate || new Date(),
    ]);
    return result.rows;
  }

  async listConversations(params: {
    projectId?: string;
    conversationType?: string;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>[]> {
    let sql = `SELECT id, session_id, task_id, conversation_type, title, success, duration_ms, created_at
               FROM conversations WHERE 1=1`;
    const values: unknown[] = [];
    let idx = 1;

    if (params.projectId) {
      sql += ` AND project_id = $${idx++}`;
      values.push(params.projectId);
    }
    if (params.conversationType) {
      sql += ` AND conversation_type = $${idx++}`;
      values.push(params.conversationType);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    values.push(params.limit || 50, params.offset || 0);

    const result = await this.pool.query(sql, values);
    return result.rows;
  }
}
