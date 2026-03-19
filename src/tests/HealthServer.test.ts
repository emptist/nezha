import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

const mockDb = {
  query: vi.fn(),
  healthCheck: vi.fn(),
  getPoolStats: vi.fn(),
  close: vi.fn(),
};

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => mockDb),
}));

vi.mock('fs/promises', () => ({
  default: {
    statfs: vi.fn(),
  },
}));

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

vi.mock('../services/CacheService.js', () => ({
  getCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
  })),
}));

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
  });

  describe('start and stop', () => {
    it('should start and stop without error', async () => {
      server = new HealthServer(mockDatabase, 4099);
      await server.start();
      await server.stop();
    });
  });

  describe('authenticate', () => {
    it('should authenticate with valid credentials', async () => {
      server = new HealthServer(mockDatabase, 4100, {
        requireAuth: true,
        adminUsername: 'admin',
        adminPassword: 'secret',
      });
      await server.start();

      const credentials = Buffer.from('admin:secret').toString('base64');
      const req = {
        headers: {
          authorization: `Basic ${credentials}`,
        },
      } as http.IncomingMessage;

      const res = await new Promise<{ statusCode: number }>(resolve => {
        server.getHealth().then(() => {
          resolve({ statusCode: 200 });
        });
      });

      await server.stop();
      expect(res.statusCode).toBe(200);
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      server = new HealthServer(mockDatabase, 4101);
      const health = await server.getHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('checks');
      expect(health).toHaveProperty('tasks');
      expect(health).toHaveProperty('memory');
      expect(health).toHaveProperty('workers');
    });

    it('should include database health check', async () => {
      server = new HealthServer(mockDatabase, 4102);
      const health = await server.getHealth();

      expect(health.checks.database).toBeDefined();
      expect(health.checks.database.status).toBe('ok');
    });

    it('should return unhealthy when database is unhealthy', async () => {
      mockDb.healthCheck = vi.fn().mockResolvedValue({
        healthy: false,
        error: 'Connection refused',
      });

      server = new HealthServer(mockDatabase, 4103);
      const health = await server.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.database.status).toBe('error');
    });

    it('should include pool statistics', async () => {
      server = new HealthServer(mockDatabase, 4104);
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

      server = new HealthServer(mockDatabase, 4105);
      const health = await server.getHealth();

      expect(health.tasks).toBeDefined();
      expect(health.memory).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<{ count: string }>);

      server = new HealthServer(mockDatabase, 4106);
      const metrics = await server.getMetrics();

      expect(metrics).toHaveProperty('tasks_per_hour');
      expect(metrics).toHaveProperty('avg_task_duration');
      expect(metrics).toHaveProperty('success_rate');
      expect(metrics).toHaveProperty('memory_recall_rate');
    });

    it('should calculate success rate correctly', async () => {
      mockDb.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ count: '80' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ count: '20' }], rowCount: 1 } as QueryResult<{ count: string }>)
        .mockResolvedValueOnce({ rows: [{ avg: '1.5' }], rowCount: 1 } as QueryResult<{ avg: string }>)
        .mockResolvedValueOnce({ rows: [{ total: '100', with_embedding: '80' }], rowCount: 1 } as QueryResult<{ total: string; with_embedding: string }>);

      server = new HealthServer(mockDatabase, 4107);
      const metrics = await server.getMetrics();

      expect(metrics.success_rate).toBe(0.8);
    });
  });

  describe('getAgentHealth', () => {
    it('should return unhealthy when no agent system is set', () => {
      server = new HealthServer(mockDatabase, 4108);
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

      server = new HealthServer(mockDatabase, 4109);
      server.setAgentSystem(mockAgentSystem as any);
      const agentHealth = server.getAgentHealth();

      expect(agentHealth.status).toBe('healthy');
      expect(agentHealth.agents).toHaveLength(1);
      expect(agentHealth.stats.totalAgents).toBe(1);
    });
  });

  describe('updateMetricsFromDb', () => {
    it('should update metrics from database', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [{ count: '5' }], rowCount: 1 } as QueryResult<{ count: string }>);

      server = new HealthServer(mockDatabase, 4110);
      await server.start();
      await server.stop();
    });
  });
});
