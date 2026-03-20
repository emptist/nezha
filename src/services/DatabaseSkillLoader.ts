import { logger } from '../utils/logger.js';
import { type ClawHubSkill, type SkillReviewResult } from './SkillReviewer.js';
import type { EmbeddingProvider } from './embedding/index.js';

export interface StoredSkill {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  manifest: Record<string, unknown>;
  source: 'clawhub' | 'local' | 'generated' | 'imported' | 'ai-built';
  external_id: string | null;
  version: string;
  author: string | null;
  tags: string[];
  trigger_phrases: string[];
  anti_patterns: string[];
  quick_start: string | null;
  examples: string[];
  emoji: string | null;
  category: string | null;
  content: Record<string, unknown>;
  safety_score: number;
  scan_status: 'pending' | 'clean' | 'suspicious' | 'malicious' | 'reviewed';
  verified: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'blocked' | 'installed' | 'uninstalled';
  permissions: string[];
  is_enabled: boolean;
  use_count: number;
  rating: number;
  downloads: number;
  last_used_at: Date | null;
  installed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  builder?: string | null;
  maintainer?: string | null;
  embedding?: number[];
}

export interface SkillMatch {
  skill: StoredSkill;
  matchScore: number;
  matchedPhrases: string[];
  antiPatternMatch: string | null;
}

export interface SkillExecutionContext {
  skillId: string;
  skillName: string;
  projectId?: string;
  userId?: string;
  timestamp: Date;
}

export interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  instructions: string | null;
  manifest: Record<string, unknown>;
  change_summary: string | null;
  improved_by: string | null;
  created_at: Date;
  embedding?: number[];
}

export interface VectorSearchResult {
  skill: StoredSkill;
  similarity: number;
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
        trigger_phrases, anti_patterns, quick_start, examples, emoji,
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
      trigger_phrases: Array.isArray(row.trigger_phrases) ? row.trigger_phrases : [],
      anti_patterns: Array.isArray(row.anti_patterns) ? row.anti_patterns : [],
      examples: Array.isArray(row.examples) ? row.examples : [],
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

  async findSkillsByTrigger(taskContext: string): Promise<SkillMatch[]> {
    const lowerContext = taskContext.toLowerCase();
    const words = lowerContext.split(/\s+/);

    const skills = await this.getAllSkills();
    const matches: SkillMatch[] = [];

    for (const skill of skills) {
      const matchedPhrases: string[] = [];
      let matchScore = 0;

      for (const phrase of skill.trigger_phrases || []) {
        const lowerPhrase = phrase.toLowerCase();
        if (lowerContext.includes(lowerPhrase)) {
          matchedPhrases.push(phrase);
          matchScore += 10;
        } else if (words.some(word => word.length > 3 && lowerPhrase.includes(word))) {
          matchedPhrases.push(phrase);
          matchScore += 5;
        }
      }

      if (skill.description && lowerContext.includes(skill.description.toLowerCase())) {
        matchScore += 3;
      }

      if (skill.tags.some(tag => lowerContext.includes(tag.toLowerCase()))) {
        matchScore += 2;
      }

      if (matchScore > 0) {
        matches.push({
          skill,
          matchScore,
          matchedPhrases,
          antiPatternMatch: this.checkAntiPatterns(skill, taskContext),
        });
      }
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  checkAntiPatterns(skill: StoredSkill, taskContext: string): string | null {
    const lowerContext = taskContext.toLowerCase();

    for (const pattern of skill.anti_patterns || []) {
      const lowerPattern = pattern.toLowerCase();
      if (lowerContext.includes(lowerPattern)) {
        return pattern;
      }
    }

    return null;
  }

  async getSuggestedSkills(taskContext: string, limit: number = 5): Promise<StoredSkill[]> {
    const matches = await this.findSkillsByTrigger(taskContext);

    const validMatches = matches.filter(m => !m.antiPatternMatch);

    return validMatches.slice(0, limit).map(m => m.skill);
  }

  async getSkillMatchDetails(skillName: string, taskContext: string): Promise<SkillMatch | null> {
    const skill = await this.getSkillByName(skillName);
    if (!skill) return null;

    const matches = await this.findSkillsByTrigger(taskContext);
    return matches.find(m => m.skill.name === skillName) || null;
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
