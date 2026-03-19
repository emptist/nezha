import { logger } from '../utils/logger.js';
import { type ClawHubSkill, type SkillReviewResult } from './SkillReviewer.js';

export interface StoredSkill {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  manifest: Record<string, unknown>;
  source: 'clawhub' | 'local' | 'generated' | 'imported';
  external_id: string | null;
  version: string;
  author: string | null;
  tags: string[];
  safety_score: number;
  scan_status: 'pending' | 'clean' | 'suspicious' | 'malicious' | 'reviewed';
  verified: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'blocked' | 'installed' | 'uninstalled';
  permissions: string[];
  is_enabled: boolean;
  use_count: number;
  last_used_at: Date | null;
  installed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SkillExecutionContext {
  skillId: string;
  skillName: string;
  projectId?: string;
  userId?: string;
  timestamp: Date;
}

export class DatabaseSkillLoader {
  private cache: Map<string, StoredSkill> = new Map();
  private cacheExpiry: number = 60000;
  private lastRefresh: number = 0;
  private dbClient: unknown = null;

  setDatabaseClient(client: unknown): void {
    this.dbClient = client;
    this.invalidateCache();
  }

  invalidateCache(): void {
    this.cache.clear();
    this.lastRefresh = 0;
    logger.info('[SkillLoader] Cache invalidated');
  }

  async refreshCache(): Promise<void> {
    if (!this.dbClient) {
      logger.warn('[SkillLoader] No database client set, using empty cache');
      return;
    }

    try {
      const skills = await this.loadApprovedSkillsFromDb();
      this.cache.clear();
      for (const skill of skills) {
        this.cache.set(skill.id, skill);
      }
      this.lastRefresh = Date.now();
      logger.info(`[SkillLoader] Cache refreshed with ${skills.length} skills`);
    } catch (error) {
      logger.error('[SkillLoader] Failed to refresh cache:', error);
    }
  }

  private async loadApprovedSkillsFromDb(): Promise<StoredSkill[]> {
    if (!this.dbClient) return [];

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: StoredSkill[] }>;
    };

    const result = await client.query(
      `SELECT 
        id, project_id, name, description, instructions, manifest,
        source, external_id, version, author, tags,
        safety_score, scan_status, verified,
        status, permissions, is_enabled,
        use_count, last_used_at, installed_at,
        created_at, updated_at
       FROM skills 
       WHERE status = 'approved' 
         AND is_enabled = TRUE
         AND safety_score >= 70
       ORDER BY rating DESC, use_count DESC`
    );

