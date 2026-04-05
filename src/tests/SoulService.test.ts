import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoulService } from '../../src/services/SoulService.js';
import { AgentIdentityService } from '../../src/services/AgentIdentityService.js';

vi.mock('../../src/services/AgentIdentityService.js', () => ({
  AgentIdentityService: {
    getResolvedIdentity: vi.fn().mockResolvedValue({ id: 'test-agent-id', name: 'Test Agent' }),
  },
}));

const mockQuery = vi.fn();

const mockDb = {
  query: mockQuery,
};

describe('SoulService', () => {
  let service: SoulService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SoulService(mockDb as any);
  });

  describe('saveSoul', () => {
    it('should save soul with all parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const id = await service.saveSoul('agent-123', 'TestBot', '# My Soul\n\nI am a test bot.', {
        trait1: 'value1',
      });

      expect(id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO souls'),
        expect.arrayContaining(['agent-123'])
      );
    });

    it('should update existing soul on conflict', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.saveSoul('agent-123', 'UpdatedBot');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (agent_id)'),
        expect.any(Array)
      );
    });
  });

  describe('getSoul', () => {
    it('should return soul when found', async () => {
      const mockSoul = {
        id: 'soul-id',
        agent_id: 'agent-123',
        name: 'TestSoul',
        content: '# Soul Content',
        traits: { curious: true },
        created_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockSoul] });

      const soul = await service.getSoul('agent-123');

      expect(soul).toEqual({
        id: 'soul-id',
        agentId: 'agent-123',
        name: 'TestSoul',
        content: '# Soul Content',
        traits: { curious: true },
        createdAt: mockSoul.created_at,
      });
    });

    it('should return null when soul not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const soul = await service.getSoul('nonexistent');

      expect(soul).toBeNull();
    });
  });

  describe('listSouls', () => {
    it('should return all souls', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { agent_id: 'agent-1', name: 'Soul1' },
          { agent_id: 'agent-2', name: 'Soul2' },
        ],
      });

      const souls = await service.listSouls();

      expect(souls).toHaveLength(2);
      expect(souls[0]).toEqual({ agentId: 'agent-1', name: 'Soul1' });
    });
  });

  describe('markViewed', () => {
    it('should mark item as viewed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.markViewed('memory', 'item-id');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE memory SET viewers'),
        expect.arrayContaining(['item-id'])
      );
    });

    it('should reject invalid table names', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await service.markViewed('invalid_table', 'item-id');

      expect(mockQuery).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid table'));
    });
  });
});
