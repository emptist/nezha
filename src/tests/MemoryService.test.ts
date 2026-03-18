import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryService, type SaveMemoryInput } from '../core/Memory.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult, Memory } from '../config/types.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
    close: vi.fn(),
  })),
}));

const createMockDb = (): DatabaseClient => {
  const mockDb = {
    query: vi.fn(),
    close: vi.fn(),
  } as unknown as DatabaseClient;
  return mockDb;
};

describe('MemoryService', () => {
  let memoryService: MemoryService;
  let mockDb: DatabaseClient;

  beforeEach(() => {
    mockDb = createMockDb();
    mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    memoryService = new MemoryService(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('save', () => {
    it('should save a memory', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as QueryResult<unknown>);

      const input: SaveMemoryInput = {
        id: 'memory-1',
        content: 'Test content',
        metadata: { key: 'value' },
      };

      const result = await memoryService.save(input);
      expect(result).toBe('memory-1');
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should save memory with projectId', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as QueryResult<unknown>);

      const input: SaveMemoryInput = {
        id: 'memory-2',
        projectId: 'project-1',
        content: 'Test content',
      };

      const result = await memoryService.save(input);
      expect(result).toBe('memory-2');
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should save memory without metadata', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as QueryResult<unknown>);

      const input: SaveMemoryInput = {
        id: 'memory-3',
        content: 'Test content',
      };

      const result = await memoryService.save(input);
      expect(result).toBe('memory-3');
    });
  });

  describe('search', () => {
    it('should search memories', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      const mockMemories: Memory[] = [
        {
          id: 'mem-1',
          projectId: 'proj-1',
          content: 'Hello world',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockQuery.mockResolvedValue({ rows: mockMemories, rowCount: 1 } as QueryResult<Memory>);

      const results = await memoryService.search('hello');
      expect(results).toHaveLength(1);
      const firstResult = results[0];
      if (firstResult) {
        expect(firstResult.content).toBe('Hello world');
      }
    });

    it('should return empty array when no results', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<Memory>);

      const results = await memoryService.search('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should use custom limit', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<Memory>);

      await memoryService.search('test', 10);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        expect.arrayContaining([expect.any(String), 10, 0])
      );
    });
  });

  describe('getByProject', () => {
    it('should get memories by project', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      const mockMemories: Memory[] = [
        {
          id: 'mem-1',
          projectId: 'proj-1',
          content: 'Content 1',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockQuery.mockResolvedValue({ rows: mockMemories, rowCount: 1 } as QueryResult<Memory>);

      const results = await memoryService.getByProject('proj-1');
      expect(results).toHaveLength(1);
      const firstResult = results[0];
      if (firstResult) {
        expect(firstResult.projectId).toBe('proj-1');
      }
    });

    it('should return empty array for unknown project', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<Memory>);

      const results = await memoryService.getByProject('unknown-project');
      expect(results).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('should get memory by id', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      const mockMemory: Memory = {
        id: 'mem-1',
        projectId: 'proj-1',
        content: 'Test',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockQuery.mockResolvedValue({ rows: [mockMemory], rowCount: 1 } as QueryResult<Memory>);

      const result = await memoryService.getById('mem-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('mem-1');
    });

    it('should return null for unknown id', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<Memory>);

      const result = await memoryService.getById('unknown-id');
      expect(result).toBeNull();
    });
  });

  describe('deleteOldMemories', () => {
    it('should delete old memories', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 5 } as QueryResult<unknown>);

      const deletedCount = await memoryService.deleteOldMemories();
      expect(deletedCount).toBe(5);
    });

    it('should return 0 when no memories to delete', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

      const deletedCount = await memoryService.deleteOldMemories();
      expect(deletedCount).toBe(0);
    });
  });

  describe('compactMemories', () => {
    it('should skip compaction when under limit', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery.mockResolvedValue({ rows: [{ count: '100' }], rowCount: 1 } as QueryResult<{
        count: string;
      }>);

      const result = await memoryService.compactMemories(10000);
      expect(result.archived).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should archive memories exceeding limit', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10050' }], rowCount: 1 } as QueryResult<{
          count: string;
        }>)
        .mockResolvedValueOnce({
          rows: [{ id: 'mem-1' }, { id: 'mem-2' }],
          rowCount: 2,
        } as QueryResult<{ id: string }>)
        .mockResolvedValueOnce({ rows: [], rowCount: 2 } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ count: '10000' }], rowCount: 1 } as QueryResult<{
          count: string;
        }>);

      const result = await memoryService.compactMemories(10000);
      expect(result.archived).toBe(2);
      expect(result.totalBefore).toBe(10050);
      expect(result.totalAfter).toBe(10000);
    });

    it('should clean up old archived memories', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10050' }], rowCount: 1 } as QueryResult<{
          count: string;
        }>)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<{ id: string }>)
        .mockResolvedValueOnce({ rows: [], rowCount: 10 } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ count: '10000' }], rowCount: 1 } as QueryResult<{
          count: string;
        }>);

      const result = await memoryService.compactMemories(10000);
      expect(result.deleted).toBe(10);
    });
  });
});
