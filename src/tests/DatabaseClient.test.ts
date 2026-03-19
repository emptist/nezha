import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IConfig } from '../config/types.js';

vi.mock('pg');

const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
  totalCount: 10,
  idleCount: 3,
  waitingCount: 2,
};

const createMockConfig = (): IConfig => ({
  getDbConfig: vi.fn().mockReturnValue({
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'test_user',
    password: 'test_password',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }),
  getAppConfig: vi.fn().mockReturnValue({}),
});

describe('DatabaseClient', () => {
  let DatabaseClient: any;
  let client: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const pg = await import('pg');
    (pg.Pool as any).mockImplementation(() => mockPool);
    const module = await import('../db/DatabaseClient.js');
    DatabaseClient = module.DatabaseClient;
    client = new DatabaseClient(createMockConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a database client with config', () => {
      expect(client).toBeDefined();
    });
  });

  describe('query', () => {
    it('should execute a query and return results', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
      });

      const result = await client.query('SELECT * FROM users');

      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
      expect(result.rowCount).toBe(1);
    });

    it('should pass parameters to the query', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
    });

    it('should throw error when client is closed', async () => {
      await client.close();

      await expect(client.query('SELECT 1')).rejects.toThrow('DatabaseClient is closed');
    });
  });

  describe('close', () => {
    it('should close the pool', async () => {
      mockPool.end.mockResolvedValue(undefined);

      await client.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should not close twice', async () => {
      mockPool.end.mockResolvedValue(undefined);

      await client.close();
      await client.close();

      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPool', () => {
    it('should return the pool instance', () => {
      const pool = client.getPool();
      expect(pool).toBe(mockPool);
    });
  });

  describe('getPoolStats', () => {
    it('should return correct pool statistics', () => {
      const stats = client.getPoolStats();

      expect(stats.totalConnections).toBe(10);
      expect(stats.idleConnections).toBe(3);
      expect(stats.activeConnections).toBe(7);
      expect(stats.waitingClients).toBe(2);
    });

    it('should handle missing pool properties', () => {
      mockPool.totalCount = undefined;
      mockPool.idleCount = undefined;
      mockPool.waitingCount = undefined;

      const stats = client.getPoolStats();

      expect(stats.totalConnections).toBe(0);
      expect(stats.idleConnections).toBe(0);
      expect(stats.activeConnections).toBe(0);
      expect(stats.waitingClients).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when query succeeds', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latency_ms).toBeDefined();
    });

    it('should return unhealthy when query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('getTableNames', () => {
    it('should return DATABASE_TABLES constant', () => {
      const tables = client.getTableNames();
      expect(tables).toBeDefined();
      expect(typeof tables).toBe('object');
    });
  });
});
