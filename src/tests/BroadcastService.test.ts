import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BroadcastService } from '../services/BroadcastService.js';
import { DatabaseClient } from '../db/DatabaseClient.js';

vi.mock('../db/DatabaseClient.js');
vi.mock('../config/Config.js', () => ({
  Config: {
    getInstance: () => ({
      getAgentId: () => 'test-agent-id',
      getAgentDisplayName: () => 'Test Agent',
    }),
  },
}));
vi.mock('../utils/git.js', () => ({
  getGitInfo: () => ({ hash: 'abc123', branch: 'main' }),
}));
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockQuery = vi.fn();
const mockDb = {
  query: mockQuery,
} as unknown as DatabaseClient;

describe('BroadcastService', () => {
  let service: BroadcastService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BroadcastService(mockDb);
  });

  describe('sendBroadcast', () => {
    it('should send broadcast with default options', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const message = 'Test broadcast message';
      const result = await service.sendBroadcast(message);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const queryArg = mockQuery.mock.calls[0][0];
      const paramsArg = mockQuery.mock.calls[0][1];
      expect(queryArg).toContain('INSERT INTO project_communications');
      expect(queryArg).toContain('broadcast');
      expect(paramsArg).toContain(message);
    });

    it('should send broadcast with custom priority', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const message = 'High priority broadcast';
      const result = await service.sendBroadcast(message, { priority: 'high' });

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_communications'),
        expect.arrayContaining(['high'])
      );
    });

    it('should send broadcast to specific agent', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const message = 'Direct message';
      const result = await service.sendBroadcast(message, { targetAgent: 'specific-agent' });

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_communications'),
        expect.arrayContaining(['specific-agent'])
      );
    });

    it('should send critical priority broadcast', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const message = 'Critical alert';
      const result = await service.sendBroadcast(message, { priority: 'critical' });

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_communications'),
        expect.arrayContaining(['critical'])
      );
    });
  });

  describe('sendToAllAgents', () => {
    it('should send to all agents', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.sendToAllAgents('Hello everyone!');

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_communications'),
        expect.arrayContaining(['all-ais'])
      );
    });

    it('should send with custom priority', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.sendToAllAgents('High priority', 'high');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_communications'),
        expect.arrayContaining(['high'])
      );
    });
  });

  describe('sendToAgent', () => {
    it('should send to specific agent', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.sendToAgent('target-agent', 'Private message');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_communications'),
        expect.arrayContaining(['target-agent'])
      );
    });
  });

  describe('sendCritical', () => {
    it('should send critical broadcast', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.sendCritical('Emergency!');

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_communications'),
        expect.arrayContaining(['critical'])
      );
    });
  });

  describe('sendHighPriority', () => {
    it('should send high priority broadcast', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.sendHighPriority('Important!');

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_communications'),
        expect.arrayContaining(['high'])
      );
    });
  });

  describe('getBroadcasts', () => {
    it('should get broadcasts with default options', async () => {
      const mockBroadcasts = [
        {
          id: 'test-id-1',
          from_ai: 'agent-1',
          content: 'Broadcast 1',
          to_ai: 'all-ais',
          priority: 'normal',
          environment: 'development',
          created_at: new Date(),
          metadata: { agentName: 'Agent 1' },
          git_hash: null,
          git_branch: null,
          read_at: null,
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockBroadcasts });

      const result = await service.getBroadcasts(20);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test-id-1');
      expect(result[0].message).toBe('Broadcast 1');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT'), expect.anything());
    });

    it('should get broadcasts with priority filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getBroadcasts(20, 'high');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('priority = $2'),
        expect.arrayContaining(['high'])
      );
    });

    it('should return empty array when no broadcasts found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getBroadcasts(20);

      expect(result).toHaveLength(0);
    });
  });

  describe('getUnreadBroadcasts', () => {
    it('should get unread broadcasts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id',
            from_ai: 'agent-1',
            content: 'Unread message',
            to_ai: 'all-ais',
            created_at: new Date(),
            metadata: {},
            priority: 'normal',
            git_hash: null,
            git_branch: null,
            environment: 'development',
          },
        ],
      });

      const result = await service.getUnreadBroadcasts();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test-id');
    });
  });

  describe('markAsRead', () => {
    it('should mark broadcast as read', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.markAsRead('test-broadcast-id');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE project_communications'),
        expect.arrayContaining(['test-broadcast-id'])
      );
    });

    it('should not throw when marking non-existent broadcast', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await expect(service.markAsRead('non-existent-id')).resolves.toBeUndefined();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all broadcasts as read', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });

      const result = await service.markAllAsRead();

      expect(result).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE project_communications'),
        expect.arrayContaining([expect.any(String)])
      );
    });
  });

  describe('hasUnreadCritical', () => {
    it('should return true when there are unread critical broadcasts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const result = await service.hasUnreadCritical();

      expect(result).toBe(true);
    });

    it('should return false when no unread critical broadcasts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.hasUnreadCritical();

      expect(result).toBe(false);
    });
  });

  describe('endBroadcast', () => {
    it('should end a specific broadcast', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.endBroadcast('test-broadcast-id', 'resolved');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE project_communications'),
        expect.arrayContaining(['test-broadcast-id'])
      );
    });

    it('should end with custom resolution', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.endBroadcast('broadcast-123', 'completed');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['completed'])
      );
    });
  });

  describe('resolveRelatedBroadcasts', () => {
    it('should resolve broadcasts matching pattern', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      const count = await service.resolveRelatedBroadcasts('Agent ID 共享问题', '问题已解决');

      expect(count).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE project_communications'),
        expect.arrayContaining(['Agent ID 共享问题'])
      );
    });

    it('should return 0 when no matches', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const count = await service.resolveRelatedBroadcasts('nonexistent', 'not found');

      expect(count).toBe(0);
    });
  });
});
