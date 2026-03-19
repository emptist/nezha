import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeGraphService, type CreateLinkInput } from '../core/KnowledgeGraph.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const createMockDb = (): DatabaseClient => {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>),
    close: vi.fn(),
  } as unknown as DatabaseClient;
};

describe('KnowledgeGraphService', () => {
  let graphService: KnowledgeGraphService;
  let mockDb: DatabaseClient;

  beforeEach(() => {
    mockDb = createMockDb();
    graphService = new KnowledgeGraphService(mockDb);
  });

  describe('constructor', () => {
    it('should create with database client', () => {
      expect(graphService).toBeDefined();
    });

    it('should create with optional embedding provider', () => {
      const serviceWithEmbedding = new KnowledgeGraphService(mockDb, {} as any);
      expect(serviceWithEmbedding).toBeDefined();
    });
  });

  describe('createLink', () => {
    it('should create a link', async () => {
      const input: CreateLinkInput = {
        fromType: 'memory',
        fromId: 'memory-1',
        toType: 'pattern',
        toId: 'pattern-1',
        relation: 'relates-to',
        confidence: 0.8,
        context: 'Test context',
      };

      const id = await graphService.createLink(input);
      
      expect(id).toBeDefined();
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should use default confidence when not provided', async () => {
      const input: CreateLinkInput = {
        fromType: 'memory',
        fromId: 'memory-1',
        toType: 'pattern',
        toId: 'pattern-1',
        relation: 'causes',
      };

      await graphService.createLink(input);
      
      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  describe('createMultipleLinks', () => {
    it('should create multiple links', async () => {
      const inputs: CreateLinkInput[] = [
        {
          fromType: 'memory',
          fromId: 'memory-1',
          toType: 'pattern',
          toId: 'pattern-1',
          relation: 'relates-to',
        },
        {
          fromType: 'pattern',
          fromId: 'pattern-1',
          toType: 'pattern',
          toId: 'pattern-2',
          relation: 'solves',
        },
      ];

      const ids = await graphService.createMultipleLinks(inputs);
      
      expect(ids).toHaveLength(2);
      expect(ids[0]).toBeDefined();
      expect(ids[1]).toBeDefined();
    });

    it('should return empty array for empty input', async () => {
      const ids = await graphService.createMultipleLinks([]);
      expect(ids).toHaveLength(0);
    });
  });

  describe('deleteLink', () => {
    it('should delete a link', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: [], rowCount: 1 } as QueryResult<unknown>
      );

      const result = await graphService.deleteLink('link-1');
      
      expect(result).toBe(true);
    });

    it('should return false when link not found', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: [], rowCount: 0 } as QueryResult<unknown>
      );

      const result = await graphService.deleteLink('non-existent');
      
      expect(result).toBe(false);
    });
  });

  describe('getLinksForNode', () => {
    it('should get links for node', async () => {
      const mockLinks = [
        { id: 'link-1', fromType: 'memory', fromId: 'mem-1', toType: 'pattern', toId: 'pat-1', relation: 'relates-to', confidence: 0.8 },
      ];
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: mockLinks, rowCount: 1 } as QueryResult<unknown>
      );

      const links = await graphService.getLinksForNode('memory', 'mem-1', 'both');
      
      expect(links).toHaveLength(1);
      expect(links[0].id).toBe('link-1');
    });

    it('should return empty array when no links found', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: [], rowCount: 0 } as QueryResult<unknown>
      );

      const links = await graphService.getLinksForNode('memory', 'mem-1');
      
      expect(links).toHaveLength(0);
    });
  });

  describe('getSubgraph', () => {
    it('should get subgraph for a node', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: [], rowCount: 0 } as QueryResult<unknown>
      );

      const result = await graphService.getSubgraph('memory', 'mem-1', 2, 50);
      
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('links');
    });
  });

  describe('findConnectedNodes', () => {
    it('should find connected nodes', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: [], rowCount: 0 } as QueryResult<unknown>
      );

      const nodes = await graphService.findConnectedNodes('memory', 'mem-1');
      
      expect(Array.isArray(nodes)).toBe(true);
    });
  });

  describe('autoBuildLinks', () => {
    it('should auto build links', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: [{ auto_build_knowledge_links: 5 }], rowCount: 1 } as QueryResult<unknown>
      );

      const count = await graphService.autoBuildLinks();
      
      expect(count).toBe(5);
    });
  });

  describe('linkMemoryToPattern', () => {
    it('should link memory to pattern', async () => {
      const id = await graphService.linkMemoryToPattern('mem-1', 'pat-1', 'context');
      
      expect(id).toBeDefined();
    });
  });

  describe('linkPatternToPattern', () => {
    it('should link pattern to pattern', async () => {
      const id = await graphService.linkPatternToPattern('pat-1', 'pat-2', 'relates-to', 0.8);
      
      expect(id).toBeDefined();
    });
  });

  describe('linkSolutionToError', () => {
    it('should link solution to error', async () => {
      const id = await graphService.linkSolutionToError('solution-pat', 'error-pat');
      
      expect(id).toBeDefined();
    });
  });

  describe('getKnowledgeStats', () => {
    it('should return knowledge stats', async () => {
      const mockStats = {
        totalLinks: 100,
        byRelation: { 'relates-to': 50, 'solves': 30 },
        byType: { memory: 40, pattern: 60 },
      };
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: [mockStats], rowCount: 1 } as QueryResult<unknown>
      );

      const stats = await graphService.getKnowledgeStats();
      
      expect(stats).toBeDefined();
    });
  });

  describe('findRelatedMemories', () => {
    it('should find related memories', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { rows: [], rowCount: 0 } as QueryResult<unknown>
      );

      const memories = await graphService.findRelatedMemories('pat-1', 5);
      
      expect(Array.isArray(memories)).toBe(true);
    });
  });
});