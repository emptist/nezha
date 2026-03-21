import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { getGitHash, getGitBranch } from '../utils/git.js';

export interface ActivityLog {
  id: string;
  agentId: string;
  activity: string;
  context: Record<string, unknown>;
  gitHash?: string;
  gitBranch?: string;
  environment: string;
  timestamp: Date;
}

export class ActivityLoggingService {
  private readonly db: DatabaseClient;
  private readonly gitHash: string;
  private readonly gitBranch: string;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.gitHash = getGitHash(true)?.substring(0, 12) || 'unknown';
    this.gitBranch = getGitBranch() || 'unknown';
  }

  async logActivity(
    agentId: string,
    activity: string,
    context: Record<string, unknown> = {}
  ): Promise<string> {
    const id = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO activity_log (id, agent_id, activity, context, git_hash, git_branch, environment, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        id,
        agentId,
        activity,
        JSON.stringify(context),
        this.gitHash,
        this.gitBranch,
        process.env.NODE_ENV || 'development',
      ]
    );

    logger.debug(`[ActivityLog] ${agentId}: ${activity}`);
    return id;
  }

  async logTaskStart(agentId: string, taskId: string, taskTitle: string): Promise<string> {
    return this.logActivity(agentId, 'task_start', { taskId, taskTitle });
  }

  async logTaskComplete(
    agentId: string,
    taskId: string,
    taskTitle: string,
    durationMs: number
  ): Promise<string> {
    return this.logActivity(agentId, 'task_complete', { taskId, taskTitle, durationMs });
  }

  async logTaskFail(
    agentId: string,
    taskId: string,
    taskTitle: string,
    error: string
  ): Promise<string> {
    return this.logActivity(agentId, 'task_fail', { taskId, taskTitle, error });
  }

  async logSkillUse(agentId: string, skillName: string, success: boolean): Promise<string> {
    return this.logActivity(agentId, 'skill_use', { skillName, success });
  }

  async logReviewComplete(
    agentId: string,
    reviewId: string,
    findingsCount: number
  ): Promise<string> {
    return this.logActivity(agentId, 'review_complete', { reviewId, findingsCount });
  }

  async logDiscussionParticipation(agentId: string, discussionId: string): Promise<string> {
    return this.logActivity(agentId, 'discussion_participate', { discussionId });
  }

  async getRecentActivity(agentId?: string, limit: number = 50): Promise<ActivityLog[]> {
    const query = agentId
      ? `SELECT * FROM activity_log WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT $2`
      : `SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT $1`;

    const params = agentId ? [agentId, limit] : [limit];

    const result = await this.db.query<{
      id: string;
      agent_id: string;
      activity: string;
      context: Record<string, unknown>;
      git_hash: string;
      git_branch: string;
      environment: string;
      timestamp: Date;
    }>(query, params);

    return result.rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      activity: row.activity,
      context: row.context,
      gitHash: row.git_hash,
      gitBranch: row.git_branch,
      environment: row.environment,
      timestamp: row.timestamp,
    }));
  }

  async getActivityStats(agentId?: string): Promise<{
    totalActivities: number;
    tasksCompleted: number;
    reviewsCompleted: number;
    discussionsJoined: number;
    gitVersions: string[];
  }> {
    const agentFilter = agentId ? `WHERE agent_id = '${agentId}'` : '';

    const result = await this.db.query<{
      total: string;
      completed: string;
      reviews: string;
      discussions: string;
      versions: string;
    }>(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE activity = 'task_complete') as completed,
        COUNT(*) FILTER (WHERE activity = 'review_complete') as reviews,
        COUNT(*) FILTER (WHERE activity = 'discussion_participate') as discussions,
        string_agg(DISTINCT git_hash, ',') as versions
      FROM activity_log
      ${agentFilter}
    `);

    const row = result.rows[0];
    return {
      totalActivities: parseInt(row?.total || '0'),
      tasksCompleted: parseInt(row?.completed || '0'),
      reviewsCompleted: parseInt(row?.reviews || '0'),
      discussionsJoined: parseInt(row?.discussions || '0'),
      gitVersions: (row?.versions || '').split(',').filter(Boolean),
    };
  }

  getGitInfo(): { hash: string; branch: string } {
    return {
      hash: this.gitHash,
      branch: this.gitBranch,
    };
  }
}
