import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, TASK_STATUS } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { AgentIdentityService } from './AgentIdentityService.js';

export interface QCFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'code' | 'test' | 'documentation' | 'security' | 'other';
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface QCReview {
  id: string;
  originalTaskId: string;
  reviewerId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  codeQualityScore?: number;
  testCoverageScore?: number;
  documentationScore?: number;
  overallScore?: number;
  findings: QCFinding[];
  summary?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface QCReviewRow {
  id: string;
  original_task_id: string;
  reviewer_id: string | null;
  status: string;
  code_quality_score: number | null;
  test_coverage_score: number | null;
  documentation_score: number | null;
  overall_score: number | null;
  findings: QCFinding[];
  summary: string | null;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface QCReviewResult {
  reviewId: string;
  summary: string;
  findings: QCFinding[];
  scores: {
    codeQuality: number;
    testCoverage: number;
    documentation: number;
    overall: number;
  };
  suggestedTasks: { title: string; description: string; priority: number }[];
}

export class QCService {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async createQCReview(originalTaskId: string, priority: number = 5): Promise<string> {
    const result = await this.db.query<{ id: string }>(`SELECT create_qc_review($1, $2) as id`, [
      originalTaskId,
      priority,
    ]);

    logger.info(`[QC] Created QC review for task ${originalTaskId}: ${result.rows[0]?.id}`);
    return result.rows[0]?.id || '';
  }

  async shouldTriggerQC(
    taskId: string,
    priority: number,
    modifiedFiles?: string[]
  ): Promise<boolean> {
    if (priority >= 8) return true;
    if (modifiedFiles && modifiedFiles.some(f => f.endsWith('.ts') || f.endsWith('.js')))
      return true;

    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM qc_reviews 
       WHERE original_task_id = $1 AND status != 'completed'`,
      [taskId]
    );

    return parseInt(result.rows[0]?.count || '0') === 0;
  }

  async getQCReview(reviewId: string): Promise<QCReview | null> {
    const result = await this.db.query<QCReviewRow>(
      `SELECT id, original_task_id, reviewer_id, status,
              code_quality_score, test_coverage_score, documentation_score, overall_score,
              findings, summary, started_at, completed_at
       FROM qc_reviews WHERE id = $1`,
      [reviewId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    return {
      id: row.id,
      originalTaskId: row.original_task_id,
      reviewerId: row.reviewer_id ?? undefined,
      status: row.status as QCReview['status'],
      codeQualityScore: row.code_quality_score ?? undefined,
      testCoverageScore: row.test_coverage_score ?? undefined,
      documentationScore: row.documentation_score ?? undefined,
      overallScore: row.overall_score ?? undefined,
      findings: row.findings || [],
      summary: row.summary ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    };
  }

  async startReview(reviewId: string): Promise<void> {
    const agentId = (await AgentIdentityService.getResolvedIdentity()).id;

    await this.db.query(
      `UPDATE qc_reviews SET status = 'in_progress', reviewer_id = $1, started_at = NOW() WHERE id = $2`,
      [agentId, reviewId]
    );

    logger.info(`[QC] Started review ${reviewId} by ${agentId}`);
  }

  async completeReview(result: QCReviewResult): Promise<void> {
    await this.db.query(
      `UPDATE qc_reviews 
       SET status = 'completed', 
           code_quality_score = $1,
           test_coverage_score = $2,
           documentation_score = $3,
           overall_score = $4,
           findings = $5,
           summary = $6,
           completed_at = NOW()
       WHERE id = $7`,
      [
        result.scores.codeQuality,
        result.scores.testCoverage,
        result.scores.documentation,
        result.scores.overall,
        JSON.stringify(result.findings),
        result.summary,
        result.reviewId,
      ]
    );

    for (const task of result.suggestedTasks) {
      await this.db.query(
        `INSERT INTO ${DATABASE_TABLES.TASKS} 
         (id, title, description, status, priority, type, category)
         VALUES ($1, $2, $3, $4, $5, 'qc-fix', 'quality')`,
        [crypto.randomUUID(), task.title, task.description, TASK_STATUS.PENDING, task.priority]
      );
    }

    await this.db.query(
      `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1 WHERE id = (
        SELECT original_task_id FROM qc_reviews WHERE id = $2
      )`,
      [TASK_STATUS.PENDING, result.reviewId]
    );

    logger.info(`[QC] Completed review ${result.reviewId} with ${result.findings.length} findings`);
  }

  async getPendingReviews(limit: number = 10): Promise<QCReview[]> {
    const result = await this.db.query<QCReviewRow>(
      `SELECT id, original_task_id, reviewer_id, status,
              code_quality_score, test_coverage_score, documentation_score, overall_score,
              findings, summary, started_at, completed_at
       FROM qc_reviews 
       WHERE status IN ('pending', 'in_progress')
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      originalTaskId: row.original_task_id,
      reviewerId: row.reviewer_id ?? undefined,
      status: row.status as QCReview['status'],
      codeQualityScore: row.code_quality_score ?? undefined,
      testCoverageScore: row.test_coverage_score ?? undefined,
      documentationScore: row.documentation_score ?? undefined,
      overallScore: row.overall_score ?? undefined,
      findings: row.findings || [],
      summary: row.summary ?? undefined,
    }));
  }

  async getReviewerStats(reviewerId: string): Promise<{
    reviewsCompleted: number;
    avgScore: number;
    avgCodeQuality: number;
    avgTestCoverage: number;
    avgDocumentation: number;
  }> {
    const result = await this.db.query<{
      reviews_completed: string;
      avg_score: string;
      avg_code_quality: string;
      avg_test_coverage: string;
      avg_documentation: string;
    }>(
      `SELECT 
         COUNT(*) as reviews_completed,
         AVG(overall_score::float) as avg_score,
         AVG(code_quality_score::float) as avg_code_quality,
         AVG(test_coverage_score::float) as avg_test_coverage,
         AVG(documentation_score::float) as avg_documentation
       FROM qc_reviews 
       WHERE reviewer_id = $1 AND status = 'completed'`,
      [reviewerId]
    );

    const row = result.rows[0];
    return {
      reviewsCompleted: parseInt(row?.reviews_completed || '0'),
      avgScore: parseFloat(row?.avg_score || '0'),
      avgCodeQuality: parseFloat(row?.avg_code_quality || '0'),
      avgTestCoverage: parseFloat(row?.avg_test_coverage || '0'),
      avgDocumentation: parseFloat(row?.avg_documentation || '0'),
    };
  }

  async creditReviewer(reviewerId: string, reviewId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO memory (content, tags, source, importance, metadata)
       VALUES ($1, ARRAY['qc', 'reviewer-credit'], 'qc-system', $2, $3)`,
      [
        `[REVIEWER]
reviewer_id: ${reviewerId}
timestamp: ${new Date().toISOString()}
review_id: ${reviewId}
action: review_completed`,
        3,
        JSON.stringify({ type: 'reviewer-credit', reviewerId, reviewId }),
      ]
    );
  }
}
