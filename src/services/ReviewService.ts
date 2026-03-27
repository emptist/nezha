import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES } from '../config/constants.js';
import { AgentIdentityService } from './AgentIdentityService.js';
import { logger } from '../utils/logger.js';

export interface ReviewFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  message: string;
  suggestion?: string;
  file?: string;
  line?: number;
}

export interface ActionItem {
  id: string;
  description: string;
  status: 'pending' | 'completed';
  created_at: Date;
  completed_at?: Date;
  completed_by?: string;
}

export interface Review {
  id: string;
  reviewType: 'code' | 'design' | 'qc' | 'peer' | 'task' | 'security' | 'other';
  status: 'pending' | 'in_progress' | 'completed' | 'follow_up' | 'closed';
  currentState: string;
  targetId?: string;
  targetType?: string;
  title?: string;
  description?: string;
  reviewerId?: string;
  findings: ReviewFinding[];
  actionItems: ActionItem[];
  followUpDue?: Date;
  followUpStatus?: 'pending' | 'completed' | 'overdue';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export class ReviewService {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async createReview(
    reviewType: Review['reviewType'],
    title: string,
    targetId?: string,
    targetType?: string,
    description?: string
  ): Promise<string> {
    const id = crypto.randomUUID();
    const identity = await AgentIdentityService.getResolvedIdentity();
    const reviewerId = identity.id;

    await this.db.query(
      `INSERT INTO reviews (id, review_type, status, title, target_id, target_type, description, reviewer_id)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7)`,
      [id, reviewType, title, targetId, targetType, description, reviewerId]
    );

    logger.info(`[Review] Created ${reviewType} review: ${id}`);
    return id;
  }

  async createQCReviewFromTask(taskId: string, priority: number = 5): Promise<string> {
    const result = await this.db.query<{ title: string }>(`SELECT title FROM tasks WHERE id = $1`, [
      taskId,
    ]);

    const title = `QC Review: ${result.rows[0]?.title || 'Unknown Task'}`;
    const reviewId = await this.createReview('qc', title, taskId, 'task');

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.TASKS}
       (id, title, description, status, priority, category, depends_on)
       VALUES ($1, $2, $3, 'PENDING', $4, 'quality', $5)`,
      [
        crypto.randomUUID(),
        title,
        `Quality Control review for completed task. Please review for correctness, completeness, and quality.`,
        Math.min(priority + 1, 8),
        taskId,
      ]
    );

    return reviewId;
  }

  async startReview(reviewId: string): Promise<void> {
    const identity = await AgentIdentityService.getResolvedIdentity();
    const reviewerId = identity.id;

    await this.db.query(
      `UPDATE reviews SET status = 'in_progress', reviewer_id = $1, updated_at = NOW() WHERE id = $2`,
      [reviewerId, reviewId]
    );

    logger.info(`[Review] Started review ${reviewId} by ${reviewerId}`);
  }

  async completeReview(
    reviewId: string,
    findings: ReviewFinding[],
    actionItems: { description: string }[] = []
  ): Promise<void> {
    const actionItemsWithId = actionItems.map(item => ({
      id: crypto.randomUUID(),
      description: item.description,
      status: 'pending' as const,
      created_at: new Date(),
    }));

    await this.db.query(
      `UPDATE reviews 
       SET status = CASE WHEN $2::jsonb != '[]'::jsonb THEN 'follow_up' ELSE 'completed' END,
           findings = $2,
           action_items = $3,
           current_state = CASE WHEN $2::jsonb != '[]'::jsonb THEN 'needs_revision' ELSE 'approved' END,
           follow_up_status = CASE WHEN $2::jsonb != '[]'::jsonb THEN 'pending' ELSE NULL END,
           follow_up_due = CASE WHEN $2::jsonb != '[]'::jsonb THEN NOW() + INTERVAL '7 days' ELSE NULL END,
           updated_at = NOW(),
           completed_at = CASE WHEN $2::jsonb = '[]'::jsonb THEN NOW() ELSE NULL END
       WHERE id = $1`,
      [reviewId, JSON.stringify(findings), JSON.stringify(actionItemsWithId)]
    );

    for (const item of actionItemsWithId) {
      await this.db.query(
        `INSERT INTO ${DATABASE_TABLES.TASKS}
         (id, title, description, status, priority, type, category)
         VALUES ($1, $2, $3, 'PENDING', 7, 'qc-fix', 'quality')`,
        [item.id, `Fix: ${item.description}`, item.description]
      );
    }

    await this.notifyReviewComplete(reviewId, findings.length, actionItemsWithId.length);

    logger.info(
      `[Review] Completed review ${reviewId} with ${findings.length} findings, ${actionItemsWithId.length} action items`
    );
  }

  private async notifyReviewComplete(
    reviewId: string,
    findingsCount: number,
    actionItemsCount: number
  ): Promise<void> {
    try {
      const result = await this.db.query<{ target_id: string; title: string; reviewer_id: string }>(
        `SELECT target_id, title, reviewer_id FROM reviews WHERE id = $1`,
        [reviewId]
      );

      if (result.rows.length === 0) return;

      const review = result.rows[0]!;
      if (!review.target_id) return;

      const identity = await AgentIdentityService.getResolvedIdentity();
      const reviewerId = identity.id;

      await this.db.query(
        `INSERT INTO project_communications (id, project_id, from_ai, to_ai, message_type, content, metadata)
         VALUES ($1, $2, $3, $4, 'notification', $5, $6)`,
        [
          crypto.randomUUID(),
          null,
          reviewerId,
          review.reviewer_id,
          `Review completed: ${review.title}`,
          JSON.stringify({
            reviewId,
            findingsCount,
            actionItemsCount,
            message:
              findingsCount > 0
                ? `Found ${findingsCount} issues, created ${actionItemsCount} follow-up tasks`
                : 'All checks passed, no issues found',
          }),
        ]
      );
    } catch (error) {
      logger.warn('[Review] Failed to send notification:', error);
    }
  }

  async getPendingFollowUps(): Promise<Review[]> {
    const result = await this.db.query<{
      id: string;
      review_type: string;
      status: string;
      current_state: string;
      target_id: string;
      target_type: string;
      title: string;
      description: string;
      reviewer_id: string;
      findings: ReviewFinding[];
      action_items: ActionItem[];
      follow_up_due: Date;
      follow_up_status: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM reviews 
       WHERE status = 'follow_up' 
         AND (follow_up_status = 'pending' OR follow_up_status = 'overdue')
       ORDER BY follow_up_due ASC
       LIMIT 20`
    );

