import { DatabaseClient } from '../db/DatabaseClient.js';

export interface FailurePattern {
  id: string;
  taskType?: string;
  taskCategory?: string;
  errorPattern: string;
  occurrenceCount: number;
  successRate: number;
  avgRetryAttempts: number;
  commonFix?: string;
  lastSeen: Date;
}

export interface FailureAnalysis {
  taskId: string;
  taskTitle: string;
  error: string;
  errorCategory: string;
  rootCauses: string[];
  suggestedFixes: string[];
  retryStrategy?: {
    maxRetries: number;
    backoffMultiplier: number;
    timeoutSeconds: number;
  };
  isMissionImpossible: boolean;
  missionImpossibleReasons?: string[];
}

export interface RetryStrategy {
  taskType: string;
  recommendedRetries: number;
  recommendedBackoff: number;
  recommendedTimeout: number;
  successRate: number;
}

export class FailureAnalysisService {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async analyzeFailure(taskId: string): Promise<FailureAnalysis | null> {
    const result = await this.db.query<{
      id: string;
      title: string;
      error: string;
      task_type: string;
      category: string;
      retry_count: number;
    }>(
      `SELECT id, title, error, type as task_type, category, retry_count
       FROM tasks WHERE id = $1 AND status = 'FAILED'`,
      [taskId]
    );

    if (result.rows.length === 0) return null;

    const task = result.rows[0]!;
    const errorCategory = this.categorizeError(task.error || '');
    const patterns = await this.findMatchingPatterns(
      task.task_type,
      task.category,
      task.error || ''
    );
    const rootCauses = await this.identifyRootCauses(task.task_type, task.category, errorCategory);
    const suggestedFixes = this.generateFixes(errorCategory, patterns, rootCauses);
    const retryStrategy = await this.getRetryStrategy(task.task_type, task.category);
    const isMissionImpossible = await this.checkMissionImpossible(task.task_type, task.error || '');

    return {
      taskId: task.id,
      taskTitle: task.title,
      error: task.error || 'Unknown error',
      errorCategory,
      rootCauses,
      suggestedFixes,
      retryStrategy,
      isMissionImpossible,
      missionImpossibleReasons: isMissionImpossible ? rootCauses : undefined,
    };
  }

  categorizeError(error: string): string {
    const lowerError = error.toLowerCase();

    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return 'timeout';
    }
    if (
      lowerError.includes('connection') ||
      lowerError.includes('fetch') ||
      lowerError.includes('network')
    ) {
      return 'network';
    }
    if (
      lowerError.includes('permission') ||
      lowerError.includes('access denied') ||
      lowerError.includes('unauthorized')
    ) {
      return 'permission';
    }
    if (
      lowerError.includes('not found') ||
      lowerError.includes('does not exist') ||
      lowerError.includes('enoent')
    ) {
      return 'not_found';
    }
    if (
      lowerError.includes('syntax') ||
      lowerError.includes('parse') ||
      lowerError.includes('invalid')
    ) {
      return 'validation';
    }
    if (
      lowerError.includes('memory') ||
      lowerError.includes('heap') ||
      lowerError.includes('out of memory')
    ) {
      return 'resource';
    }
    if (
      lowerError.includes('conflict') ||
      lowerError.includes('duplicate') ||
      lowerError.includes('unique')
    ) {
      return 'conflict';
    }

