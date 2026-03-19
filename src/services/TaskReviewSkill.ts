// TaskReviewSkill - High-level QC after AI task completion
// Combines: Skill + Memory + PostgreSQL

import { logger } from '../utils/logger.js';

export interface TaskReviewInput {
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  result: unknown;
  error?: string;
  duration: number;
  filesChanged?: string[];
  testsRun?: boolean;
  testsPassed?: boolean;
}

export interface TaskReviewOutput {
  passed: boolean;
  score: number;
  issues: ReviewIssue[];
  suggestions: string[];
  learnedPatterns: string[];
  qualityLevel: 'excellent' | 'good' | 'acceptable' | 'needs_work';
}

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  location?: string;
  fixSuggestion?: string;
}

export class TaskReviewSkill {
  private dbClient: unknown = null;

  setDatabaseClient(client: unknown): void {
    this.dbClient = client;
  }

  async review(input: TaskReviewInput): Promise<TaskReviewOutput> {
    logger.info(`[TaskReview] Starting review for task: ${input.taskId}`);

    const issues: ReviewIssue[] = [];
    const suggestions: string[] = [];
    const learnedPatterns: string[] = [];
    let score = 100;

    if (input.error) {
      issues.push({
        severity: 'critical',
        category: 'execution',
        message: `Task failed with error: ${input.error}`,
      });
      score -= 40;
    }

    if (!input.result && !input.error) {
      issues.push({
        severity: 'warning',
        category: 'result',
        message: 'No result returned from task',
      });
      score -= 20;
    }

    if (input.duration > 300000) {
      issues.push({
        severity: 'info',
        category: 'performance',
        message: `Task took ${Math.round(input.duration / 1000)}s (> 5min)`,
      });
      score -= 5;
    }

    if (input.testsRun === false) {
      suggestions.push('Consider adding tests for the implemented changes');
      score -= 5;
    } else if (input.testsRun && input.testsPassed === false) {
      issues.push({
        severity: 'critical',
        category: 'testing',
        message: 'Tests failed - code changes may have broken existing functionality',
      });
      score -= 30;
    }

    if (input.filesChanged && input.filesChanged.length > 20) {
      suggestions.push('Consider breaking large changes into smaller PRs');
      score -= 5;
    }

    const qualityLevel = this.calculateQualityLevel(score);

    if (qualityLevel === 'excellent') {
      learnedPatterns.push(`Excellent solution for: ${input.taskTitle}`);
    }

    if (issues.filter(i => i.severity === 'critical').length > 0) {
      const critical = issues.find(i => i.severity === 'critical');
      if (critical) {
        learnedPatterns.push(`Critical issue to avoid: ${critical.message}`);
      }
    }

    const output: TaskReviewOutput = {
      passed: score >= 70 && !input.error,
      score: Math.max(0, score),
      issues,
      suggestions,
      learnedPatterns,
      qualityLevel,
    };

    await this.saveReviewToMemory(input, output);

    logger.info(`[TaskReview] Completed: ${output.qualityLevel} (${score}/100)`);

    return output;
  }

  private calculateQualityLevel(score: number): TaskReviewOutput['qualityLevel'] {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 50) return 'acceptable';
    return 'needs_work';
  }

  private async saveReviewToMemory(
    input: TaskReviewInput,
    output: TaskReviewOutput
  ): Promise<void> {
    if (!this.dbClient) return;

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    };

    const patterns = output.learnedPatterns.map(pattern => ({
      content: pattern,
      task: input.taskTitle,
      quality: output.qualityLevel,
      score: output.score,
      source: 'task_review' as const,
      tags: ['review', output.qualityLevel, ...(output.issues.length > 0 ? ['issues'] : [])],
      context: JSON.stringify({
        taskId: input.taskId,
        duration: input.duration,
        issues: output.issues,
        suggestions: output.suggestions,
      }),
      importance: output.score > 80 ? 5 : output.score > 50 ? 3 : 1,
    }));

    for (const pattern of patterns) {
      await client.query(
        `INSERT INTO memory (id, content, source, tags, metadata, importance, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          crypto.randomUUID(),
          pattern.content,
          pattern.source,
          pattern.tags,
          JSON.stringify({
            task: pattern.task,
            quality: pattern.quality,
            ...JSON.parse(pattern.context),
          }),
          pattern.importance,
        ]
      );
    }

    if (output.issues.length > 0) {
      await client.query(
        `INSERT INTO learning_insights (id, insight_type, content, task_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          crypto.randomUUID(),
          'review_issues',
          JSON.stringify({ issues: output.issues, task: input.taskTitle }),
          input.taskId,
          JSON.stringify({ score: output.score, quality: output.qualityLevel }),
        ]
      );
    }
  }

  async getReviewHistory(taskId?: string, limit = 10): Promise<TaskReviewOutput[]> {
    if (!this.dbClient) return [];

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: { metadata: string }[] }>;
    };

    const sql = taskId
      ? `SELECT metadata FROM memory WHERE source = 'task_review' AND metadata::text LIKE $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT metadata FROM memory WHERE source = 'task_review' ORDER BY created_at DESC LIMIT $1`;

    const params = taskId ? [`%${taskId}%`, limit] : [limit];

    const result = await client.query(sql, params);

    return result.rows
      .map(row => {
        try {
          return JSON.parse(row.metadata) as TaskReviewOutput;
        } catch {
          return null;
        }
      })
      .filter((r): r is TaskReviewOutput => r !== null);
  }

  async getCommonIssues(): Promise<ReviewIssue[]> {
    if (!this.dbClient) return [];

    const client = this.dbClient as {
      query: (sql: string) => Promise<{ rows: { content: string }[] }>;
    };

    const result = await client.query(
      `SELECT content FROM memory 
       WHERE source = 'task_review' 
         AND metadata::text LIKE '%critical%'
       ORDER BY created_at DESC LIMIT 20`
    );

    return result.rows.map(row => ({
      severity: 'warning' as const,
      category: 'common',
      message: row.content,
    }));
  }
}

export const taskReviewSkill = new TaskReviewSkill();
