import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

vi.mock('../db/DatabaseClient.js');

describe('SemanticSearchService', () => {
  let mockDb: any;
  let mockEmbedding: any;
  let SemanticSearchService: any;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      close: vi.fn(),
    };

    mockEmbedding = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
    };

    vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
      OllamaEmbedding: vi.fn(() => mockEmbedding),
    }));

    const module = await import('../services/SemanticSearch.js');
    SemanticSearchService = module.SemanticSearchService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a semantic search service', () => {
      service = new SemanticSearchService(mockDb);
      expect(service).toBeDefined();
    });

    it('should use default config values', () => {
      service = new SemanticSearchService(mockDb, {});
      expect(service).toBeDefined();
    });

    it('should accept custom config', () => {
      service = new SemanticSearchService(mockDb, {
        similarityThreshold: 0.8,
        maxResults: 20,
        ollamaApiUrl: 'http://custom:11434',
        ollamaModel: 'custom-model',
      });
      expect(service).toBeDefined();
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate correct cosine similarity', () => {
      service = new SemanticSearchService(mockDb);
      const similarity = service.cosineSimilarity([1, 0, 0], [1, 0, 0]);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      service = new SemanticSearchService(mockDb);
      const similarity = service.cosineSimilarity([1, 0, 0], [0, 1, 0]);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return 0 for zero vectors', () => {
      service = new SemanticSearchService(mockDb);
      const similarity = service.cosineSimilarity([0, 0, 0], [0, 0, 0]);
      expect(similarity).toBe(0);
    });

    it('should throw error for mismatched dimensions', () => {
      service = new SemanticSearchService(mockDb);
      expect(() => service.cosineSimilarity([1, 0], [1, 0, 0])).toThrow(
        'Vectors must have the same dimension'
      );
    });
  });

  describe('parseEmbedding', () => {
    it('should parse valid JSON embedding', () => {
      service = new SemanticSearchService(mockDb);
      const embedding = '[1,2,3,4]';
      const result = service.parseEmbedding(embedding);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should return null for null input', () => {
      service = new SemanticSearchService(mockDb);
      const result = service.parseEmbedding(null);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      service = new SemanticSearchService(mockDb);
      const result = service.parseEmbedding('invalid json');
      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      service = new SemanticSearchService(mockDb);
    });

    it('should return search results', async () => {
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
            embedding: JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      } as QueryResult<any>);

      const results = await service.search('test');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mem-1');
    });

    it('should filter by projectId', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.search('test', 'proj-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('project_id'),
        expect.arrayContaining(['test', 'proj-1'])
      );
    });

    it('should throw error when embedding fails', async () => {
      mockEmbedding.embed.mockRejectedValueOnce(new Error('Embedding API error'));

      await expect(service.search('test')).rejects.toThrow('Failed to generate query embedding');
    });

    it('should handle empty results', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const results = await service.search('nonexistent');

      expect(results).toHaveLength(0);
    });
  });
});

describe('getSemanticSearch', () => {
  it('should return the same instance', async () => {
    vi.resetModules();
    vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
      OllamaEmbedding: vi.fn(() => ({
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      })),
    }));
    vi.mock('../db/DatabaseClient.js');

    const module = await import('../services/SemanticSearch.js');
    const { getSemanticSearch } = module;

    const instance1 = getSemanticSearch({} as DatabaseClient);
    const instance2 = getSemanticSearch({} as DatabaseClient);

    expect(instance1).toBe(instance2);
  });
});

describe('semantic_search', () => {
  it('should return message when not initialized', async () => {
    vi.resetModules();
    vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
      OllamaEmbedding: vi.fn(() => ({
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      })),
    }));
    vi.mock('../db/DatabaseClient.js');

    const module = await import('../services/SemanticSearch.js');
    const { semantic_search } = module;

    const result = await semantic_search('test query');
    expect(result).toBe('Semantic search not initialized');
  });
});