    return result.rows.map(row => this.mapRowToReview(row));
  }

  async completeActionItem(reviewId: string, actionItemId: string): Promise<void> {
    const identity = await AgentIdentityService.getResolvedIdentity();
    const agentId = identity.id;

    await this.db.query(
      `UPDATE reviews 
       SET action_items = (
         SELECT jsonb_agg(
           CASE WHEN item->>'id' = $2 
           THEN item || '{"status": "completed", "completed_at": "${new Date().toISOString()}", "completed_by": "${agentId}"}'::jsonb
           ELSE item END
         )
         FROM jsonb_array_elements(action_items) AS item
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [reviewId, actionItemId]
    );

    const remainingPending = await this.db.query<{ pending: string }>(
      `SELECT jsonb_array_length(
         SELECT jsonb_agg(item) FROM jsonb_array_elements(action_items) AS item
         WHERE item->>'status' = 'pending'
       ) as pending FROM reviews WHERE id = $1`,
      [reviewId]
    );

    if (parseInt(remainingPending.rows[0]?.pending || '0') === 0) {
      await this.db.query(
        `UPDATE reviews SET status = 'completed', current_state = 'approved', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [reviewId]
      );
      logger.info(`[Review] All action items completed, review ${reviewId} marked as completed`);
    }
  }

  async markOverdueFollowUps(): Promise<number> {
    const result = await this.db.query(
      `UPDATE reviews 
       SET follow_up_status = 'overdue', updated_at = NOW()
       WHERE status = 'follow_up' 
         AND follow_up_status = 'pending' 
         AND follow_up_due < NOW()
       RETURNING id`
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info(`[Review] Marked ${result.rowCount} reviews as overdue`);
    }

    return result.rowCount || 0;
  }

  async getReviewStats(): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    followUp: number;
    overdue: number;
    avgCompletionTimeHours: number;
  }> {
    const result = await this.db.query<{
      total: string;
      pending: string;
      in_progress: string;
      completed: string;
      follow_up: string;
      overdue: string;
      avg_hours: string;
    }>(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'follow_up') as follow_up,
         COUNT(*) FILTER (WHERE follow_up_status = 'overdue') as overdue,
         AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE status = 'completed') as avg_hours
       FROM reviews`
    );

    const row = result.rows[0];
    return {
      total: parseInt(row?.total || '0'),
      pending: parseInt(row?.pending || '0'),
      inProgress: parseInt(row?.in_progress || '0'),
      completed: parseInt(row?.completed || '0'),
      followUp: parseInt(row?.follow_up || '0'),
      overdue: parseInt(row?.overdue || '0'),
      avgCompletionTimeHours: parseFloat(row?.avg_hours || '0'),
    };
  }

  private mapRowToReview(row: {
    id: string;
    review_type: string;
    status: string;
    current_state: string;
    target_id: string;
    target_type: string;
    title: string;
    description: string;
    reviewer_id: string;
    findings: ReviewFinding[];
    action_items: ActionItem[];
    follow_up_due: Date;
    follow_up_status: string;
    created_at: Date;
    updated_at: Date;
  }): Review {
    return {
      id: row.id,
      reviewType: row.review_type as Review['reviewType'],
      status: row.status as Review['status'],
      currentState: row.current_state,
      targetId: row.target_id,
      targetType: row.target_type,
      title: row.title,
      description: row.description,
      reviewerId: row.reviewer_id,
      findings: row.findings || [],
      actionItems: row.action_items || [],
      followUpDue: row.follow_up_due,
      followUpStatus: row.follow_up_status as Review['followUpStatus'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
