import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentSessionService } from '../services/AgentSessionService.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../services/AgentSessionService.js', async () => {
  const actual = await vi.importActual('../services/AgentSessionService.js');
  return {
    ...(actual as object),
    agentSessionService: null,
  };
});

vi.mock('../config/Config.js', () => ({
  Config: {
    getInstance: vi.fn(() => ({
      config: { agentId: 'bot_test_session_id' },
    })),
  },
}));

let sharedQueryMock: ReturnType<typeof vi.fn>;

const createMockPoolClient = () => ({
  query: sharedQueryMock,
  release: vi.fn(),
});

const createMockDb = (): DatabaseClient => {
  sharedQueryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
  const mockPoolClient = createMockPoolClient();
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockPoolClient),
  };
  const mockDb = {
    query: sharedQueryMock,
    close: vi.fn().mockResolvedValue(undefined),
    getPool: vi.fn().mockReturnValue(mockPool),
  } as unknown as DatabaseClient;
  return mockDb;
};

describe('AgentSessionService', () => {
  let service: AgentSessionService;
  let mockDb: DatabaseClient;
  let mockPoolClient: ReturnType<typeof createMockPoolClient>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockPoolClient = mockDb.getPool().connect() as ReturnType<typeof createMockPoolClient>;
    service = new AgentSessionService(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with null sessionId', () => {
      expect(service.getSessionId()).toBeNull();
    });
  });

  describe('registerSession', () => {
    it('should return existing sessionId if already registered', async () => {
      sharedQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // SELECT COUNT
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // getGitBranch
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const sessionId1 = await service.registerSession();
      const sessionId2 = await service.registerSession();

      expect(sessionId1).toBe('bot_test_session_id');
      expect(sessionId2).toBe('bot_test_session_id');
    });

    it('should register new session with default agent type', async () => {
      sharedQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // SELECT COUNT
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // getGitBranch
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const sessionId = await service.registerSession();

      expect(sessionId).toBe('bot_test_session_id');
      expect(sharedQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_sessions'),
        ['bot_test_session_id', 'main', 'opencode']
      );
    });

    it('should register new session with custom agent type', async () => {
      sharedQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // SELECT COUNT
        .mockResolvedValueOnce({ rows: [{ branch: 'feature' }] }) // getGitBranch
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const sessionId = await service.registerSession('custom-agent');

      expect(sessionId).toBe('bot_test_session_id');
      expect(sharedQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_sessions'),
        ['bot_test_session_id', 'feature', 'custom-agent']
      );
    });

    it('should handle git branch query failure gracefully', async () => {
      sharedQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // SELECT COUNT
        .mockRejectedValueOnce(new Error('Git error')) // getGitBranch fails
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const sessionId = await service.registerSession();

      expect(sessionId).toBe('bot_test_session_id');
    });
  });

  describe('heartbeat', () => {
    it('should do nothing if no session registered', async () => {
      await service.heartbeat();

      expect(sharedQueryMock).not.toHaveBeenCalled();
    });

    it('should update heartbeat with workingOn', async () => {
      sharedQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // SELECT COUNT
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // getGitBranch
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.registerSession();
      await service.heartbeat('Working on task 123');

      expect(sharedQueryMock).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE agent_sessions'),
        ['Working on task 123', 'bot_test_session_id']
      );
    });

    it('should update heartbeat without changing workingOn', async () => {
      sharedQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // SELECT COUNT
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // getGitBranch
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.registerSession();
      await service.heartbeat(undefined);

      expect(sharedQueryMock).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE agent_sessions'),
        [undefined, 'bot_test_session_id']
      );
    });
  });

  describe('unregister', () => {
    it('should do nothing if no session registered', async () => {
      await service.unregister();

      expect(sharedQueryMock).not.toHaveBeenCalled();
    });

    it('should mark session as dead and clear sessionId', async () => {
      sharedQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // SELECT COUNT
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // getGitBranch
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.registerSession();
      expect(service.getSessionId()).toBe('bot_test_session_id');

      await service.unregister();

      expect(sharedQueryMock).toHaveBeenLastCalledWith(
        expect.stringContaining("UPDATE agent_sessions SET status = 'dead'"),
        ['bot_test_session_id']
      );
      expect(service.getSessionId()).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should return empty array when no sessions', async () => {
      sharedQueryMock.mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      const sessions = await service.getActiveSessions();

      expect(sessions).toEqual([]);
    });

    it('should return mapped session data', async () => {
      const mockRow = {
        id: 'bot_active',
        started_at: new Date('2024-01-01'),
        last_heartbeat: new Date('2024-01-02'),
        status: 'alive' as const,
        git_branch: 'feature',
        working_on: 'Task 1',
        agent_type: 'opencode',
      };

      sharedQueryMock.mockResolvedValueOnce({ rows: [mockRow] } as QueryResult<unknown>);

      const sessions = await service.getActiveSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual({
        id: 'bot_active',
        startedAt: new Date('2024-01-01'),
        lastHeartbeat: new Date('2024-01-02'),
        status: 'alive',
        gitBranch: 'feature',
        workingOn: 'Task 1',
        agentType: 'opencode',
      });
    });

    it('should handle null git_branch and working_on', async () => {
      const mockRow = {
        id: 'bot_minimal',
        started_at: new Date(),
        last_heartbeat: new Date(),
        status: 'alive' as const,
        git_branch: null,
        working_on: null,
        agent_type: 'cli',
      };

      sharedQueryMock.mockResolvedValueOnce({ rows: [mockRow] } as QueryResult<unknown>);

      const sessions = await service.getActiveSessions();

      expect(sessions[0].gitBranch).toBeUndefined();
      expect(sessions[0].workingOn).toBeUndefined();
    });

    it('should sort by last_heartbeat descending', async () => {
      sharedQueryMock.mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      await service.getActiveSessions();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY last_heartbeat DESC')
      );
    });
  });

  describe('cleanupStaleSessions', () => {
    it('should call cleanup function with default interval', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ cleanup_stale_sessions: 5 }],
      } as QueryResult<unknown>);

      const cleaned = await service.cleanupStaleSessions();

      expect(cleaned).toBe(5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('cleanup_stale_sessions'),
        [5]
      );
    });

    it('should call cleanup function with custom interval', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ cleanup_stale_sessions: 10 }],
      } as QueryResult<unknown>);

      const cleaned = await service.cleanupStaleSessions(15);

      expect(cleaned).toBe(10);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('cleanup_stale_sessions'),
        [15]
      );
    });

    it('should return 0 when no sessions cleaned', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ cleanup_stale_sessions: 0 }],
      } as QueryResult<unknown>);

      const cleaned = await service.cleanupStaleSessions();

      expect(cleaned).toBe(0);
    });

    it('should return 0 when function returns null', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{}],
      } as QueryResult<unknown>);

      const cleaned = await service.cleanupStaleSessions();

      expect(cleaned).toBe(0);
    });
  });
});
