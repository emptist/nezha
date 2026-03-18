import http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, TASK_STATUS, MEMORY_CONFIG } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { getMetricsRegistry, createStandardMetrics } from './MetricsService.js';
import { getCache } from './CacheService.js';

const standardMetrics = createStandardMetrics();

const HEALTH_CACHE_TTL_MS = 30000; // 30 seconds
const METRICS_CACHE_TTL_MS = 60000; // 60 seconds

const healthCache = getCache<HealthResponse>('health', { ttlMs: HEALTH_CACHE_TTL_MS, maxSize: 10 });
const metricsCache = getCache<any>('metrics', { ttlMs: METRICS_CACHE_TTL_MS, maxSize: 10 });

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  checks: {
    database: {
      status: 'ok' | 'error';
      latency_ms?: number;
      pool?: {
        total: number;
        idle: number;
        active: number;
        waiting: number;
      };
      error?: string;
    };
    opencode_api: {
      status: 'ok' | 'error' | 'not_configured';
      latency_ms?: number;
      error?: string;
    };
    disk_space: {
      status: 'ok' | 'warning' | 'error';
      free_bytes?: number;
      path?: string;
      error?: string;
    };
    task_queue: {
      status: 'ok' | 'warning' | 'critical';
      pending: number;
      running: number;
      failed: number;
      queue_depth: number;
    };
  };
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

export interface HealthServerConfig {
  requireAuth?: boolean;
  adminUsername?: string;
  adminPassword?: string;
  opencodeApiUrl?: string;
  memoryDir?: string;
  diskWarningThreshold?: number; // bytes
}

export class HealthServer {
  private server: http.Server | null = null;
  private startTime: number;
  private db: DatabaseClient;
  private port: number;
  private requireAuth: boolean;
  private adminUsername?: string;
  private adminPassword?: string;
  private opencodeApiUrl?: string;
  private memoryDir: string;
  private diskWarningThreshold: number;

  constructor(db: DatabaseClient, port: number = 4097, config?: HealthServerConfig) {
    this.db = db;
    this.port = port;
    this.startTime = Date.now();
    this.requireAuth = config?.requireAuth ?? false;
    this.adminUsername = config?.adminUsername;
    this.adminPassword = config?.adminPassword;
    this.opencodeApiUrl = config?.opencodeApiUrl ?? process.env.OPENCODE_API_URL;
    this.memoryDir = config?.memoryDir ?? MEMORY_CONFIG.DEFAULT_BOOTSTRAP_DIR;
    this.diskWarningThreshold = config?.diskWarningThreshold ?? 1024 * 1024 * 1024; // 1GB default
  }

