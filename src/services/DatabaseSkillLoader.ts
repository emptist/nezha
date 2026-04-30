import { logger } from '../utils/logger.js';
import { type ClawHubSkill, type SkillReviewResult, SkillReviewer } from './SkillReviewer.js';
import { type EmbeddingProvider } from './embedding/index.js';

export interface CreateSkillInput {
  name: string;
  description?: string;
  instructions?: string;
  source?: 'local' | 'generated' | 'imported' | 'ai-built';
  author?: string;
  tags?: string[];
  trigger_phrases?: string[];
  anti_patterns?: string[];
  quick_start?: string;
  examples?: string[];
  emoji?: string;
  category?: string;
  project_id?: string;
  permissions?: string[];
}

export interface UpdateSkillInput extends Partial<CreateSkillInput> {
  version?: string;
  status?: StoredSkill['status'];
  is_enabled?: boolean;
  safety_score?: number;
  scan_status?: StoredSkill['scan_status'];
}

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
  private embeddingProvider?: EmbeddingProvider;
  private skillReviewer: SkillReviewer = new SkillReviewer();

  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

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
      `SELECT *, 
         COALESCE(
           CASE WHEN content->>'markdown' != '' THEN content->>'markdown'
           ELSE instructions 
           END,
           ''
         ) AS instructions
       FROM skills 
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
    const filtered = matches.filter(m => m.antiPatternMatch === null);
    return filtered.slice(0, limit).map(m => m.skill);
  }

  async incrementUseCount(skillNames: string[]): Promise<void> {
    if (skillNames.length === 0) return;
    try {
      const db = this.dbClient as { query: (sql: string, args: unknown[]) => Promise<unknown> };
      if (!db?.query) return;
      await db.query(
        `UPDATE skills SET use_count = use_count + 1, updated_at = NOW() 
         WHERE name = ANY($1)`,
        [skillNames]
      );
    } catch (error) {
      logger.debug('Failed to increment use_count:', error);
    }
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

  async saveSkill(input: CreateSkillInput): Promise<string | null> {
    if (!this.dbClient) {
      logger.warn('[SkillLoader] No database client, cannot save skill');
      return null;
    }

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: { id: string }[] }>;
    };

    const id = crypto.randomUUID();
    let embeddingStr: string | null = null;

    if (this.embeddingProvider) {
      const textToEmbed = `${input.name} ${input.description || ''} ${input.tags?.join(' ') || ''}`;
      try {
        const embedding = await this.embeddingProvider.embed(textToEmbed);
        embeddingStr = `[${embedding.join(',')}]`;
      } catch (error) {
        logger.warn('[SkillLoader] Failed to generate embedding:', error);
      }
    }

    const skillContent = [input.instructions, input.description, input.category]
      .filter(Boolean)
      .join('\n\n');
    const fakeSkill: ClawHubSkill = {
      id,
      name: input.name,
      description: input.description || '',
      author: input.author || 'unknown',
      version: '1.0.0',
      downloads: 0,
      rating: 0,
      tags: input.tags || [],
      repository: '',
      verified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const reviewResult = await this.skillReviewer.reviewSkill(fakeSkill, skillContent);
    const safetyScore = reviewResult.score;
    const scanStatus = reviewResult.isSafe
      ? 'clean'
      : reviewResult.issues.length > 0
        ? 'suspicious'
        : 'reviewed';
    logger.info(
      `[SkillLoader] Safety scan for ${input.name}: score=${safetyScore}, status=${scanStatus}`
    );

    const result = await client.query(
      `INSERT INTO skills (
        id, name, description, instructions, source, author,
        tags, trigger_phrases, anti_patterns, quick_start, examples, emoji,
        category, project_id, permissions, status, is_enabled,
        safety_score, scan_status, version, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'approved', TRUE, $16, $17, '1.0.0', $18)
       ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        instructions = EXCLUDED.instructions,
        safety_score = EXCLUDED.safety_score,
        scan_status = EXCLUDED.scan_status,
        updated_at = NOW()
       RETURNING id`,
      [
        id,
        input.name,
        input.description || null,
        input.instructions || null,
        input.source || 'local',
        input.author || null,
        input.tags || [],
        input.trigger_phrases || [],
        input.anti_patterns || [],
        input.quick_start || null,
        input.examples || [],
        input.emoji || null,
        input.category || null,
        input.project_id || null,
        input.permissions || [],
        safetyScore,
        scanStatus,
        embeddingStr,
      ]
    );

    if (result.rows[0]?.id) {
      this.invalidateCache();
    }

    return result.rows[0]?.id || null;
  }

  async updateSkill(id: string, input: UpdateSkillInput): Promise<boolean> {
    if (!this.dbClient) {
      logger.warn('[SkillLoader] No database client, cannot update skill');
      return false;
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(input.description);
    }
    if (input.instructions !== undefined) {
      updates.push(`instructions = $${paramIndex++}`);
      params.push(input.instructions);
    }
    if (input.author !== undefined) {
      updates.push(`author = $${paramIndex++}`);
      params.push(input.author);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      params.push(input.tags);
    }
    if (input.trigger_phrases !== undefined) {
      updates.push(`trigger_phrases = $${paramIndex++}`);
      params.push(input.trigger_phrases);
    }
    if (input.anti_patterns !== undefined) {
      updates.push(`anti_patterns = $${paramIndex++}`);
      params.push(input.anti_patterns);
    }
    if (input.quick_start !== undefined) {
      updates.push(`quick_start = $${paramIndex++}`);
      params.push(input.quick_start);
    }
    if (input.examples !== undefined) {
      updates.push(`examples = $${paramIndex++}`);
      params.push(input.examples);
    }
    if (input.emoji !== undefined) {
      updates.push(`emoji = $${paramIndex++}`);
      params.push(input.emoji);
    }
    if (input.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(input.category);
    }
    if (input.project_id !== undefined) {
      updates.push(`project_id = $${paramIndex++}`);
      params.push(input.project_id);
    }
    if (input.permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      params.push(input.permissions);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(input.status);
    }
    if (input.is_enabled !== undefined) {
      updates.push(`is_enabled = $${paramIndex++}`);
      params.push(input.is_enabled);
    }
    if (input.safety_score !== undefined) {
      updates.push(`safety_score = $${paramIndex++}`);
      params.push(input.safety_score);
    }
    if (input.scan_status !== undefined) {
      updates.push(`scan_status = $${paramIndex++}`);
      params.push(input.scan_status);
    }

    if (input.version !== undefined) {
      updates.push(`version = $${paramIndex++}`);
      params.push(input.version);
    }

    if (this.embeddingProvider && (input.name || input.description || input.tags)) {
      const skill = await this.loadSkillById(id);
      const textToEmbed = `${input.name || skill?.name || ''} ${input.description || skill?.description || ''} ${input.tags?.join(' ') || skill?.tags?.join(' ') || ''}`;
      try {
        const embedding = await this.embeddingProvider.embed(textToEmbed);
        updates.push(`embedding = $${paramIndex++}`);
        params.push(`[${embedding.join(',')}]`);
      } catch (error) {
        logger.warn('[SkillLoader] Failed to generate embedding for update:', error);
      }
    }

    if (updates.length === 0) return false;

    updates.push('updated_at = NOW()');
    params.push(id);

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number }>;
    };

    const result = await client.query(
      `UPDATE skills SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    if (result.rowCount > 0) {
      this.invalidateCache();
      return true;
    }

    return false;
  }

  async saveSkillVersion(
    skillId: string,
    version: string,
    instructions?: string | null,
    manifest?: Record<string, unknown>,
    changeSummary?: string,
    improvedBy?: string
  ): Promise<string | null> {
    if (!this.dbClient) {
      logger.warn('[SkillLoader] No database client, cannot save skill version');
      return null;
    }

    let embeddingStr: string | null = null;
    if (this.embeddingProvider && instructions) {
      try {
        const embedding = await this.embeddingProvider.embed(instructions);
        embeddingStr = `[${embedding.join(',')}]`;
      } catch (error) {
        logger.warn('[SkillLoader] Failed to generate embedding for version:', error);
      }
    }

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: { id: string }[] }>;
    };

    const id = crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO skill_versions (id, skill_id, version, instructions, manifest, change_summary, improved_by, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (skill_id, version) DO UPDATE SET
        instructions = EXCLUDED.instructions,
        manifest = EXCLUDED.manifest,
        change_summary = EXCLUDED.change_summary,
        improved_by = EXCLUDED.improved_by,
        embedding = COALESCE(EXCLUDED.embedding, skill_versions.embedding)
       RETURNING id`,
      [
        id,
        skillId,
        version,
        instructions,
        JSON.stringify(manifest || {}),
        changeSummary,
        improvedBy,
        embeddingStr,
      ]
    );

    return result.rows[0]?.id || null;
  }

  async getSkillVersionHistory(skillId: string): Promise<SkillVersion[]> {
    if (!this.dbClient) return [];

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: SkillVersion[] }>;
    };

    const result = await client.query(
      `SELECT id, skill_id, version, instructions, manifest, change_summary, improved_by, created_at
       FROM skill_versions
       WHERE skill_id = $1
       ORDER BY created_at DESC`,
      [skillId]
    );

    return result.rows;
  }

  async vectorSearch(
    query: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<VectorSearchResult[]> {
    if (!this.dbClient) {
      logger.warn('[SkillLoader] No database client, cannot perform vector search');
      return [];
    }

    if (!this.embeddingProvider) {
      logger.warn('[SkillLoader] No embedding provider, falling back to keyword search');
      return (await this.searchSkills(query)).slice(0, limit).map(skill => ({
        skill,
        similarity: 1,
      }));
    }

    try {
      const queryEmbedding = await this.embeddingProvider.embed(query);
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      const client = this.dbClient as {
        query: (
          sql: string,
          params?: unknown[]
        ) => Promise<{ rows: (StoredSkill & { similarity: number })[] }>;
      };

      const result = await client.query(
        `SELECT *,
          (1 - (embedding <=> $1::vector))::FLOAT as similarity
         FROM skills
         WHERE embedding IS NOT NULL
           AND status = 'approved'
           AND is_enabled = TRUE
           AND safety_score >= 70
           AND (1 - (embedding <=> $1::vector)) >= $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [embeddingStr, threshold, limit]
      );

      return result.rows.map(row => ({
        skill: {
          ...row,
          tags: Array.isArray(row.tags) ? row.tags : [],
          trigger_phrases: Array.isArray(row.trigger_phrases) ? row.trigger_phrases : [],
          anti_patterns: Array.isArray(row.anti_patterns) ? row.anti_patterns : [],
          examples: Array.isArray(row.examples) ? row.examples : [],
          permissions: Array.isArray(row.permissions) ? row.permissions : [],
        },
        similarity: row.similarity,
      }));
    } catch (error) {
      logger.error('[SkillLoader] Vector search failed:', error);
      return [];
    }
  }

  async getSkillsByProject(projectId: string): Promise<StoredSkill[]> {
    if (!this.dbClient) {
      return Array.from(this.cache.values()).filter(s => s.project_id === projectId);
    }

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: StoredSkill[] }>;
    };

    const result = await client.query(
      `SELECT * FROM skills 
       WHERE project_id = $1
         AND status = 'approved'
         AND is_enabled = TRUE
       ORDER BY rating DESC, use_count DESC`,
      [projectId]
    );

    return result.rows;
  }

  async getSkillsByCategory(category: string): Promise<StoredSkill[]> {
    if (!this.dbClient) {
      return Array.from(this.cache.values()).filter(s => s.category === category);
    }

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: StoredSkill[] }>;
    };

    const result = await client.query(
      `SELECT * FROM skills 
       WHERE category = $1
         AND status = 'approved'
         AND is_enabled = TRUE
       ORDER BY rating DESC, use_count DESC`,
      [category]
    );

    return result.rows;
  }

  async hybridSearch(query: string, limit: number = 10): Promise<VectorSearchResult[]> {
    const vectorResults = await this.vectorSearch(query, limit, 0.5);
    const keywordResults = await this.searchSkills(query);

    const scoreMap = new Map<string, { skill: StoredSkill; score: number }>();

    for (const result of vectorResults) {
      scoreMap.set(result.skill.id, { skill: result.skill, score: result.similarity * 0.6 });
    }

    for (const skill of keywordResults) {
      const existing = scoreMap.get(skill.id);
      const idx = keywordResults.indexOf(skill);
      const keywordScore = 1 - idx / keywordResults.length;
      if (existing) {
        existing.score += keywordScore * 0.4;
      } else {
        scoreMap.set(skill.id, { skill, score: keywordScore * 0.4 });
      }
    }

    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({ skill: item.skill, similarity: item.score }));
  }

  isCacheValid(): boolean {
    return Date.now() - this.lastRefresh < this.cacheExpiry;
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export const databaseSkillLoader = new DatabaseSkillLoader();
