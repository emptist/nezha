import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES } from '../config/constants.js';
import { OllamaEmbedding } from '../services/embedding/OllamaEmbedding.js';
import { type EmbeddingConfig } from '../services/embedding/types.js';
import { logger } from '../utils/logger.js';

export interface SemanticSearchConfig {
  ollamaApiUrl?: string;
  ollamaModel?: string;
  similarityThreshold?: number;
  maxResults?: number;
}

export interface SearchResult {
  id: string;
  content: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  importance?: number;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
  similarity: number;
}

export class SemanticSearchService {
  private readonly db: DatabaseClient;
  private readonly embedding: OllamaEmbedding;
  private readonly similarityThreshold: number;
  private readonly maxResults: number;

  constructor(db: DatabaseClient, config?: SemanticSearchConfig) {
    this.db = db;
    this.similarityThreshold = config?.similarityThreshold ?? 0.7;
    this.maxResults = config?.maxResults ?? 10;

    const embeddingConfig: EmbeddingConfig = {
      provider: 'ollama',
      model: config?.ollamaModel ?? 'nomic-embed-text',
      apiUrl: config?.ollamaApiUrl ?? 'http://localhost:11434',
    };

    this.embedding = new OllamaEmbedding(embeddingConfig);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  private parseEmbedding(embeddingStr: string | null): number[] | null {
    if (!embeddingStr) {
      return null;
    }

    try {
      return JSON.parse(embeddingStr);
    } catch (err) {
      logger.debug(
        `Failed to parse embedding: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      return null;
    }
  }

  async search(query: string, projectId?: string, limit?: number): Promise<SearchResult[]> {
    const sanitizedQuery = query.trim();
    const queryLimit = limit ?? this.maxResults;

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embedding.embed(sanitizedQuery);
    } catch (error) {
      logger.error('Failed to embed query:', error);
      throw new Error('Failed to generate query embedding', { cause: error });
    }

    const tableName = DATABASE_TABLES.MEMORY;
    const projectIdFilter = projectId ? `AND project_id = $2` : '';
    const params = projectId ? [sanitizedQuery, projectId] : [sanitizedQuery];

    const result = await this.db.query<{
      id: string;
      project_id: string | null;
      content: string;
      metadata: string | null;
      tags: string | null;
      importance: number | null;
      source: string | null;
      embedding: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT 
        id, 
        project_id, 
        content, 
        metadata, 
        tags, 
        importance, 
        source, 
        embedding,
        created_at, 
        updated_at
       FROM ${tableName}
       WHERE embedding IS NOT NULL
         AND content ILIKE '%' || $1 || '%'
         ${projectIdFilter}
       ORDER BY created_at DESC
       LIMIT 100`,
      params
    );

    const results: SearchResult[] = [];

    for (const row of result.rows) {
      const memoryEmbedding = this.parseEmbedding(row.embedding);

      if (!memoryEmbedding) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryEmbedding, memoryEmbedding);

      if (similarity >= this.similarityThreshold) {
        results.push({
          id: row.id,
          content: row.content,
          projectId: row.project_id ?? undefined,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          tags: row.tags ? JSON.parse(row.tags) : undefined,
          importance: row.importance ?? undefined,
          source: row.source ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          similarity,
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, queryLimit);
  }
}

let semanticSearchInstance: SemanticSearchService | null = null;

export function getSemanticSearch(
  db: DatabaseClient,
  config?: SemanticSearchConfig
): SemanticSearchService {
  if (!semanticSearchInstance) {
    semanticSearchInstance = new SemanticSearchService(db, config);
  }
  return semanticSearchInstance;
}

export async function semantic_search(query: string, projectId?: string): Promise<string> {
  if (!semanticSearchInstance) {
    return 'Semantic search not initialized';
  }

  const results = await semanticSearchInstance.search(query, projectId);

  if (results.length === 0) {
    return `No relevant memories found for query: "${query}"`;
  }

  const formatted = results
    .map((r, i) => {
      return `${i + 1}. [${r.similarity.toFixed(2)}] ${r.content.substring(0, 200)}${r.content.length > 200 ? '...' : ''}`;
    })
    .join('\n');

  return `Found ${results.length} relevant memories:\n${formatted}`;
}
