import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QueryResult } from '../config/types.js';

vi.mock('../db/DatabaseClient.js');

let mockEmbeddingInstance: any;

vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
  OllamaEmbedding: vi.fn().mockImplementation(() => mockEmbeddingInstance),
}));

describe('SemanticSearchService', () => {
  let mockDb: any;
  let SemanticSearchService: any;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      close: vi.fn(),
    };

    mockEmbeddingInstance = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
    };

    const module = await import('../services/SemanticSearch.js');
    SemanticSearchService = module.SemanticSearchService;
    service = new SemanticSearchService(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a semantic search service', () => {
      expect(service).toBeDefined();
    });

    it('should use default config values', () => {
      const s = new SemanticSearchService(mockDb, {});
      expect(s).toBeDefined();
    });

    it('should accept custom config', () => {
      const s = new SemanticSearchService(mockDb, {
        similarityThreshold: 0.8,
        maxResults: 20,
        ollamaApiUrl: 'http://custom:11434',
        ollamaModel: 'custom-model',
      });
      expect(s).toBeDefined();
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate correct cosine similarity', () => {
      const similarity = service.cosineSimilarity([1, 0, 0], [1, 0, 0]);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const similarity = service.cosineSimilarity([1, 0, 0], [0, 1, 0]);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return 0 for zero vectors', () => {
      const similarity = service.cosineSimilarity([0, 0, 0], [0, 0, 0]);
      expect(similarity).toBe(0);
    });

    it('should throw error for mismatched dimensions', () => {
      expect(() => service.cosineSimilarity([1, 0], [1, 0, 0])).toThrow(
        'Vectors must have the same dimension'
      );
    });
  });

  describe('parseEmbedding', () => {
    it('should parse valid JSON embedding', () => {
      const result = service.parseEmbedding('[1,2,3,4]');
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should return null for null input', () => {
      const result = service.parseEmbedding(null);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const result = service.parseEmbedding('invalid json');
      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    it('should return search results with matching dimensions', async () => {
      const embeddingVector = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
      mockEmbeddingInstance.embed.mockResolvedValue(embeddingVector);
      
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'mem-1',
            project_id: 'proj-1',
            content: 'Test memory content',
            metadata: null,
            tags: null,
            importance: null,
            source: null,
            embedding: JSON.stringify(embeddingVector),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      } as QueryResult<any>);

      const results = await service.search('test');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mem-1');
      expect(results[0].similarity).toBeCloseTo(1, 1);
    });

    it('should filter by projectId', async () => {
      await service.search('test', 'proj-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('project_id'),
        expect.arrayContaining(['test', 'proj-1'])
      );
    });

    it('should throw error when embedding fails', async () => {
      mockEmbeddingInstance.embed.mockRejectedValue(new Error('Embedding API error'));

      await expect(service.search('test')).rejects.toThrow('Failed to generate query embedding');
    });

    it('should handle empty results', async () => {
      const results = await service.search('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should sort results by similarity descending', async () => {
      const highSim = [1, 0, 0, 0, 0, 0, 0, 0];
      const mediumSim = [0.7, 0, 0, 0, 0, 0, 0, 0];

      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'mem-1',
            project_id: null,
            content: 'Lower similarity',
            metadata: null,
            tags: null,
            importance: null,
            source: null,
            embedding: JSON.stringify(mediumSim),
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 'mem-2',
            project_id: null,
            content: 'Higher similarity',
            metadata: null,
            tags: null,
            importance: null,
            source: null,
            embedding: JSON.stringify(highSim),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 2,
      } as QueryResult<any>);

      const results = await service.search('test');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('mem-2');
      expect(results[1].id).toBe('mem-1');
    });

    it('should limit results to maxResults', async () => {
      const vector = [1, 0, 0, 0, 0, 0, 0, 0];
      const manyRows = Array.from({ length: 20 }, (_, i) => ({
        id: `mem-${i}`,
        project_id: null,
        content: `Content ${i}`,
        metadata: null,
        tags: null,
        importance: null,
        source: null,
        embedding: JSON.stringify(vector),
        created_at: new Date(),
        updated_at: new Date(),
      }));

      mockDb.query.mockResolvedValue({ rows: manyRows, rowCount: 20 } as QueryResult<any>);

      const limitedService = new SemanticSearchService(mockDb, { maxResults: 5 });
      const results = await limitedService.search('test');

      expect(results).toHaveLength(5);
    });

    it('should parse metadata JSON', async () => {
      const vector = [1, 0, 0, 0, 0, 0, 0, 0];
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'mem-1',
            project_id: null,
            content: 'Test',
            metadata: JSON.stringify({ key: 'value' }),
            tags: JSON.stringify(['tag1', 'tag2']),
            importance: 5,
            source: 'test-source',
            embedding: JSON.stringify(vector),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      } as QueryResult<any>);

      const results = await service.search('test');

      expect(results[0].metadata).toEqual({ key: 'value' });
      expect(results[0].tags).toEqual(['tag1', 'tag2']);
      expect(results[0].importance).toBe(5);
      expect(results[0].source).toBe('test-source');
    });

    it('should filter out results below similarity threshold', async () => {
      const vector = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'mem-1',
            project_id: null,
            content: 'Test',
            metadata: null,
            tags: null,
            importance: null,
            source: null,
            embedding: JSON.stringify(vector),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      } as QueryResult<any>);

      const strictService = new SemanticSearchService(mockDb, { similarityThreshold: 0.99 });
      const results = await strictService.search('test');

      expect(results).toHaveLength(0);
    });

    it('should skip rows with invalid embedding', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'mem-1',
            project_id: null,
            content: 'Invalid embedding',
            metadata: null,
            tags: null,
            importance: null,
            source: null,
            embedding: 'invalid-json',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      } as QueryResult<any>);

      const results = await service.search('test');

      expect(results).toHaveLength(0);
    });

    it('should trim query whitespace', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.search('  test query  ');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['test query'])
      );
    });
  });
});

