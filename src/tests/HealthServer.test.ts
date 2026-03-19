import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

const mockCacheStore = new Map<string, { value: any; expires: number }>();

const { mockDb, mockStatfs } = vi.hoisted(() => ({
  mockDb: {
    query: vi.fn(),
    healthCheck: vi.fn(),
    getPoolStats: vi.fn(),
    close: vi.fn(),
  },
  mockStatfs: vi.fn(),
}));

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => mockDb),
}));

vi.mock('fs/promises', () => {
  return {
    default: {
      statfs: mockStatfs,
    },
    statfs: mockStatfs,
  };
});

vi.mock('../services/MetricsService.js', () => ({
  getMetricsRegistry: vi.fn().mockReturnValue({
    export: vi.fn().mockReturnValue('# HELP test\n'),
  }),
  createStandardMetrics: vi.fn().mockReturnValue({
    queueSize: { set: vi.fn() },
    activeTasks: { set: vi.fn() },
    tasksTotal: { inc: vi.fn(), _lastValue: 0 },
    memoryUsageBytes: { set: vi.fn() },
  }),
}));

vi.mock('../services/CacheService.js', () => {
  const cacheStore = new Map<string, { value: any; expires: number }>();
  const getCacheMock = vi.fn().mockImplementation((name: string) => ({
    get: (key: string) => {
      const item = cacheStore.get(`${name}:${key}`);
      if (!item) return undefined;
      if (Date.now() > item.expires) {
        cacheStore.delete(`${name}:${key}`);
        return undefined;
      }
      return item.value;
    },
    set: (key: string, value: any, options?: { ttlMs?: number }) => {
      const ttl = options?.ttlMs ?? 60000;
      cacheStore.set(`${name}:${key}`, {
        value,
        expires: Date.now() + ttl,
      });
    },
  }));
  return {
    getCache: getCacheMock,
  };
});

import { HealthServer } from '../services/HealthServer.js';

const createMockDb = (): DatabaseClient => mockDb as unknown as DatabaseClient;

