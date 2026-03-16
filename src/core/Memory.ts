import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, MEMORY_CONFIG } from '../config/constants.js';
import { type Memory, type MemoryFilter, type QueryResult } from '../config/types.js';
import { EmbeddingProvider, ZhipuEmbedding } from '../services/embedding/index.js';

export interface SaveMemoryInput {
  id: string;
  projectId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  importance?: number;
  source?: string;
  generateEmbedding?: boolean;
}

export interface VectorSearchResult extends Memory {
  similarity: number;
}

export interface KeywordSearchResult extends Memory {
  rank: number;
}

export interface HybridSearchResult extends Memory {
  vectorSimilarity: number;
  keywordRank: number;
  combinedScore: number;
}

export class MemoryService {
  private readonly db: DatabaseClient;
  private readonly maxMemoryAgeMs: number;
  private readonly embedding?: EmbeddingProvider;

  constructor(db: DatabaseClient, maxMemoryAgeMs?: number, embedding?: EmbeddingProvider) {
    this.db = db;
    this.maxMemoryAgeMs = maxMemoryAgeMs ?? MEMORY_CONFIG.DEFAULT_MAX_MEMORY_AGE_MS;
    this.embedding = embedding;
  }

  async save(input: SaveMemoryInput): Promise<string> {
    const tableName = DATABASE_TABLES.MEMORY;
    const now = new Date();
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
    const projectId = input.projectId ?? null;
    const tags = input.tags ?? null;
    const importance = input.importance ?? 5;
    const source = input.source ?? null;

    let embeddingVector: number[] | null = null;
    
    if (input.generateEmbedding !== false && this.embedding) {
      try {
        embeddingVector = await this.embedding.embed(input.content);
      } catch (error) {
        console.error('Failed to generate embedding:', error);
      }
    }

    const embeddingStr = embeddingVector ? `[${embeddingVector.join(',')}]` : null;

    await this.db.query(
      `INSERT INTO ${tableName} (id, project_id, content, metadata, tags, importance, source, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET 
         content = $3, 
         metadata = $4, 
         tags = $5, 
         importance = $6, 
         source = $7, 
         embedding = $8,
         updated_at = $10`,
      [input.id, projectId, input.content, metadata, tags, importance, source, embeddingStr, now, now]
    );

    return input.id;
  }

  async search(searchTerm: string, limit?: number, offset?: number): Promise<Memory[]> {
    const tableName = DATABASE_TABLES.MEMORY;
    const queryLimit = limit ?? 50;
    const queryOffset = offset ?? 0;

    const result = await this.db.query<Memory>(
      `SELECT id, project_id as "projectId", content, metadata, created_at as "createdAt", updated_at as "updatedAt"
       FROM ${tableName}
       WHERE content ILIKE $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${searchTerm}%`, queryLimit, queryOffset]
    );

