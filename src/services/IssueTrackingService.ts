import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';

export interface Issue {
  id: string;
  title: string;
  description?: string;
  status: string;
  resolution?: string;
  type?: string;
  severity?: string;
  createdAt: Date;
  closedAt?: Date;
}

export class IssueTrackingService {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async findRelatedOpenIssues(taskTitle: string): Promise<Issue[]> {
    const keywords = this.extractKeywords(taskTitle);
    if (keywords.length === 0) return [];

    const conditions = keywords.map((k, i) => `title ILIKE $${i + 1}`).join(' OR ');
    const values = keywords.map(k => `%${k}%`);

    const result = await this.db.query<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      resolution: string | null;
      issue_type: string | null;
      severity: string | null;
      created_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, title, description, status, resolution, issue_type, severity, created_at, resolved_at
       FROM issues
       WHERE (${conditions}) AND status = 'open'
       ORDER BY created_at DESC
       LIMIT 5`,
      values
    );

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status,
      resolution: row.resolution ?? undefined,
      type: row.issue_type ?? undefined,
      severity: row.severity ?? undefined,
      createdAt: row.created_at,
      closedAt: row.resolved_at ?? undefined,
    }));
  }

  async resolveIssue(issueId: string, resolution: string): Promise<void> {
    await this.db.query(
      `UPDATE issues SET status = 'resolved', resolution = $1, resolved_at = NOW() WHERE id = $2`,
      [resolution, issueId]
    );
    logger.info(`[IssueTracking] Resolved issue: ${issueId}`);
  }

  async checkAndWarnRelatedIssues(taskTitle: string): Promise<Issue[]> {
    const issues = await this.findRelatedOpenIssues(taskTitle);

    if (issues.length > 0) {
      logger.warn(
        `[IssueTracking] Found ${issues.length} related OPEN issues for task "${taskTitle}":`
      );
      for (const issue of issues) {
        logger.warn(`  - ${issue.id}: ${issue.title.substring(0, 50)}...`);
      }
    }

    return issues;
  }

  private extractKeywords(title: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'and',
      'but',
      'or',
      'nor',
      'so',
      'yet',
      'both',
      'either',
      'neither',
      'not',
      'only',
      'own',
      'same',
      'than',
      'too',
      'very',
      'just',
      'fix',
      'bug',
      'issue',
      'error',
      'problem',
      'task',
      'update',
      'add',
    ]);

    const words = title.toLowerCase().split(/[\s\-_:]+/);
    return words.filter(w => w.length > 3 && !stopWords.has(w) && !/^\d+$/.test(w)).slice(0, 5);
  }

  async getOpenIssuesCount(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM issues WHERE status = 'open'`
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async getRecentResolvedIssues(limit: number = 10): Promise<Issue[]> {
    const result = await this.db.query<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      resolution: string | null;
      issue_type: string | null;
      severity: string | null;
      created_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, title, description, status, resolution, issue_type, severity, created_at, resolved_at
       FROM issues
       WHERE status = 'resolved'
       ORDER BY resolved_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status,
      resolution: row.resolution ?? undefined,
      type: row.issue_type ?? undefined,
      severity: row.severity ?? undefined,
      createdAt: row.created_at,
      closedAt: row.resolved_at ?? undefined,
    }));
  }
}