    return result.rows.map(row => ({
      ...row,
      tags: Array.isArray(row.tags) ? row.tags : [],
      permissions: Array.isArray(row.permissions) ? row.permissions : [],
    }));
  }

  async getSkill(skillId: string, context?: SkillExecutionContext): Promise<StoredSkill | null> {
    if (!context?.skillId && Date.now() - this.lastRefresh > this.cacheExpiry) {
      await this.refreshCache();
    }

    const cached = this.cache.get(skillId);
    if (cached) {
      await this.incrementUsage(skillId, context);
      return cached;
    }

    if (this.dbClient) {
      const skill = await this.loadSkillById(skillId);
      if (skill) {
        this.cache.set(skillId, skill);
        await this.incrementUsage(skillId, context);
      }
      return skill;
    }

    return null;
  }

  async getSkillByName(name: string, context?: SkillExecutionContext): Promise<StoredSkill | null> {
    if (!this.dbClient) {
      for (const skill of this.cache.values()) {
        if (skill.name === name) {
          await this.incrementUsage(skill.id, context);
          return skill;
        }
      }
      return null;
    }

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: StoredSkill[] }>;
    };

    const result = await client.query(
      `SELECT * FROM skills 
       WHERE name = $1 
         AND status = 'approved' 
         AND is_enabled = TRUE 
         AND safety_score >= 70
       LIMIT 1`,
      [name]
    );

    if (result.rows.length > 0) {
      const skill = result.rows[0];
      if (skill) {
        this.cache.set(skill.id, skill);
        await this.incrementUsage(skill.id, context);
        return skill;
      }
    }

    return null;
  }

  async getAllSkills(_context?: SkillExecutionContext): Promise<StoredSkill[]> {
    if (Date.now() - this.lastRefresh > this.cacheExpiry) {
      await this.refreshCache();
    }

    if (this.cache.size > 0) {
      const skills = Array.from(this.cache.values());
      return skills;
    }

    if (!this.dbClient) return [];

    return this.loadApprovedSkillsFromDb();
  }

  async searchSkills(query: string, _context?: SkillExecutionContext): Promise<StoredSkill[]> {
    if (!this.dbClient) {
      const lowerQuery = query.toLowerCase();
      return Array.from(this.cache.values()).filter(
        skill =>
          skill.name.toLowerCase().includes(lowerQuery) ||
          skill.description?.toLowerCase().includes(lowerQuery) ||
          skill.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    }

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: StoredSkill[] }>;
    };

    const result = await client.query(
      `SELECT * FROM skills 
       WHERE status = 'approved' 
         AND is_enabled = TRUE
         AND safety_score >= 70
         AND (
           name ILIKE $1 
           OR description ILIKE $1 
           OR $2 && tags
         )
       ORDER BY rating DESC
       LIMIT 20`,
      [`%${query}%`, [query]]
    );

    return result.rows;
  }

  private async loadSkillById(skillId: string): Promise<StoredSkill | null> {
    if (!this.dbClient) return null;

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: StoredSkill[] }>;
    };

    const result = await client.query(
      `SELECT * FROM skills 
       WHERE id = $1 
         AND status = 'approved' 
         AND is_enabled = TRUE 
         AND safety_score >= 70`,
      [skillId]
    );

    return result.rows[0] || null;
  }

  private async incrementUsage(skillId: string, context?: SkillExecutionContext): Promise<void> {
    if (!this.dbClient) return;

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    };

    await client.query(
      `UPDATE skills 
       SET use_count = use_count + 1, 
           last_used_at = NOW()
       WHERE id = $1`,
      [skillId]
    );

    if (context) {
      await this.logSkillUsage(skillId, context);
    }
  }

  private async logSkillUsage(skillId: string, context: SkillExecutionContext): Promise<void> {
    if (!this.dbClient) return;

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    };

    await client.query(
      `INSERT INTO skill_audit_log (skill_id, project_id, action, performed_by, details)
       VALUES ($1, $2, 'used', $3, $4)`,
      [
        skillId,
        context.projectId || null,
        context.userId || 'system',
        JSON.stringify({
          timestamp: context.timestamp.toISOString(),
          skillName: context.skillName,
        }),
      ]
    );
  }

  async saveSkillFromClawHub(
    skill: ClawHubSkill,
    review: SkillReviewResult
  ): Promise<string | null> {
    if (!this.dbClient) {
      logger.warn('[SkillLoader] No database client, cannot save skill');
      return null;
    }

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: { id: string }[] }>;
    };

    const result = await client.query(
      `INSERT INTO skills (
        id, name, description, source, external_id, version, author,
        tags, safety_score, scan_status, verified,
        status, permissions, instructions,
        manifest, warnings, issues, code_analysis,
        review_status, auto_review_score, review_notes,
        installed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       ON CONFLICT (external_id) DO UPDATE SET
        safety_score = EXCLUDED.safety_score,
        scan_status = EXCLUDED.scan_status,
        updated_at = NOW()
       RETURNING id`,
      [
        skill.id || crypto.randomUUID(),
        skill.name,
        skill.description,
        'clawhub',
        skill.id,
        skill.version,
        skill.author,
        skill.tags,
        review.score,
        skill.scanStatus || review.isSafe ? 'clean' : 'suspicious',
        skill.verified,
        review.isSafe ? 'approved' : 'blocked',
        review.codeAnalysis?.permissions || [],
        null,
        {},
        review.warnings,
        review.issues,
        review.codeAnalysis ? JSON.stringify(review.codeAnalysis) : '{}',
        review.isSafe ? 'auto_passed' : 'auto_failed',
        review.score,
        JSON.stringify(review),
        new Date(),
      ]
    );

    return result.rows[0]?.id || null;
  }

  isCacheValid(): boolean {
    return Date.now() - this.lastRefresh < this.cacheExpiry;
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export const databaseSkillLoader = new DatabaseSkillLoader();