    return 'unknown';
  }

  async findMatchingPatterns(
    taskType?: string,
    taskCategory?: string,
    error?: string
  ): Promise<FailurePattern[]> {
    const errorCategory = this.categorizeError(error || '');

    const result = await this.db.query<FailurePattern>(
      `SELECT 
         id,
         task_type as "taskType",
         task_category as "taskCategory", 
         error_pattern as "errorPattern",
         occurrence_count as "occurrenceCount",
         success_rate as "successRate",
         avg_retry_attempts as "avgRetryAttempts",
         common_fix as "commonFix",
         last_seen as "lastSeen"
       FROM failure_patterns
       WHERE (task_type = $1 OR task_type IS NULL)
         AND (task_category = $2 OR task_category IS NULL)
         AND error_category = $3
       ORDER BY occurrence_count DESC
       LIMIT 10`,
      [taskType || null, taskCategory || null, errorCategory]
    );

    return result.rows;
  }

  async identifyRootCauses(
    taskType?: string,
    taskCategory?: string,
    errorCategory?: string
  ): Promise<string[]> {
    const causes: string[] = [];

    const result = await this.db.query<{ root_cause: string; frequency: string }>(
      `SELECT root_cause, COUNT(*) as frequency
       FROM failure_root_causes
       WHERE (task_type = $1 OR task_type IS NULL)
         AND (error_category = $2 OR $2 = 'unknown')
       GROUP BY root_cause
       ORDER BY frequency DESC
       LIMIT 5`,
      [taskType || null, errorCategory || 'unknown']
    );

    for (const row of result.rows) {
      causes.push(`${row.root_cause} (${row.frequency}x)`);
    }

    if (causes.length === 0) {
      causes.push('Unknown root cause - manual investigation required');
    }

    return causes;
  }

  generateFixes(errorCategory: string, patterns: FailurePattern[], _rootCauses: string[]): string[] {
    const fixes: string[] = [];

    const categoryFixes: Record<string, string[]> = {
      timeout: [
        'Increase timeout in task configuration',
        'Break task into smaller subtasks',
        'Add retry with exponential backoff',
      ],
      network: [
        'Check network connectivity',
        'Retry with exponential backoff and jitter',
        'Verify DNS settings and service endpoints',
        'Handle HTTP 5xx errors with conditional retries',
      ],
      permission: [
        'Check file/directory permissions',
        'Verify API key access',
        'Review authentication settings',
      ],
      not_found: [
        'Verify resource exists before running task',
        'Check for typos in identifiers',
        'Ensure dependencies are installed',
      ],
      validation: ['Fix syntax errors', 'Validate input format', 'Review API documentation'],
      resource: ['Reduce batch size', 'Optimize memory usage', 'Consider using swap space'],
      conflict: [
        'Check for race conditions',
        'Use optimistic locking',
        'Retry after conflict resolves',
      ],
    };

    fixes.push(...(categoryFixes[errorCategory] || ['Review error message for specific guidance']));

    for (const pattern of patterns.slice(0, 2)) {
      if (pattern.commonFix) {
        fixes.push(`Historical fix: ${pattern.commonFix}`);
      }
    }

    return [...new Set(fixes)].slice(0, 5);
  }

  async getRetryStrategy(
    taskType?: string,
    taskCategory?: string
  ): Promise<
    | {
        maxRetries: number;
        backoffMultiplier: number;
        timeoutSeconds: number;
      }
    | undefined
  > {
    const result = await this.db.query<RetryStrategy>(
      `SELECT 
         task_type as "taskType",
         recommended_retries as "recommendedRetries",
         recommended_backoff as "recommendedBackoff",
         recommended_timeout as "recommendedTimeout",
         success_rate as "successRate"
       FROM retry_strategies
       WHERE task_type = $1 OR task_category = $2
       ORDER BY success_rate DESC
       LIMIT 1`,
      [taskType || null, taskCategory || null]
    );

    if (result.rows.length === 0) {
      return undefined;
    }

    const strategy = result.rows[0]!;
    return {
      maxRetries: strategy.recommendedRetries,
      backoffMultiplier: strategy.recommendedBackoff,
      timeoutSeconds: strategy.recommendedTimeout,
    };
  }

  async learnFromRetry(taskId: string, success: boolean): Promise<void> {
    const result = await this.db.query<{
      task_type: string;
      category: string;
      error: string;
      retry_count: number;
    }>(
      `SELECT type as task_type, category, error, retry_count
       FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) return;

    const task = result.rows[0]!;
    const errorCategory = this.categorizeError(task.error || '');

    await this.db.query(
      `INSERT INTO retry_learning (task_type, task_category, error_category, attempt_number, success)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [task.task_type, task.category, errorCategory, task.retry_count, success]
    );

    if (success) {
      await this.updateRetryStrategies();
    }
  }

  async checkMissionImpossible(taskType: string, error: string): Promise<boolean> {
    const result = await this.db.query<{ failure_count: string }>(
      `SELECT COUNT(*) as failure_count
       FROM tasks
       WHERE type = $1 
         AND status = 'FAILED'
         AND retry_count >= 3
       GROUP BY id
       HAVING COUNT(*) >= 10`,
      [taskType]
    );

    return result.rows.length > 0 && error.includes('impossible');
  }

  private async updateRetryStrategies(): Promise<void> {
    await this.db.query(`
      INSERT INTO retry_strategies (task_type, task_category, recommended_retries, recommended_backoff, recommended_timeout, success_rate)
      SELECT 
        task_type,
        task_category,
        3,
        2.0,
        300,
        CASE 
          WHEN COUNT(*) FILTER (WHERE success) > COUNT(*) FILTER (WHERE NOT success) THEN 0.7
          ELSE 0.3
        END as success_rate
      FROM retry_learning
      WHERE task_type IS NOT NULL
      GROUP BY task_type, task_category
      ON CONFLICT (task_type) DO UPDATE SET
        success_rate = EXCLUDED.success_rate,
        recommended_retries = CASE 
          WHEN EXCLUDED.success_rate > 0.6 THEN 3 
          ELSE 1 
        END
    `);
  }

  async getFailureStats(): Promise<{
    totalFailures: number;
    byCategory: Record<string, number>;
    topPatterns: FailurePattern[];
    missionImpossibleTasks: number;
  }> {
    const totalResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED'`
    );

    const categoryResult = await this.db.query<{ category: string; count: string }>(
      `SELECT category, COUNT(*) as count 
       FROM tasks WHERE status = 'FAILED' 
       GROUP BY category 
       ORDER BY count DESC`
    );

    const patternResult = await this.db.query<FailurePattern>(
      `SELECT * FROM failure_patterns 
       ORDER BY occurrence_count DESC LIMIT 5`
    );

    const missionResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE status = 'FAILED' AND retry_count >= 3`
    );

    return {
      totalFailures: parseInt(totalResult.rows[0]?.count || '0'),
      byCategory: Object.fromEntries(
        categoryResult.rows.map(r => [r.category || 'unknown', parseInt(r.count)])
      ),
      topPatterns: patternResult.rows,
      missionImpossibleTasks: parseInt(missionResult.rows[0]?.count || '0'),
    };
  }
}
