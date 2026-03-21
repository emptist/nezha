import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES } from '../config/constants.js';
import {
  type TaskPattern,
  type LearningInsight,
  type SimilarSolution,
  type FailureImprovement,
} from '../config/types.js';
import { EmbeddingProvider } from '../services/embedding/index.js';
import { logger } from '../utils/logger.js';

const ERROR_CATEGORIES = {
  TYPESCRIPT: 'typescript',
  DOCKER: 'docker',
  DATABASE: 'database',
  NETWORK: 'network',
  PERMISSION: 'permission',
  CONFIGURATION: 'configuration',
  DEPENDENCY: 'dependency',
  API: 'api',
  BUILD: 'build',
  TEST: 'test',
  DEPLOYMENT: 'deployment',
  UNKNOWN: 'unknown',
};

export class LearningAnalysisService {
  private readonly db: DatabaseClient;
  private readonly embedding?: EmbeddingProvider;

  constructor(db: DatabaseClient, embedding?: EmbeddingProvider) {
    this.db = db;
    this.embedding = embedding;
  }

  async recordOutcome(
    taskId: string,
    status: 'COMPLETED' | 'FAILED' | 'RUNNING',
    options?: {
      projectId?: string;
      taskType?: string;
      taskDescription?: string;
      errorMessage?: string;
      solutionApplied?: string;
      solutionWorked?: boolean;
      executionTimeMs?: number;
      attempts?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<string> {
    const id = crypto.randomUUID();
    const errorCategory = options?.errorMessage ? this.categorizeError(options.errorMessage) : null;

    let embeddingVector: number[] | null = null;
    const contentToEmbed = options?.taskDescription || options?.errorMessage || '';

    if (contentToEmbed && this.embedding) {
      try {
        embeddingVector = await this.embedding.embed(contentToEmbed);
      } catch (error) {
        logger.warn('Failed to generate embedding for outcome:', error);
      }
    }

    const embeddingStr = embeddingVector ? `[${embeddingVector.join(',')}]` : null;

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.TASK_OUTCOMES} 
       (id, task_id, project_id, task_type, task_description, status, error_message, 
        error_category, solution_applied, solution_worked, execution_time_ms, attempts, 
        metadata, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
      [
        id,
        taskId,
        options?.projectId ?? null,
        options?.taskType ?? null,
        options?.taskDescription ?? null,
        status,
        options?.errorMessage ?? null,
        errorCategory,
        options?.solutionApplied ?? null,
        options?.solutionWorked ?? null,
        options?.executionTimeMs ?? null,
        options?.attempts ?? 1,
        options?.metadata ? JSON.stringify(options.metadata) : '{}',
        embeddingStr,
      ]
    );

    if (status === 'FAILED' && errorCategory) {
      await this.updatePatternForFailure(errorCategory, options?.taskDescription);
    }

    if (status === 'COMPLETED' && options?.solutionApplied) {
      await this.updatePatternForSuccess(
        options.taskType || ERROR_CATEGORIES.UNKNOWN,
        options.solutionApplied,
        options.taskDescription
      );
    }

    logger.info(`[Learning] Recorded outcome: ${status} for task ${taskId}`);
    return id;
  }

  private categorizeError(errorMessage: string): string {
    const lower = errorMessage.toLowerCase();

    if (/typescript|type error|cannot find type|ts\d+/.test(lower))
      return ERROR_CATEGORIES.TYPESCRIPT;
    if (/docker|container|dockerfile|docker-compose/.test(lower)) return ERROR_CATEGORIES.DOCKER;
    if (/postgres|postgresql|sql|database|table.*not found|connection.*refused/.test(lower))
      return ERROR_CATEGORIES.DATABASE;
    if (/network|timeout|connection|econnrefused|enotfound|socket/.test(lower))
      return ERROR_CATEGORIES.NETWORK;
    if (/permission|denied|eacces|eperm|unauthorized/.test(lower))
      return ERROR_CATEGORIES.PERMISSION;
    if (/config|configuration|env|environment/.test(lower)) return ERROR_CATEGORIES.CONFIGURATION;
    if (/dependency|package|npm|yarn|pnpm|cargo|import.*failed|cannot find module/.test(lower))
      return ERROR_CATEGORIES.DEPENDENCY;
    if (/api|endpoint|rest|http.*error|404|500|502|503/.test(lower)) return ERROR_CATEGORIES.API;
    if (/build|compile|babel|esbuild|webpack|rollup/.test(lower)) return ERROR_CATEGORIES.BUILD;
    if (/test|jest|vitest|mocha|assertion|expect/.test(lower)) return ERROR_CATEGORIES.TEST;
    if (/deploy|kubernetes|k8s|helm|terraform/.test(lower)) return ERROR_CATEGORIES.DEPLOYMENT;

    return ERROR_CATEGORIES.UNKNOWN;
  }

  private async updatePatternForFailure(category: string, context?: string): Promise<void> {
    const existing = await this.db.query<TaskPattern>(
      `SELECT * FROM ${DATABASE_TABLES.TASK_PATTERNS} 
       WHERE pattern_category = $1 AND pattern_type = 'failure' 
       AND (project_id IS NULL)
       ORDER BY last_seen_at DESC LIMIT 1`,
      [category]
    );

    if (existing.rows.length > 0 && existing.rows[0]) {
      await this.db.query(
        `UPDATE ${DATABASE_TABLES.TASK_PATTERNS} 
         SET occurrence_count = occurrence_count + 1,
             last_seen_at = NOW(),
             pattern_context = COALESCE(pattern_context, $2)
         WHERE id = $1`,
        [existing.rows[0].id, context]
      );
    } else {
      await this.createPattern({
        patternType: 'failure',
        patternCategory: category,
        patternContent: `Failure pattern for ${category}`,
        patternContext: context,
      });
    }
  }

  private async updatePatternForSuccess(
    category: string,
    solution: string,
    context?: string
  ): Promise<void> {
    const existing = await this.db.query<TaskPattern>(
      `SELECT * FROM ${DATABASE_TABLES.TASK_PATTERNS} 
       WHERE pattern_content ILIKE $1 AND pattern_type = 'success'
       AND (project_id IS NULL)
       ORDER BY last_seen_at DESC LIMIT 1`,
      [`%${solution.substring(0, 100)}%`]
    );

    if (existing.rows.length > 0 && existing.rows[0]) {
      await this.db.query(
        `UPDATE ${DATABASE_TABLES.TASK_PATTERNS} 
         SET occurrence_count = occurrence_count + 1,
             last_seen_at = NOW(),
             success_rate = LEAST(1.0, success_rate + 0.05)
         WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await this.createPattern({
        patternType: 'success',
        patternCategory: category,
        patternContent: solution,
        patternContext: context,
        successRate: 0.7,
      });
    }
  }

  async createPattern(input: {
    patternType: 'success' | 'failure' | 'workaround';
    patternCategory: string;
    patternContent: string;
    patternContext?: string;
    projectId?: string;
    successRate?: number;
  }): Promise<string> {
    const id = crypto.randomUUID();

    let embeddingVector: number[] | null = null;
    if (this.embedding) {
      try {
        embeddingVector = await this.embedding.embed(input.patternContent);
      } catch (error) {
        logger.warn('Failed to generate embedding for pattern:', error);
      }
    }

    const embeddingStr = embeddingVector ? `[${embeddingVector.join(',')}]` : null;

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.TASK_PATTERNS} 
       (id, project_id, pattern_type, pattern_category, pattern_content, 
        pattern_context, success_rate, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        id,
        input.projectId ?? null,
        input.patternType,
        input.patternCategory,
        input.patternContent,
        input.patternContext ?? null,
        input.successRate ?? 0.5,
        embeddingStr,
      ]
    );

    return id;
  }

  async suggestImprovements(projectId?: string, limit: number = 5): Promise<FailureImprovement[]> {
    const params: unknown[] = [];
    if (projectId) {
      params.push(projectId);
    }
    params.push(limit);

    const result = await this.db.query<{
      error_category: string;
      failure_count: number;
      avg_execution_time_ms: number;
      suggested_improvement: string;
      confidence_score: number;
      related_pattern_id: string | null;
      related_memory_id: string | null;
    }>(`SELECT * FROM suggest_improvements_from_failures($1, $2)`, params);

    return result.rows.map(row => ({
      errorCategory: row.error_category,
      failureCount: Number(row.failure_count),
      avgExecutionTimeMs: Number(row.avg_execution_time_ms) || undefined,
      suggestedImprovement: row.suggested_improvement,
      confidenceScore: Number(row.confidence_score),
      relatedPatternId: row.related_pattern_id || undefined,
      relatedMemoryId: row.related_memory_id || undefined,
    }));
  }

  async findSimilarSolutions(
    problemDescription: string,
    projectId?: string,
    limit: number = 5
  ): Promise<SimilarSolution[]> {
    if (!this.embedding) {
      logger.warn('Embedding provider not configured, cannot find similar solutions');
      return [];
    }

    const embedding = await this.embedding.embed(problemDescription);
    const embeddingStr = `[${embedding.join(',')}]`;
    const params: unknown[] = [embeddingStr, limit];
    if (projectId) {
      params.push(projectId);
    }

    const result = await this.db.query<{
      outcome_id: string;
      task_description: string;
      solution_applied: string;
      solution_worked: boolean;
      similarity_score: number;
      execution_time_ms: number;
      attempts: number;
    }>(`SELECT * FROM find_similar_solutions($1, $2::vector, $3, $4)`, [
      problemDescription,
      embeddingStr,
      projectId ?? null,
      limit,
    ]);

    return result.rows.map(row => ({
      outcomeId: row.outcome_id,
      taskDescription: row.task_description,
      solutionApplied: row.solution_applied,
      solutionWorked: row.solution_worked,
      similarityScore: Number(row.similarity_score),
      executionTimeMs: row.execution_time_ms || undefined,
      attempts: row.attempts,
    }));
  }

  async getFailureStats(days: number = 7): Promise<{
    totalFailures: number;
    byCategory: Record<string, number>;
    byTaskType: Record<string, number>;
    avgRecoveryTimeMs: number;
  }> {
    const result = await this.db.query<{
      total_failures: string;
      by_category: Record<string, number>;
      by_task_type: Record<string, number>;
      avg_recovery_time: string;
    }>(
      `WITH stats AS (
        SELECT 
          COUNT(*) FILTER (WHERE status = 'FAILED') as total_failures,
          (SELECT jsonb_object_agg(error_category, cnt) FROM (
            SELECT error_category, COUNT(*) as cnt 
            FROM ${DATABASE_TABLES.TASK_OUTCOMES}
            WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL AND error_category IS NOT NULL
            GROUP BY error_category
          ) sub) as by_category,
          (SELECT jsonb_object_agg(task_type, cnt) FROM (
            SELECT task_type, COUNT(*) as cnt 
            FROM ${DATABASE_TABLES.TASK_OUTCOMES}
            WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL AND task_type IS NOT NULL
            GROUP BY task_type
          ) sub) as by_task_type,
          AVG(execution_time_ms) FILTER (WHERE status = 'FAILED') as avg_recovery_time
        FROM ${DATABASE_TABLES.TASK_OUTCOMES}
        WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
      )
      SELECT * FROM stats`,
      [days]
    );

    const row = result.rows[0];
    return {
      totalFailures: parseInt(row?.total_failures || '0', 10),
      byCategory: (row?.by_category || {}) as Record<string, number>,
      byTaskType: (row?.by_task_type || {}) as Record<string, number>,
      avgRecoveryTimeMs: parseFloat(row?.avg_recovery_time || '0'),
    };
  }

  async getSuccessPatterns(limit: number = 10): Promise<TaskPattern[]> {
    const result = await this.db.query<TaskPattern>(
      `SELECT id, project_id as "projectId", pattern_type as "patternType", 
              pattern_category as "patternCategory", pattern_content as "patternContent",
              pattern_context as "patternContext", success_rate as "successRate",
              occurrence_count as "occurrenceCount", 
              first_seen_at as "firstSeenAt", last_seen_at as "lastSeenAt",
              last_confirmed_at as "lastConfirmedAt", metadata, is_active as "isActive"
       FROM ${DATABASE_TABLES.TASK_PATTERNS}
       WHERE pattern_type = 'success' AND is_active = TRUE
       ORDER BY success_rate DESC, occurrence_count DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  async getPatternsByCategory(
    category: string,
    minSuccessRate: number = 0.7,
    limit: number = 10
  ): Promise<TaskPattern[]> {
    const result = await this.db.query<TaskPattern>(
      `SELECT id, project_id as "projectId", pattern_type as "patternType", 
              pattern_category as "patternCategory", pattern_content as "patternContent",
              pattern_context as "patternContext", success_rate as "successRate",
              occurrence_count as "occurrenceCount", 
              first_seen_at as "firstSeenAt", last_seen_at as "lastSeenAt",
              last_confirmed_at as "lastConfirmedAt", metadata, is_active as "isActive"
       FROM ${DATABASE_TABLES.TASK_PATTERNS}
       WHERE pattern_type = 'success' 
         AND is_active = TRUE
         AND pattern_category = $1
         AND success_rate >= $2
       ORDER BY success_rate DESC, occurrence_count DESC
       LIMIT $3`,
      [category, minSuccessRate, limit]
    );

    return result.rows;
  }

  async createInsight(input: {
    projectId?: string;
    insightType: 'improvement' | 'warning' | 'pattern' | 'recommendation';
    title: string;
    content: string;
    evidence?: unknown[];
    priority?: number;
    confidence?: number;
    expiresAt?: Date;
  }): Promise<string> {
    const id = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.LEARNING_INSIGHTS} 
       (id, project_id, insight_type, title, content, evidence, priority, confidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        id,
        input.projectId ?? null,
        input.insightType,
        input.title,
        input.content,
        JSON.stringify(input.evidence ?? []),
        input.priority ?? 5,
        input.confidence ?? 0.5,
      ]
    );

    return id;
  }

  async markInsightApplied(insightId: string): Promise<void> {
    await this.db.query(
      `UPDATE ${DATABASE_TABLES.LEARNING_INSIGHTS} 
       SET is_applied = TRUE, applied_at = NOW()
       WHERE id = $1`,
      [insightId]
    );
  }

  async getRecentInsights(
    projectId?: string,
    limit: number = 10,
    includeApplied: boolean = false
  ): Promise<LearningInsight[]> {
    const result = await this.db.query<{
      id: string;
      project_id: string | null;
      insight_type: string;
      title: string;
      content: string;
      evidence: unknown[];
      priority: number;
      confidence: number;
      is_applied: boolean;
      applied_at: Date | null;
      expires_at: Date | null;
      created_at: Date;
    }>(
      `SELECT * FROM ${DATABASE_TABLES.LEARNING_INSIGHTS}
       WHERE ($1::UUID IS NULL OR project_id = $1)
         AND ($2::BOOLEAN OR is_applied = FALSE)
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY priority DESC, created_at DESC
       LIMIT $3`,
      [projectId, includeApplied, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      projectId: row.project_id || undefined,
      insightType: row.insight_type as LearningInsight['insightType'],
      title: row.title,
      content: row.content,
      evidence: row.evidence,
      priority: row.priority,
      confidence: row.confidence,
      isApplied: row.is_applied,
      appliedAt: row.applied_at || undefined,
      expiresAt: row.expires_at || undefined,
      createdAt: row.created_at,
    }));
  }

  async autoGenerateInsights(): Promise<string[]> {
    const insights: string[] = [];

    const failureStats = await this.getFailureStats(7);

    if (failureStats.totalFailures > 10) {
      const sortedCategories = Object.entries(failureStats.byCategory).sort(
        ([, a], [, b]) => b - a
      );

      if (sortedCategories.length > 0 && sortedCategories[0]) {
        const [topCategory, count] = sortedCategories[0]!;
        const insight = await this.createInsight({
          insightType: 'warning',
          title: `High failure rate in ${topCategory}`,
          content: `${count} failures in ${topCategory} category over the last 7 days. Consider investigating this pattern.`,
          priority: Math.min(10, Math.floor(count / 5) * 2 + 5),
          confidence: Math.min(0.9, 0.5 + count * 0.05),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        insights.push(insight);
      }
    }

    const successPatterns = await this.getSuccessPatterns(5);
    if (successPatterns.length > 0 && failureStats.totalFailures > 5) {
      const avgRate =
        successPatterns.reduce((sum, p) => sum + p.successRate, 0) / successPatterns.length;
      if (avgRate > 0.7) {
        const insight = await this.createInsight({
          insightType: 'recommendation',
          title: 'Apply proven patterns to reduce failures',
          content: `Found ${successPatterns.length} patterns with >${Math.round(avgRate * 100)}% success rate. Consider applying these to recent failures.`,
          priority: 6,
          confidence: 0.7,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        insights.push(insight);
      }
    }

    return insights;
  }
}
