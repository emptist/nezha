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

const createMockDb = (): DatabaseClient => {
  const mockDb = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseClient;
  return mockDb;
};

describe('AgentSessionService', () => {
  let service: AgentSessionService;
  let mockDb: DatabaseClient;

  beforeEach(() => {
    mockDb = createMockDb();
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
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ generate_bot_id: 'bot_123' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      const sessionId1 = await service.registerSession();
      const sessionId2 = await service.registerSession();

      expect(sessionId1).toBe('bot_123');
      expect(sessionId2).toBe('bot_123');
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should register new session with default agent type', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ generate_bot_id: 'bot_new' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      const sessionId = await service.registerSession();

      expect(sessionId).toBe('bot_new');
      expect(mockDb.query).toHaveBeenCalledTimes(3);
      expect(mockDb.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO agent_sessions'),
        ['bot_new', 'main', 'opencode']
      );
    });

    it('should register new session with custom agent type', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ generate_bot_id: 'bot_custom' }],
        } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ branch: 'feature' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      const sessionId = await service.registerSession('custom-agent');

      expect(sessionId).toBe('bot_custom');
      expect(mockDb.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO agent_sessions'),
        ['bot_custom', 'feature', 'custom-agent']
      );
    });

    it('should register new session with default agent type', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ generate_bot_id: 'bot_new' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      const sessionId = await service.registerSession();

      expect(sessionId).toBe('bot_new');
      expect(mockDb.query).toHaveBeenCalledTimes(3);
      expect(mockDb.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO agent_sessions'),
        ['bot_new', 'main', 'opencode']
      );
    });

    it('should register new session with custom agent type', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ generate_bot_id: 'bot_custom' }],
        } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ branch: 'feature' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      const sessionId = await service.registerSession('custom-agent');

      expect(sessionId).toBe('bot_custom');
      expect(mockDb.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO agent_sessions'),
        ['bot_custom', 'feature', 'custom-agent']
      );
    });

    it('should handle git branch query failure gracefully', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ generate_bot_id: 'bot_no_git' }],
        } as QueryResult<unknown>)
        .mockRejectedValueOnce(new Error('Git error'))
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      const sessionId = await service.registerSession();

      expect(sessionId).toBe('bot_no_git');
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should fallback to random UUID if generate_bot_id returns null', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{}] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      const sessionId = await service.registerSession();

      expect(sessionId).toMatch(/^bot_[a-f0-9-]+$/);
    });
  });

  describe('heartbeat', () => {
    it('should do nothing if no session registered', async () => {
      await service.heartbeat();

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should update heartbeat with workingOn', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ generate_bot_id: 'bot_hb' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      await service.registerSession();
      await service.heartbeat('Working on task 123');

      expect(mockDb.query).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE agent_sessions'),
        ['Working on task 123', 'bot_hb']
      );
    });

    it('should update heartbeat without changing workingOn', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ generate_bot_id: 'bot_hb2' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      await service.registerSession();
      await service.heartbeat(undefined);

      expect(mockDb.query).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE agent_sessions'),
        [undefined, 'bot_hb2']
      );
    });
  });

  describe('unregister', () => {
    it('should do nothing if no session registered', async () => {
      await service.unregister();

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should mark session as dead and clear sessionId', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ generate_bot_id: 'bot_dead' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult<unknown>);

      await service.registerSession();
      expect(service.getSessionId()).toBe('bot_dead');

      await service.unregister();

      expect(mockDb.query).toHaveBeenLastCalledWith(
        expect.stringContaining("UPDATE agent_sessions SET status = 'dead'"),
        ['bot_dead']
      );
      expect(service.getSessionId()).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should return empty array when no sessions', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [] } as QueryResult<unknown>);

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

      mockDb.query = vi.fn().mockResolvedValue({ rows: [mockRow] } as QueryResult<unknown>);

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

      mockDb.query = vi.fn().mockResolvedValue({ rows: [mockRow] } as QueryResult<unknown>);

      const sessions = await service.getActiveSessions();

      expect(sessions[0].gitBranch).toBeUndefined();
      expect(sessions[0].workingOn).toBeUndefined();
    });

    it('should sort by last_heartbeat descending', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [] } as QueryResult<unknown>);

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
