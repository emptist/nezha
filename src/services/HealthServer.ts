import http from 'http';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, TASK_STATUS } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { getMetricsRegistry, createStandardMetrics } from './MetricsService.js';

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  tasks: {
    pending: number;
    running: number;
    completed_today: number;
    failed_today: number;
  };
  memory: {
    total_memories: number;
    search_indexed: number;
  };
  workers: Array<{
    id: string;
    status: 'idle' | 'busy';
    task?: string;
  }>;
}

export interface MetricsResponse {
  tasks_per_hour: number;
  avg_task_duration: number;
  success_rate: number;
  memory_recall_rate: number;
}

export class HealthServer {
  private server: http.Server | null = null;
  private startTime: number;
  private db: DatabaseClient;
  private port: number;

  constructor(db: DatabaseClient, port: number = 4097) {
    this.db = db;
    this.port = port;
    this.startTime = Date.now();
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${this.port}`);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          if (url.pathname === '/health') {
            const health = await this.getHealth();
            res.writeHead(200);
            res.end(JSON.stringify(health));
          } else if (url.pathname === '/metrics') {
            const metrics = await this.getMetrics();
            res.writeHead(200);
            res.end(JSON.stringify(metrics));
          } else if (url.pathname === '/') {
            res.writeHead(200);
            res.end(JSON.stringify({ 
              name: 'Nezha Health Server', 
              endpoints: ['/health', '/metrics'] 
            }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        } catch (error) {
          logger.error('Health server error:', error);
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      this.server.listen(this.port, () => {
        logger.info(`Health server started on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Health server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async getHealth(): Promise<HealthResponse> {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    const tasksResult = await this.db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
    );

    const taskCounts = {
      pending: 0,
      running: 0,
      completed_today: 0,
      failed_today: 0,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const row of tasksResult.rows) {
      const count = parseInt(row.count, 10);
      switch (row.status) {
        case TASK_STATUS.PENDING:
          taskCounts.pending = count;
          break;
        case TASK_STATUS.RUNNING:
          taskCounts.running = count;
          break;
        case TASK_STATUS.COMPLETED:
          taskCounts.completed_today = count;
          break;
        case TASK_STATUS.FAILED:
          taskCounts.failed_today = count;
          break;
      }
    }

    const memoryResult = await this.db.query<{ total: string; indexed: string }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as indexed
       FROM ${DATABASE_TABLES.MEMORY}`
    );

    return {
      status: 'healthy',
      uptime,
      tasks: taskCounts,
      memory: {
        total_memories: parseInt(memoryResult.rows[0]?.total || '0', 10),
        search_indexed: parseInt(memoryResult.rows[0]?.indexed || '0', 10),
      },
      workers: [
        { id: 'main', status: 'idle' }
      ]
    };
  }

  async getMetrics(): Promise<MetricsResponse> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tasksPerHourResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE status = $1 AND completed_at > $2`,
      [TASK_STATUS.COMPLETED, oneHourAgo]
    );

    const totalCompletedResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = $1`,
      [TASK_STATUS.COMPLETED]
    );

    const totalFailedResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = $1`,
      [TASK_STATUS.FAILED]
    );

    const avgDurationResult = await this.db.query<{ avg: string }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg 
       FROM tasks 
       WHERE status = $1 AND completed_at IS NOT NULL`,
      [TASK_STATUS.COMPLETED]
    );

    const completed = parseInt(totalCompletedResult.rows[0]?.count || '0', 10);
    const failed = parseInt(totalFailedResult.rows[0]?.count || '0', 10);
    const total = completed + failed;

    const tasksPerHour = parseInt(tasksPerHourResult.rows[0]?.count || '0', 10);
    const avgDuration = parseFloat(avgDurationResult.rows[0]?.avg || '0') * 1000;
    const successRate = total > 0 ? completed / total : 0;

    const memoryWithEmbeddings = await this.db.query<{ total: string; with_embedding: string }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding
       FROM ${DATABASE_TABLES.MEMORY}`
    );

    const memTotal = parseInt(memoryWithEmbeddings.rows[0]?.total || '0', 10);
    const memIndexed = parseInt(memoryWithEmbeddings.rows[0]?.with_embedding || '0', 10);
    const memoryRecallRate = memTotal > 0 ? memIndexed / memTotal : 0;

    return {
      tasks_per_hour: tasksPerHour,
      avg_task_duration: Math.round(avgDuration),
      success_rate: Math.round(successRate * 100) / 100,
      memory_recall_rate: Math.round(memoryRecallRate * 100) / 100,
    };
  }
}
