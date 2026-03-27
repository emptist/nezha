import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { getGitInfo } from '../utils/git.js';

export interface ActivityLogEntry {
  id: string;
  agentId: string;
  activity: string;
  context: Record<string, unknown>;
  gitHash?: string;
  gitBranch?: string;
  environment: string;
  timestamp: Date;
}

export type ActivityType =
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'review_created'
  | 'review_completed'
  | 'announcement_sent'
  | 'announcement_read'
  | 'skill_created'
  | 'skill_used'
  | 'issue_created'
  | 'issue_resolved'
  | 'meeting_joined'
  | 'consensus_reached'
  | 'error_encountered'
  | 'system_started'
  | 'system_stopped';

export class ActivityLogService {
  private readonly db: DatabaseClient;
  private agentId: string | null;
  private readonly environment: string;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.agentId = null;
    this.environment = process.env.NODE_ENV || 'development';
  }

  private async ensureAgentId(): Promise<void> {
    if (!this.agentId) {
      const { AgentIdentityService } = await import('./AgentIdentityService.js');
      const identity = await AgentIdentityService.getResolvedIdentity();
      this.agentId = identity.id;
    }
  }

  private getGitInfo(): { hash?: string; branch?: string } {
    const info = getGitInfo({ shortHash: true });
    if (!info.hash && !info.branch) {
      return {};
    }
    return {
      hash: info.hash?.substring(0, 12),
      branch: info.branch || undefined,
    };
  }

  async log(activity: ActivityType, context: Record<string, unknown> = {}): Promise<string> {
    await this.ensureAgentId();
    const id = crypto.randomUUID();
    const gitInfo = this.getGitInfo();

    await this.db.query(
      `INSERT INTO activity_log (id, agent_id, activity, context, git_hash, git_branch, environment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        this.agentId,
        activity,
        JSON.stringify(context),
        gitInfo.hash,
        gitInfo.branch,
        this.environment,
      ]
    );

    logger.debug(`[ActivityLog] ${activity}: ${JSON.stringify(context).substring(0, 100)}`);
    return id;
  }

  async logTaskStart(taskId: string, taskTitle: string): Promise<string> {
    return this.log('task_started', { taskId, taskTitle });
  }

  async logTaskComplete(taskId: string, taskTitle: string, result: string): Promise<string> {
    return this.log('task_completed', { taskId, taskTitle, result });
  }

  async logTaskFail(taskId: string, taskTitle: string, error: string): Promise<string> {
    return this.log('task_failed', { taskId, taskTitle, error });
  }

  async logAnnouncement(message: string, priority: string, targetAgent?: string): Promise<string> {
    return this.log('announcement_sent', {
      message: message.substring(0, 200),
      priority,
      targetAgent,
    });
  }

  async logError(
    errorType: string,
    errorMessage: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    return this.log('error_encountered', { errorType, errorMessage, ...context });
  }

  async getRecentActivities(limit: number = 50): Promise<ActivityLogEntry[]> {
    const result = await this.db.query<{
      id: string;
      agent_id: string;
      activity: string;
      context: Record<string, unknown>;
      git_hash: string | null;
      git_branch: string | null;
      environment: string;
      timestamp: Date;
    }>(
      `SELECT id, agent_id, activity, context, git_hash, git_branch, environment, timestamp
       FROM activity_log
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      activity: row.activity,
      context: row.context,
      gitHash: row.git_hash || undefined,
      gitBranch: row.git_branch || undefined,
      environment: row.environment,
      timestamp: row.timestamp,
    }));
  }

  async getActivitiesByAgent(agentId: string, limit: number = 50): Promise<ActivityLogEntry[]> {
    const result = await this.db.query<{
      id: string;
      agent_id: string;
      activity: string;
      context: Record<string, unknown>;
      git_hash: string | null;
      git_branch: string | null;
      environment: string;
      timestamp: Date;
    }>(
      `SELECT id, agent_id, activity, context, git_hash, git_branch, environment, timestamp
       FROM activity_log
       WHERE agent_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [agentId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      activity: row.activity,
      context: row.context,
      gitHash: row.git_hash || undefined,
      gitBranch: row.git_branch || undefined,
      environment: row.environment,
      timestamp: row.timestamp,
    }));
  }

  async getActivitiesByGitHash(gitHash: string): Promise<ActivityLogEntry[]> {
    const result = await this.db.query<{
      id: string;
      agent_id: string;
      activity: string;
      context: Record<string, unknown>;
      git_hash: string | null;
      git_branch: string | null;
      environment: string;
      timestamp: Date;
    }>(
      `SELECT id, agent_id, activity, context, git_hash, git_branch, environment, timestamp
       FROM activity_log
       WHERE git_hash LIKE $1
       ORDER BY timestamp DESC`,
      [`${gitHash}%`]
    );

    return result.rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      activity: row.activity,
      context: row.context,
      gitHash: row.git_hash || undefined,
      gitBranch: row.git_branch || undefined,
      environment: row.environment,
      timestamp: row.timestamp,
    }));
  }

  async getActivityStats(): Promise<{
    totalActivities: number;
    activitiesByType: Record<string, number>;
    activitiesByAgent: Record<string, number>;
    recentErrors: number;
  }> {
    const totalResult = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM activity_log'
    );
    const totalActivities = totalResult.rows[0] ? parseInt(totalResult.rows[0].count, 10) : 0;

    const typeResult = await this.db.query<{ activity: string; count: string }>(
      `SELECT activity, COUNT(*) as count
       FROM activity_log
       GROUP BY activity
       ORDER BY count DESC`
    );
    const activitiesByType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      activitiesByType[row.activity] = parseInt(row.count, 10);
    }

    const agentResult = await this.db.query<{ agent_id: string; count: string }>(
      `SELECT agent_id, COUNT(*) as count
       FROM activity_log
       GROUP BY agent_id
       ORDER BY count DESC
       LIMIT 10`
    );
    const activitiesByAgent: Record<string, number> = {};
    for (const row of agentResult.rows) {
      activitiesByAgent[row.agent_id] = parseInt(row.count, 10);
    }

    const errorResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM activity_log WHERE activity = 'error_encountered' AND timestamp > NOW() - INTERVAL '24 hours'`
    );
    const recentErrors = errorResult.rows[0] ? parseInt(errorResult.rows[0].count, 10) : 0;

    return { totalActivities, activitiesByType, activitiesByAgent, recentErrors };
  }
}