describe('HealthServer', () => {
  let server: HealthServer;
  let mockDatabase: DatabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabase = createMockDb();

    mockDb.healthCheck = vi.fn().mockResolvedValue({ healthy: true, latency_ms: 5 });
    mockDb.getPoolStats = vi.fn().mockReturnValue({
      totalConnections: 10,
      idleConnections: 3,
      activeConnections: 7,
      waitingClients: 0,
    });
    mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    mockStatfs.mockResolvedValue({ bsize: 4096, blocks: 1000000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a health server instance', () => {
      server = new HealthServer(mockDatabase, 4098);
      expect(server).toBeDefined();
    });

    it('should use default port if not specified', () => {
      server = new HealthServer(mockDatabase);
      expect(server).toBeDefined();
    });

    it('should accept custom config', () => {
      server = new HealthServer(mockDatabase, 4099, {
        requireAuth: true,
        adminUsername: 'admin',
        adminPassword: 'secret',
      });
      expect(server).toBeDefined();
    });

    it('should accept disk warning threshold config', () => {
      server = new HealthServer(mockDatabase, 4100, {
        diskWarningThreshold: 1024 * 1024,
      });
      expect(server).toBeDefined();
    });

    it('should use OPENCODE_API_URL from env if not provided', () => {
      const original = process.env.OPENCODE_API_URL;
      process.env.OPENCODE_API_URL = 'http://opencode.local:8080';
      
      server = new HealthServer(mockDatabase, 4101);
      expect(server).toBeDefined();
      
      process.env.OPENCODE_API_URL = original;
    });
  });

  describe('start and stop', () => {
    it('should start and stop without error', async () => {
      server = new HealthServer(mockDatabase, 4099);
      await server.start();
      await server.stop();
    });

    it('should stop gracefully when not started', async () => {
      server = new HealthServer(mockDatabase, 4120);
      await server.stop();
    });
  });

  describe('HTTP endpoints', () => {
    it('should handle root endpoint', async () => {
      server = new HealthServer(mockDatabase, 4111);
      await server.start();

      const result = await new Promise<{ statusCode: number; body: string }>((resolve) => {
        http.get('http://localhost:4111/', (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
        });
      });

      await server.stop();
      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('Nezha Health Server');
    });

    it('should return 404 for unknown endpoints', async () => {
      server = new HealthServer(mockDatabase, 4112);
      await server.start();

      const result = await new Promise<{ statusCode: number }>((resolve) => {
        http.get('http://localhost:4112/unknown', (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        });
      });

      await server.stop();
      expect(result.statusCode).toBe(404);
    });

    it('should handle OPTIONS request with CORS headers', async () => {
      server = new HealthServer(mockDatabase, 4113);
      await server.start();

      const result = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders }>((resolve) => {
        const req = http.request({
          hostname: 'localhost',
          port: 4113,
          path: '/health',
          method: 'OPTIONS',
        }, (res) => {
          resolve({ statusCode: res.statusCode || 0, headers: res.headers });
        });
        req.end();
      });

      await server.stop();
      expect(result.statusCode).toBe(204);
      expect(result.headers['access-control-allow-origin']).toBe('*');
      expect(result.headers['access-control-allow-methods']).toContain('GET');
    });

    it('should set JSON content type', async () => {
      server = new HealthServer(mockDatabase, 4114);
      await server.start();

      const result = await new Promise<{ headers: http.IncomingHttpHeaders }>((resolve) => {
        http.get('http://localhost:4114/health', (res) => {
          resolve({ headers: res.headers });
        });
      });

      await server.stop();
      expect(result.headers['content-type']).toContain('application/json');
    });
  });

  describe('authentication', () => {
    it('should return 401 without auth header when required', async () => {
      server = new HealthServer(mockDatabase, 4115, {
        requireAuth: true,
        adminUsername: 'admin',
        adminPassword: 'secret',
      });
      await server.start();

      const result = await new Promise<{ statusCode: number }>((resolve) => {
        http.get('http://localhost:4115/health', (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        });
      });

      await server.stop();
      expect(result.statusCode).toBe(401);
    });

    it('should allow access without auth when requireAuth is false', async () => {
      server = new HealthServer(mockDatabase, 4116);
      await server.start();

      const result = await new Promise<{ statusCode: number }>((resolve) => {
        http.get('http://localhost:4116/health', (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        });
      });

      await server.stop();
      expect(result.statusCode).toBe(200);
    });

    it('should reject invalid credentials', async () => {
      server = new HealthServer(mockDatabase, 4117, {
        requireAuth: true,
        adminUsername: 'admin',
        adminPassword: 'secret',
      });
      await server.start();

      const result = await new Promise<{ statusCode: number }>((resolve) => {
        const req = http.request({
          hostname: 'localhost',
          port: 4117,
          path: '/health',
          headers: {
            Authorization: 'Basic ' + Buffer.from('admin:wrongpassword').toString('base64'),
          },
        }, (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        });
        req.end();
      });

      await server.stop();
      expect(result.statusCode).toBe(401);
    });

    it('should apply auth to metrics endpoint', async () => {
      server = new HealthServer(mockDatabase, 4118, {
        requireAuth: true,
        adminUsername: 'admin',
        adminPassword: 'secret',
      });
      await server.start();

      const result = await new Promise<{ statusCode: number }>((resolve) => {
        http.get('http://localhost:4118/metrics', (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        });
      });

      await server.stop();
      expect(result.statusCode).toBe(401);
    });

    it('should allow agents endpoint without auth', async () => {
      server = new HealthServer(mockDatabase, 4119, {
        requireAuth: true,
        adminUsername: 'admin',
        adminPassword: 'secret',
      });
      await server.start();

      const result = await new Promise<{ statusCode: number }>((resolve) => {
        http.get('http://localhost:4119/agents', (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        });
      });

      await server.stop();
      expect(result.statusCode).toBe(200);
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      server = new HealthServer(mockDatabase, 4121);
      const health = await server.getHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('checks');
      expect(health).toHaveProperty('tasks');
      expect(health).toHaveProperty('memory');
      expect(health).toHaveProperty('workers');
    });

    it('should include database health check', async () => {
      server = new HealthServer(mockDatabase, 4122);
      const health = await server.getHealth();

      expect(health.checks.database).toBeDefined();
      expect(health.checks.database.status).toBe('ok');
    });

    it('should return unhealthy when database is unhealthy', async () => {
      mockDb.healthCheck = vi.fn().mockResolvedValue({
        healthy: false,
        error: 'Connection refused',
      });

      server = new HealthServer(mockDatabase, 4123);
      const health = await server.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.database.status).toBe('error');
    });

    it('should include pool statistics', async () => {
      server = new HealthServer(mockDatabase, 4124);
      const health = await server.getHealth();

      expect(health.checks.database.pool).toBeDefined();
      expect(health.checks.database.pool?.total).toBe(10);
      expect(health.checks.database.pool?.idle).toBe(3);
      expect(health.checks.database.pool?.active).toBe(7);
    });

    it('should handle task counts', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ total: '100', indexed: '50' }], rowCount: 1 } as QueryResult<{ total: string; indexed: string }>);

      server = new HealthServer(mockDatabase, 4125);
      const health = await server.getHealth();

      expect(health.tasks).toBeDefined();
      expect(health.memory).toBeDefined();
    });

    it('should check disk space', async () => {
      server = new HealthServer(mockDatabase, 4126);
      const health = await server.getHealth();

      expect(health.checks.disk_space).toBeDefined();
      expect(health.checks.disk_space.status).toBe('ok');
    });

    it('should return warning for low disk space', async () => {
      const { getCache } = await import('../services/CacheService.js');
      (getCache as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        get: () => undefined,
        set: vi.fn(),
      });

      mockStatfs.mockResolvedValue({ bsize: 4096, blocks: 100 });
      server = new HealthServer(mockDatabase, 4127, {
        diskWarningThreshold: 1024 * 1024 * 1024,
      });
      const health = await server.getHealth();

      expect(health.checks.disk_space.status).toBe('warning');
    });

    it('should handle disk check error', async () => {
      const { getCache } = await import('../services/CacheService.js');
      (getCache as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        get: () => undefined,
        set: vi.fn(),
      });

      mockStatfs.mockRejectedValue(new Error('Disk access error'));
      server = new HealthServer(mockDatabase, 4128);
      const health = await server.getHealth();

      expect(health.checks.disk_space.status).toBe('error');
      expect(health.checks.disk_space.error).toBe('Disk access error');
    });

    it('should include opencode_api check status', async () => {
      server = new HealthServer(mockDatabase, 4129);
      const health = await server.getHealth();

      expect(health.checks.opencode_api).toBeDefined();
    });

    it('should include workers array', async () => {
      server = new HealthServer(mockDatabase, 4130);
      const health = await server.getHealth();

      expect(health.workers).toBeInstanceOf(Array);
    });

    it('should use cached health response', async () => {
      server = new HealthServer(mockDatabase, 4131);
      
      const health1 = await server.getHealth();
      const health2 = await server.getHealth();

      expect(health1).toEqual(health2);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<{ count: string }>);

      server = new HealthServer(mockDatabase, 4132);
      const metrics = await server.getMetrics();

      expect(metrics).toHaveProperty('tasks_per_hour');
      expect(metrics).toHaveProperty('avg_task_duration');
      expect(metrics).toHaveProperty('success_rate');
      expect(metrics).toHaveProperty('memory_recall_rate');
    });

    it('should calculate success rate correctly', async () => {
      vi.resetModules();
      const { HealthServer: FreshHealthServer } = await import('../services/HealthServer.js');
      
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ count: '80' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ count: '20' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ avg: '1.5' }], rowCount: 1 } as QueryResult<{ avg: string }>)
        .mockResolvedValueOnce({ rows: [{ total: '100', with_embedding: '80' }], rowCount: 1 } as QueryResult<{ total: string; with_embedding: string }>);

      server = new FreshHealthServer(mockDatabase, 4133);
      const metrics = await server.getMetrics();

      expect(metrics.success_rate).toBe(0.8);
    });

    it('should use cached metrics response', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<{ count: string }>);

      server = new HealthServer(mockDatabase, 4134);
      
      const metrics1 = await server.getMetrics();
      const metrics2 = await server.getMetrics();

      expect(metrics1).toEqual(metrics2);
    });

    it('should handle zero tasks for success rate calculation', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ avg: null }], rowCount: 1 } as QueryResult<{ avg: string | null }>)
        .mockResolvedValueOnce({ rows: [{ total: '0', with_embedding: '0' }], rowCount: 1 } as QueryResult<{ total: string; with_embedding: string }>);

      server = new HealthServer(mockDatabase, 4135);
      const metrics = await server.getMetrics();

      expect(metrics.success_rate).toBe(0);
      expect(metrics.memory_recall_rate).toBe(0);
    });
  });

  describe('getAgentHealth', () => {
    it('should return unhealthy when no agent system is set', () => {
      server = new HealthServer(mockDatabase, 4136);
      const agentHealth = server.getAgentHealth();

      expect(agentHealth.status).toBe('unhealthy');
      expect(agentHealth.agents).toEqual([]);
    });

    it('should return agent health when system is set', () => {
      const mockAgentSystem = {
        getAllAgents: vi.fn().mockReturnValue([
          {
            id: 'agent-1',
            mode: 'http' as const,
            status: 'idle' as const,
            registeredAt: new Date(),
            lastActivity: new Date(),
            taskCount: 10,
          },
        ]),
        getStats: vi.fn().mockReturnValue({
          totalAgents: 1,
          idleAgents: 1,
          busyAgents: 0,
          errorAgents: 0,
          totalTasksExecuted: 10,
          agentsByMode: { http: 1, cli: 0 },
        }),
        getDefaultMode: vi.fn().mockReturnValue('http'),
      };

      server = new HealthServer(mockDatabase, 4137);
      server.setAgentSystem(mockAgentSystem as any);
      const agentHealth = server.getAgentHealth();

      expect(agentHealth.status).toBe('healthy');
      expect(agentHealth.agents).toHaveLength(1);
      expect(agentHealth.stats.totalAgents).toBe(1);
    });

    it('should handle multiple agents', () => {
      const mockAgentSystem = {
        getAllAgents: vi.fn().mockReturnValue([
          { id: 'agent-1', mode: 'http' as const, status: 'idle' as const, registeredAt: new Date(), lastActivity: new Date(), taskCount: 5 },
          { id: 'agent-2', mode: 'cli' as const, status: 'busy' as const, registeredAt: new Date(), lastActivity: new Date(), taskCount: 10 },
        ]),
        getStats: vi.fn().mockReturnValue({
          totalAgents: 2,
          idleAgents: 1,
          busyAgents: 1,
          errorAgents: 0,
          totalTasksExecuted: 15,
          agentsByMode: { http: 1, cli: 1 },
        }),
        getDefaultMode: vi.fn().mockReturnValue('cli'),
      };

      server = new HealthServer(mockDatabase, 4138);
      server.setAgentSystem(mockAgentSystem as any);
      const agentHealth = server.getAgentHealth();

      expect(agentHealth.agents).toHaveLength(2);
      expect(agentHealth.stats.agentsByMode.http).toBe(1);
      expect(agentHealth.stats.agentsByMode.cli).toBe(1);
      expect(agentHealth.defaultMode).toBe('cli');
    });
  });

  describe('updateMetricsFromDb', () => {
    it('should update metrics from database', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [{ count: '5' }], rowCount: 1 } as QueryResult<{ count: string }>);

      server = new HealthServer(mockDatabase, 4139);
      await server.start();
      await server.stop();
    });

    it('should handle database errors gracefully', async () => {
      mockDb.query = vi.fn().mockRejectedValue(new Error('DB Error'));

      server = new HealthServer(mockDatabase, 4140);
      await server.start();
      await server.stop();
    });
  });
});
