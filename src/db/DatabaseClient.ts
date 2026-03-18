import pg, { type Pool, type PoolConfig, type QueryResultRow } from 'pg';
import { type IConfig, type QueryResult } from '../config/types.js';
import { DATABASE_TABLES } from '../config/constants.js';

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
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (this.isClosed) {
      throw new Error('DatabaseClient is closed');
    }
    const result = await this.pool.query<T>(sql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
    };
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
}
