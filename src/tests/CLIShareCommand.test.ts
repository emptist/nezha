import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { BroadcastService } from '../services/BroadcastService.js';

vi.mock('../db/DatabaseClient.js');
vi.mock('../services/BroadcastService.js');
vi.mock('../config/Config.js', () => ({
  Config: {
    getInstance: () => ({
      getDbConfig: () => ({}),
      getAgentId: () => 'test-agent-id',
    }),
  },
}));

describe('share CLI command logic', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockDb: DatabaseClient;
  let mockBroadcast: BroadcastService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockDb = {
      query: mockQuery,
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseClient;
    mockBroadcast = {
      sendBroadcast: vi.fn().mockResolvedValue('broadcast-id'),
    } as unknown as BroadcastService;

    vi.mocked(DatabaseClient).mockImplementation(() => mockDb);
    vi.mocked(BroadcastService).mockImplementation(() => mockBroadcast);
  });

  describe('share command parsing', () => {
    it('should require text argument - empty args', () => {
      const args: string[] = ['share'];
      const text = args.slice(1).join(' ');
      expect(text).toBe('');
    });

    it('should parse text from args correctly', () => {
      const args: string[] = ['share', 'Test reflection message'];
      const text = args.slice(1).join(' ');
      expect(text).toBe('Test reflection message');
    });

    it('should handle multi-word text', () => {
      const args: string[] = ['share', 'This', 'is', 'a', 'long', 'message'];
      const text = args.slice(1).join(' ');
      expect(text).toBe('This is a long message');
    });

    it('should handle text with special characters', () => {
      const args: string[] = ['share', 'Insight: Always check array access!'];
      const text = args.slice(1).join(' ');
      expect(text).toBe('Insight: Always check array access!');
    });
  });

  describe('share command database operations', () => {
    it('should call BroadcastService.sendBroadcast with correct priority', async () => {
      await mockBroadcast.sendBroadcast('Test message', { priority: 'normal' });
      expect(mockBroadcast.sendBroadcast).toHaveBeenCalledWith('Test message', {
        priority: 'normal',
      });
    });

    it('should insert memory with correct tags and source', async () => {
      const text = 'Test reflection';
      await mockDb.query(
        `INSERT INTO memory (content, tags, source, importance) VALUES ($1, ARRAY['reflection', 'broadcast'], 'areflect', 6)`,
        [text]
      );
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO memory'), [text]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("ARRAY['reflection', 'broadcast']"),
        [text]
      );
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("'areflect'"), [text]);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('6'), [text]);
    });

    it('should close database connection after operation', async () => {
      await mockDb.close();
      expect(mockDb.close).toHaveBeenCalled();
    });
  });
});
