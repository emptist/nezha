import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  IConfig,
  DbConfig,
  TaskConfig,
  MemoryConfig,
  TransportConfig,
} from '../config/types.js';

vi.mock('pg');

const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
  totalCount: 10,
  idleCount: 3,
  waitingCount: 2,
};

const mockDbConfig: DbConfig = {
  host: 'localhost',
  port: 5432,
  database: 'test_db',
  user: 'test_user',
  password: 'test_password',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const mockTaskConfig: TaskConfig = {
  heartbeatIntervalMs: 30000,
  maxRetries: 3,
  retryDelayMs: 5000,
  taskTimeoutMs: 300000,
};

const mockMemoryConfig: MemoryConfig = {
  bootstrapDir: './bootstrap',
  maxMemoryAgeMs: 86400000,
};

const mockTransportConfig: TransportConfig = {
  mode: 'cli',
  opencodeApiUrl: 'http://localhost:4096',
};

const createMockConfig = (): IConfig => ({
  getDbConfig: vi.fn().mockReturnValue(mockDbConfig),
  getTaskConfig: vi.fn().mockReturnValue(mockTaskConfig),
  getMemoryConfig: vi.fn().mockReturnValue(mockMemoryConfig),
  getEmbeddingConfig: vi.fn().mockReturnValue(undefined),
  getEnv: vi.fn().mockReturnValue('test'),
  getTransportConfig: vi.fn().mockReturnValue(mockTransportConfig),
  getAgentName: vi.fn().mockReturnValue('nezha-daemon'),
  validate: vi.fn().mockReturnValue(true),
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
      (mockPool.totalCount as number | undefined) = undefined;
      (mockPool.idleCount as number | undefined) = undefined;
      (mockPool.waitingCount as number | undefined) = undefined;

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

  describe('setProjectContext', () => {
    it('should call disable_cross_project_learning when projectId is null', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.setProjectContext(null);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT disable_cross_project_learning()');
    });

    it('should call enable_cross_project_learning when projectId is ALL', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.setProjectContext('ALL');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT enable_cross_project_learning()');
    });

    it('should call set_project_context with projectId', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.setProjectContext('proj-123');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT set_project_context($1)', ['proj-123']);
    });
  });

  describe('getCrossProjectLearnings', () => {
    it('should return learnings from database', async () => {
      const mockLearnings = [{ id: '1', content: 'test' }];
      mockPool.query.mockResolvedValue({ rows: mockLearnings, rowCount: 1 });

      const result = await client.getCrossProjectLearnings(7, 50);

      expect(result).toEqual(mockLearnings);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_cross_project_learnings($1, $2)',
        [7, 50]
      );
    });

    it('should use default parameters', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.getCrossProjectLearnings();

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_cross_project_learnings($1, $2)',
        [7, 50]
      );
    });
  });

  describe('saveCrossProjectLearning', () => {
    it('should save learning and return id', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ save_cross_project_learning: 'new-id' }],
        rowCount: 1,
      });

      const result = await client.saveCrossProjectLearning(
        'test content',
        'proj-1',
        ['tag1'],
        5,
        'source'
      );

      expect(result).toBe('new-id');
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT save_cross_project_learning($1, $2, $3, $4, $5)',
        ['test content', 'proj-1', ['tag1'], 5, 'source']
      );
    });

    it('should use default values for optional parameters', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ save_cross_project_learning: 'new-id' }],
        rowCount: 1,
      });

      await client.saveCrossProjectLearning('test content');

      const call = mockPool.query.mock.calls[0];
      expect(call?.[0]).toBe('SELECT save_cross_project_learning($1, $2, $3, $4, $5)');
      expect(call?.[1]?.[0]).toBe('test content');
      expect(call?.[1]?.[4]).toBe('cross-project-learning');
    });
  });

  describe('saveConversation', () => {
    it('should save conversation with all fields', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 'conv-1' }], rowCount: 1 });

      const conversation = {
        sessionId: 'session-1',
        conversationType: 'task',
        title: 'Test Conversation',
        participants: ['agent-1', 'user-1'],
        messages: [{ role: 'user', content: 'hello' }],
        result: { summary: 'test' },
        success: true,
        durationMs: 1000,
        tokensUsed: 500,
        model: 'gpt-4',
        metadata: { key: 'value' },
      };

      const result = await client.saveConversation(conversation);

      expect(result).toBe('conv-1');
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should generate id if not provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 'generated-id' }], rowCount: 1 });

      const conversation = {
        sessionId: 'session-1',
        conversationType: 'task',
        title: 'Test',
        participants: [],
        messages: [],
      };

      await client.saveConversation(conversation);

      const call = mockPool.query.mock.calls[0];
      expect(call?.[1]?.[0]).toBeDefined();
    });
  });

  describe('getConversation', () => {
    it('should return conversation by id', async () => {
      const mockConv = { id: 'conv-1', title: 'Test' };
      mockPool.query.mockResolvedValue({ rows: [mockConv], rowCount: 1 });

      const result = await client.getConversation('conv-1');

      expect(result).toEqual(mockConv);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE c.id = $1'), [
        'conv-1',
      ]);
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await client.getConversation('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getConversationBySessionId', () => {
    it('should return conversation by session id', async () => {
      const mockConv = { id: 'conv-1', session_id: 'session-1' };
      mockPool.query.mockResolvedValue({ rows: [mockConv], rowCount: 1 });

      const result = await client.getConversationBySessionId('session-1');

      expect(result).toEqual(mockConv);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.session_id = $1'),
        ['session-1']
      );
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await client.getConversationBySessionId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('searchConversations', () => {
    it('should search with all parameters', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.searchConversations({
        query: 'test',
        projectId: 'proj-1',
        taskId: 'task-1',
        conversationType: 'task',
        success: true,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        limit: 50,
        offset: 10,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM search_conversations($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['test', 'proj-1', 'task-1', 'task', true, expect.any(Date), expect.any(Date), 50, 10]
      );
    });

    it('should use default values for optional parameters', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.searchConversations({});

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM search_conversations($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [null, null, null, null, null, null, null, 50, 0]
      );
    });
  });

  describe('getConversationsByTaskId', () => {
    it('should return conversations for task', async () => {
      const mockConvs = [{ id: 'conv-1' }, { id: 'conv-2' }];
      mockPool.query.mockResolvedValue({ rows: mockConvs, rowCount: 2 });

      const result = await client.getConversationsByTaskId('task-1');

      expect(result).toEqual(mockConvs);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM conversations WHERE task_id = $1 ORDER BY created_at DESC',
        ['task-1']
      );
    });
  });

  describe('getConversationsByDateRange', () => {
    it('should return conversations within date range', async () => {
      const mockConvs = [{ id: 'conv-1' }];
      mockPool.query.mockResolvedValue({ rows: mockConvs, rowCount: 1 });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await client.getConversationsByDateRange(startDate, endDate);

      expect(result).toEqual(mockConvs);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE created_at >= $1 AND created_at <= $2'),
        [startDate, endDate]
      );
    });

    it('should filter by projectId when provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await client.getConversationsByDateRange(startDate, endDate, 'proj-1');

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('AND project_id = $3'), [
        startDate,
        endDate,
        'proj-1',
      ]);
    });
  });

  describe('getConversationStats', () => {
    it('should return conversation stats', async () => {
      const mockStats = [{ date: '2024-01-01', count: 10 }];
      mockPool.query.mockResolvedValue({ rows: mockStats, rowCount: 1 });

      const result = await client.getConversationStats({
        projectId: 'proj-1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(result).toEqual(mockStats);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_conversation_stats($1, $2, $3)',
        ['proj-1', expect.any(Date), expect.any(Date)]
      );
    });

    it('should use default date range', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.getConversationStats({});

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_conversation_stats($1, $2, $3)',
        [null, expect.any(Date), expect.any(Date)]
      );
    });
  });

  describe('listConversations', () => {
    it('should list conversations with filters', async () => {
      const mockConvs = [{ id: 'conv-1' }];
      mockPool.query.mockResolvedValue({ rows: mockConvs, rowCount: 1 });

      const result = await client.listConversations({
        projectId: 'proj-1',
        conversationType: 'task',
        limit: 20,
        offset: 10,
      });

      expect(result).toEqual(mockConvs);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE 1=1'),
        expect.arrayContaining(['proj-1', 'task', 20, 10])
      );
    });

    it('should use default values', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await client.listConversations({});

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [50, 0]
      );
    });
  });
});