describe('getSemanticSearch', () => {
  it('should return the same instance', async () => {
    vi.resetModules();
    
    let localMockEmbed: any;
    vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
      OllamaEmbedding: vi.fn().mockImplementation(() => ({
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      })),
    }));
    vi.mock('../db/DatabaseClient.js');

    const module = await import('../services/SemanticSearch.js');
    const { getSemanticSearch } = module;

    const instance1 = getSemanticSearch({} as any);
    const instance2 = getSemanticSearch({} as any);

    expect(instance1).toBe(instance2);
  });
});

describe('semantic_search', () => {
  it('should return message when not initialized', async () => {
    vi.resetModules();
    vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
      OllamaEmbedding: vi.fn().mockImplementation(() => ({
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      })),
    }));
    vi.mock('../db/DatabaseClient.js');

    const module = await import('../services/SemanticSearch.js');
    const { semantic_search } = module;

    const result = await semantic_search('test query');
    expect(result).toBe('Semantic search not initialized');
  });

  it('should format search results when initialized', async () => {
    vi.resetModules();
    
    vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
      OllamaEmbedding: vi.fn().mockImplementation(() => ({
        embed: vi.fn().mockResolvedValue([1, 0, 0, 0, 0, 0, 0, 0]),
      })),
    }));
    vi.mock('../db/DatabaseClient.js', () => ({
      DatabaseClient: vi.fn(),
    }));

    const mockDb = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'mem-1',
            project_id: null,
            content: 'This is a test memory that should appear in results',
            metadata: null,
            tags: null,
            importance: null,
            source: null,
            embedding: JSON.stringify([1, 0, 0, 0, 0, 0, 0, 0]),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      } as QueryResult<any>),
    };

    const module = await import('../services/SemanticSearch.js');
    const { getSemanticSearch, semantic_search } = module;
    
    getSemanticSearch(mockDb as any);

    const result = await semantic_search('test');

    expect(result).toContain('Found 1 relevant memories');
    expect(result).toContain('[1.00]');
  });

  it('should return no results message when no matches', async () => {
    vi.resetModules();
    
    vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
      OllamaEmbedding: vi.fn().mockImplementation(() => ({
        embed: vi.fn().mockResolvedValue([0.1, 0.1, 0.1, 0.1]),
      })),
    }));
    vi.mock('../db/DatabaseClient.js', () => ({
      DatabaseClient: vi.fn(),
    }));

    const mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<any>),
    };

    const module = await import('../services/SemanticSearch.js');
    const { getSemanticSearch, semantic_search } = module;
    
    getSemanticSearch(mockDb as any);

    const result = await semantic_search('nonexistentquery');

    expect(result).toContain('No relevant memories found');
  });
});