    return result.rows;
  }

  async vectorSearch(
    query: string, 
    projectId?: string, 
    limit?: number, 
    threshold?: number
  ): Promise<VectorSearchResult[]> {
    if (!this.embedding) {
      throw new Error('Embedding provider not configured');
    }

    const tableName = DATABASE_TABLES.MEMORY;
    const queryLimit = limit ?? 10;
    const queryThreshold = threshold ?? 0.7;
    const queryEmbedding = await this.embedding.embed(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const projectIdFilter = projectId ? `AND project_id = '${projectId}'` : '';

    const result = await this.db.query<VectorSearchResult>(
      `SELECT 
        id, 
        project_id as "projectId", 
        content, 
        metadata, 
        tags,
        importance,
        source,
        created_at as "createdAt", 
        updated_at as "updatedAt",
        (1 - (embedding <=> '${embeddingStr}'::vector))::FLOAT as similarity
       FROM ${tableName}
       WHERE embedding IS NOT NULL
         ${projectIdFilter}
         AND (1 - (embedding <=> '${embeddingStr}'::vector)) >= ${queryThreshold}
       ORDER BY embedding <=> '${embeddingStr}'::vector
       LIMIT ${queryLimit}`
    );

    return result.rows;
  }

  async keywordSearch(
    query: string, 
    projectId?: string, 
    limit?: number
  ): Promise<KeywordSearchResult[]> {
    const tableName = DATABASE_TABLES.MEMORY;
    const queryLimit = limit ?? 10;
    const projectIdFilter = projectId ? `AND project_id = '${projectId}'` : '';

    const result = await this.db.query<KeywordSearchResult>(
      `SELECT 
        id, 
        project_id as "projectId", 
        content, 
        metadata, 
        tags,
        importance,
        source,
        created_at as "createdAt", 
        updated_at as "updatedAt",
        ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', '${query}'))::FLOAT as rank
       FROM ${tableName}
       WHERE to_tsvector('english', content) @@ plainto_tsquery('english', '${query}')
         ${projectIdFilter}
       ORDER BY rank DESC
       LIMIT ${queryLimit}`
    );

    return result.rows;
  }

  async hybridSearch(
    query: string, 
    projectId?: string, 
    limit?: number,
    vectorWeight?: number,
    keywordWeight?: number
  ): Promise<HybridSearchResult[]> {
    if (!this.embedding) {
      throw new Error('Embedding provider not configured');
    }

    const tableName = DATABASE_TABLES.MEMORY;
    const queryLimit = limit ?? 10;
    const queryVectorWeight = vectorWeight ?? 0.7;
    const queryKeywordWeight = keywordWeight ?? 0.3;
    const queryEmbedding = await this.embedding.embed(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const projectIdFilter = projectId ? `AND project_id = '${projectId}'` : '';

    const result = await this.db.query<HybridSearchResult>(
      `WITH vector_results AS (
        SELECT 
          id, 
          project_id as "projectId", 
          content, 
          metadata, 
          tags,
          importance,
          source,
          (1 - (embedding <=> '${embeddingStr}'::vector))::FLOAT as vector_similarity,
          0.0::FLOAT as keyword_rank,
          created_at as "createdAt", 
          updated_at as "updatedAt"
        FROM ${tableName}
        WHERE embedding IS NOT NULL
          ${projectIdFilter}
        ORDER BY embedding <=> '${embeddingStr}'::vector
        LIMIT ${queryLimit * 2}
      ),
      keyword_results AS (
        SELECT 
          id, 
          project_id as "projectId", 
          content, 
          metadata, 
          tags,
          importance,
          source,
          0.0::FLOAT as vector_similarity,
          ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', '${query}'))::FLOAT as keyword_rank,
          created_at as "createdAt", 
          updated_at as "updatedAt"
        FROM ${tableName}
        WHERE to_tsvector('english', content) @@ plainto_tsquery('english', '${query}')
          ${projectIdFilter}
        ORDER BY keyword_rank DESC
        LIMIT ${queryLimit * 2}
      ),
      combined AS (
        SELECT * FROM vector_results
        UNION
        SELECT * FROM keyword_results
      )
      SELECT 
        id,
        "projectId",
        content,
        metadata,
        tags,
        importance,
        source,
        vector_similarity as "vectorSimilarity",
        keyword_rank as "keywordRank",
        (vector_similarity * ${queryVectorWeight} + keyword_rank * ${queryKeywordWeight})::FLOAT as "combinedScore",
        "createdAt",
        "updatedAt"
      FROM combined
      ORDER BY "combinedScore" DESC
      LIMIT ${queryLimit}`
    );

    return result.rows;
  }

  async getByProject(projectId: string, limit?: number, offset?: number): Promise<Memory[]> {
    const tableName = DATABASE_TABLES.MEMORY;
    const queryLimit = limit ?? 50;
    const queryOffset = offset ?? 0;

    const result = await this.db.query<Memory>(
      `SELECT id, project_id as "projectId", content, metadata, created_at as "createdAt", updated_at as "updatedAt"
       FROM ${tableName}
       WHERE project_id = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [projectId, queryLimit, queryOffset]
    );

    return result.rows;
  }

  async getById(id: string): Promise<Memory | null> {
    const tableName = DATABASE_TABLES.MEMORY;

    const result = await this.db.query<Memory>(
      `SELECT id, project_id as "projectId", content, metadata, created_at as "createdAt", updated_at as "updatedAt"
       FROM ${tableName}
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] ?? null;
  }

  async deleteOldMemories(): Promise<number> {
    const tableName = DATABASE_TABLES.MEMORY;
    const cutoffDate = new Date(Date.now() - this.maxMemoryAgeMs);

    const result = await this.db.query(
      `DELETE FROM ${tableName} WHERE updated_at < $1`,
      [cutoffDate]
    );

    return result.rowCount;
  }
}