  private async checkOpenCodeApi(): Promise<{ status: 'ok' | 'error' | 'not_configured'; latency_ms?: number; error?: string }> {
    if (!this.opencodeApiUrl) {
      return { status: 'not_configured' };
    }

    const start = Date.now();
    try {
      const response = await fetch(`${this.opencodeApiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      
      if (response.ok) {
        return { status: 'ok', latency_ms: latency };
      }
      return { status: 'error', latency_ms: latency, error: `HTTP ${response.status}` };
    } catch (error) {
      return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async checkDiskSpace(): Promise<{ status: 'ok' | 'warning' | 'error'; free_bytes?: number; path?: string; error?: string }> {
    try {
      const stats = await fs.statfs(this.memoryDir);
      const freeBytes = stats.bsize * stats.blocks;
      
      if (freeBytes < this.diskWarningThreshold) {
        return { status: 'warning', free_bytes: freeBytes, path: this.memoryDir };
      }
      return { status: 'ok', free_bytes: freeBytes, path: this.memoryDir };
    } catch (error) {
      return { status: 'error', path: this.memoryDir, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private authenticate(req: http.IncomingMessage): boolean {
    if (!this.requireAuth) return true;
    if (!this.adminUsername || !this.adminPassword) return true;

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Basic ')) return false;

    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString();
    const [username, password] = decoded.split(':');

    return username === this.adminUsername && password === this.adminPassword;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${this.port}`);
        
        // Check authentication for protected endpoints
        if ((url.pathname === '/health' || url.pathname === '/metrics') && !this.authenticate(req)) {
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Nezha"' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
            const registry = getMetricsRegistry();
            this.updateMetricsFromDb();
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(registry.export());
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
    const cached = healthCache.get('health');
    if (cached) {
      return cached;
    }

    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    const dbHealth = await this.db.healthCheck();
    const poolStats = this.db.getPoolStats();

    const tasksResult = await this.db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
    );

    const taskCounts = {
      pending: 0,
      running: 0,
      completed_today: 0,
      failed_today: 0,
    };

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

    // Run additional health checks in parallel
    const [opencodeResult, diskResult] = await Promise.all([
      this.checkOpenCodeApi(),
      this.checkDiskSpace(),
    ]);

    const health: HealthResponse = {
      status: dbHealth.healthy ? 'healthy' : 'unhealthy',
      uptime,
      checks: {
        database: {
          status: dbHealth.healthy ? 'ok' : 'error',
          latency_ms: dbHealth.latency_ms,
          pool: {
            total: poolStats.totalConnections,
            idle: poolStats.idleConnections,
            active: poolStats.activeConnections,
            waiting: poolStats.waitingClients,
          },
          error: dbHealth.error,
        },
        opencode_api: opencodeResult,
        disk_space: diskResult,
        task_queue: {
          status: 'ok',
          pending: taskCounts.pending,
          running: taskCounts.running,
          failed: taskCounts.failed_today,
          queue_depth: taskCounts.pending + taskCounts.running,
        },
      },
      tasks: taskCounts,
      memory: {
        total_memories: parseInt(memoryResult.rows[0]?.total || '0', 10),
        search_indexed: parseInt(memoryResult.rows[0]?.indexed || '0', 10),
      },
      workers: [
        { id: 'main', status: 'idle' }
      ]
    };

    healthCache.set('health', health);
    return health;
  }

  async getMetrics(): Promise<MetricsResponse> {
    const cached = metricsCache.get('metrics');
    if (cached) {
      return cached;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [tasksPerHourResult, totalCompletedResult, totalFailedResult, avgDurationResult, memoryWithEmbeddings] = await Promise.all([
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks 
         WHERE status = $1 AND completed_at > $2`,
        [TASK_STATUS.COMPLETED, oneHourAgo]
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = $1`,
        [TASK_STATUS.COMPLETED]
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = $1`,
        [TASK_STATUS.FAILED]
      ),
      this.db.query<{ avg: string }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg 
         FROM tasks 
         WHERE status = $1 AND completed_at IS NOT NULL`,
        [TASK_STATUS.COMPLETED]
      ),
      this.db.query<{ total: string; with_embedding: string }>(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding
         FROM ${DATABASE_TABLES.MEMORY}`
      ),
    ]);

    const completed = parseInt(totalCompletedResult.rows[0]?.count || '0', 10);
    const failed = parseInt(totalFailedResult.rows[0]?.count || '0', 10);
    const total = completed + failed;

    const tasksPerHour = parseInt(tasksPerHourResult.rows[0]?.count || '0', 10);
    const avgDuration = parseFloat(avgDurationResult.rows[0]?.avg || '0') * 1000;
    const successRate = total > 0 ? completed / total : 0;

    const memTotal = parseInt(memoryWithEmbeddings.rows[0]?.total || '0', 10);
    const memIndexed = parseInt(memoryWithEmbeddings.rows[0]?.with_embedding || '0', 10);
    const memoryRecallRate = memTotal > 0 ? memIndexed / memTotal : 0;

    const metrics: MetricsResponse = {
      tasks_per_hour: tasksPerHour,
      avg_task_duration: Math.round(avgDuration),
      success_rate: Math.round(successRate * 100) / 100,
      memory_recall_rate: Math.round(memoryRecallRate * 100) / 100,
    };

    metricsCache.set('metrics', metrics);
    return metrics;
  }

  private async updateMetricsFromDb(): Promise<void> {
    try {
      const [pendingResult, runningResult, completedResult, failedResult] = await Promise.all([
        this.db.query<{ count: string }>(`SELECT COUNT(*) as count FROM tasks WHERE status = $1`, [TASK_STATUS.PENDING]),
        this.db.query<{ count: string }>(`SELECT COUNT(*) as count FROM tasks WHERE status = $1`, [TASK_STATUS.RUNNING]),
        this.db.query<{ count: string }>(`SELECT COUNT(*) as count FROM tasks WHERE status = $1`, [TASK_STATUS.COMPLETED]),
        this.db.query<{ count: string }>(`SELECT COUNT(*) as count FROM tasks WHERE status = $1`, [TASK_STATUS.FAILED]),
      ]);

      const pending = parseInt(pendingResult.rows[0]?.count || '0', 10);
      const running = parseInt(runningResult.rows[0]?.count || '0', 10);
      const completed = parseInt(completedResult.rows[0]?.count || '0', 10);
      const failed = parseInt(failedResult.rows[0]?.count || '0', 10);

      standardMetrics.queueSize.set(pending);
      standardMetrics.activeTasks.set(running);

      const totalTasks = completed + failed;
      standardMetrics.tasksTotal.inc(totalTasks - (standardMetrics.tasksTotal as any)._lastValue || 0);
      (standardMetrics.tasksTotal as any)._lastValue = totalTasks;

      const memUsage = process.memoryUsage();
      standardMetrics.memoryUsageBytes.set(memUsage.heapUsed);
    } catch (error) {
      logger.warn('Failed to update metrics from DB:', error);
    }
  }
}
