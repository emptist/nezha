import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';

export interface ReviewResult {
  taskId: string;
  status: 'success' | 'failure' | 'partial';
  score: number;
  issues: ReviewIssue[];
  suggestions: string[];
  reviewedAt: Date;
}

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: string;
  recommendation?: string;
}

export interface ReviewCriteria {
  codeQuality: boolean;
  testCoverage: boolean;
  documentation: boolean;
  security: boolean;
  performance: boolean;
}

export class ResultReviewer {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async reviewTaskResult(
    taskId: string,
    result: {
      status: string;
      output?: string;
      changes?: string[];
      testsPassed?: boolean;
      lintPassed?: boolean;
    },
    criteria?: Partial<ReviewCriteria>
  ): Promise<ReviewResult> {
    const issues: ReviewIssue[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const enabledCriteria: ReviewCriteria = {
      codeQuality: criteria?.codeQuality ?? true,
      testCoverage: criteria?.testCoverage ?? true,
      documentation: criteria?.documentation ?? false,
      security: criteria?.security ?? true,
      performance: criteria?.performance ?? false,
    };

    if (result.status !== 'COMPLETED') {
      issues.push({
        severity: 'critical',
        description: `Task did not complete successfully: ${result.status}`,
      });
      score -= 30;
    }

    if (enabledCriteria.codeQuality && result.lintPassed === false) {
      issues.push({
        severity: 'high',
        description: 'Linting failed',
        recommendation: 'Fix linting errors before marking task complete',
      });
      score -= 15;
    }

    if (enabledCriteria.testCoverage && result.testsPassed === false) {
      issues.push({
        severity: 'high',
        description: 'Tests failed',
        recommendation: 'Ensure all tests pass before marking task complete',
      });
      score -= 20;
    }

    if (!result.output || result.output.trim().length === 0) {
      issues.push({
        severity: 'medium',
        description: 'No output provided',
        recommendation: 'Provide meaningful output describing what was done',
      });
      score -= 10;
    }

    if (!result.changes || result.changes.length === 0) {
      suggestions.push('Consider documenting what changes were made');
    }

    score = Math.max(0, Math.min(100, score));

    const reviewResult: ReviewResult = {
      taskId,
      status: score >= 80 ? 'success' : score >= 50 ? 'partial' : 'failure',
      score,
      issues,
      suggestions,
      reviewedAt: new Date(),
    };

    await this.saveReview(taskId, reviewResult);

    logger.info(`[ResultReviewer] Reviewed task ${taskId}: score=${score}, status=${reviewResult.status}`);

    return reviewResult;
  }

  private async saveReview(taskId: string, review: ReviewResult): Promise<void> {
    await this.db.query(
      `INSERT INTO task_reviews (task_id, score, status, issues, suggestions, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (task_id) DO UPDATE SET
         score = EXCLUDED.score,
         status = EXCLUDED.status,
         issues = EXCLUDED.issues,
         suggestions = EXCLUDED.suggestions,
         reviewed_at = EXCLUDED.reviewed_at`,
      [
        taskId,
        review.score,
        review.status,
        JSON.stringify(review.issues),
        JSON.stringify(review.suggestions),
        review.reviewedAt,
      ]
    );
  }

  async getReviewHistory(taskId: string): Promise<ReviewResult[]> {
    const result = await this.db.query<{
      task_id: string;
      score: number;
      status: string;
      issues: ReviewIssue[];
      suggestions: string[];
      reviewed_at: Date;
    }>(
      `SELECT task_id, score, status, issues, suggestions, reviewed_at
       FROM task_reviews
       WHERE task_id = $1
       ORDER BY reviewed_at DESC`,
      [taskId]
    );

    return result.rows.map(row => ({
      taskId: row.task_id,
      score: row.score,
      status: row.status as 'success' | 'failure' | 'partial',
      issues: row.issues,
      suggestions: row.suggestions,
      reviewedAt: row.reviewed_at,
    }));
  }

  async getAverageScore(days: number = 7): Promise<number> {
    const result = await this.db.query<{ avg_score: string }>(
      `SELECT AVG(score)::text as avg_score
       FROM task_reviews
       WHERE reviewed_at > NOW() - INTERVAL '${days} days'`
    );

    return parseFloat(result.rows[0]?.avg_score || '0');
  }

  async getReviewStats(): Promise<{
    totalReviews: number;
    averageScore: number;
    successRate: number;
    commonIssues: { description: string; count: number }[];
  }> {
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM task_reviews`
    );
    const totalReviews = parseInt(countResult.rows[0]?.count || '0', 10);

    const avgResult = await this.db.query<{ avg: string }>(
      `SELECT AVG(score)::text as avg FROM task_reviews`
    );
    const averageScore = parseFloat(avgResult.rows[0]?.avg || '0');

    const successResult = await this.db.query<{ rate: string }>(
      `SELECT (COUNT(*) FILTER (WHERE status = 'success')::float / NULLIF(COUNT(*), 0) * 100)::text as rate
       FROM task_reviews`
    );
    const successRate = parseFloat(successResult.rows[0]?.rate || '0');

    const issuesResult = await this.db.query<{ description: string; count: string }>(
      `SELECT issue->>'description' as description, COUNT(*)::text as count
       FROM task_reviews, jsonb_array_elements(issues::jsonb) as issue
       GROUP BY issue->>'description'
       ORDER BY COUNT(*) DESC
       LIMIT 5`
    );
    const commonIssues = issuesResult.rows.map(row => ({
      description: row.description,
      count: parseInt(row.count, 10),
    }));

    return {
      totalReviews,
      averageScore,
      successRate,
      commonIssues,
    };
  }
}
