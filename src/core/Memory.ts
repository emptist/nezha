import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, MEMORY_CONFIG } from '../config/constants.js';
import { type Memory, type MemoryFilter, type QueryResult } from '../config/types.js';

export interface SaveMemoryInput {
  id: string;
  projectId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class MemoryService {
  private readonly db: DatabaseClient;
  private readonly maxMemoryAgeMs: number;

  constructor(db: DatabaseClient, maxMemoryAgeMs?: number) {
    this.db = db;
    this.maxMemoryAgeMs = maxMemoryAgeMs ?? MEMORY_CONFIG.DEFAULT_MAX_MEMORY_AGE_MS;
  }

  async save(input: SaveMemoryInput): Promise<string> {
    const tableName = DATABASE_TABLES.MEMORY;
    const now = new Date();
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

    await this.db.query(
      `INSERT INTO ${tableName} (id, project_id, content, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET content = $3, metadata = $4, updated_at = $6`,
      [input.id, input.projectId, input.content, metadata, now, now]
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
