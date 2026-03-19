import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

const { mockDb, mockEmbedding } = vi.hoisted(() => ({
  mockDb: {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    close: vi.fn(),
  },
  mockEmbedding: {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
  },
}));

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => mockDb),
}));

vi.mock('../services/embedding/OllamaEmbedding.js', () => ({
  OllamaEmbedding: vi.fn().mockImplementation(() => mockEmbedding),
}));

describe('SemanticSearchService', () => {
  let SemanticSearchService: any;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockEmbedding.embed.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);

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
    it('should filter by projectId', async () => {
      await service.search('test', 'proj-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('project_id'),
        expect.arrayContaining(['test', 'proj-1'])
      );
    });

    it('should handle empty results', async () => {
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
