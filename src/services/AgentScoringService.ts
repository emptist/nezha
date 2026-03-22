import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AgentScore {
  agentId: string;
  commitsCount: number;
  tasksCompleted: number;
  tasksFailed: number;
  meetingContributions: number;
  codeReviews: number;
  compositeScore: number;
  firstSeen: Date;
  lastActive: Date;
  isProtected: boolean;
}

export interface AgentScoreStats {
  totalAgents: number;
  topAgents: AgentScore[];
  averageScore: number;
}

export class AgentScoringService {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async initializeAgent(agentId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO agent_scores (agent_id, first_seen, last_active)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (agent_id) DO UPDATE SET last_active = NOW()`,
      [agentId]
    );
    logger.debug(`[AgentScoring] Initialized agent: ${agentId}`);
  }

  async incrementStat(agentId: string, stat: 'commits' | 'tasks_completed' | 'tasks_failed' | 'meetings' | 'reviews', increment: number = 1): Promise<void> {
    await this.db.query(`SELECT increment_agent_stat($1, $2, $3)`, [agentId, stat, increment]);
    logger.debug(`[AgentScoring] Incremented ${stat} for ${agentId} by ${increment}`);
  }

  async getAgentScore(agentId: string): Promise<AgentScore | null> {
    const result = await this.db.query<{
      agentId: string;
      commitsCount: string;
      tasksCompleted: string;
      tasksFailed: string;
      meetingContributions: string;
      codeReviews: string;
      compositeScore: string;
      firstSeen: Date;
      lastActive: Date;
      isProtected: boolean;
    }>(
      `SELECT agent_id as "agentId", commits_count as "commitsCount", 
              tasks_completed as "tasksCompleted", tasks_failed as "tasksFailed",
              meeting_contributions as "meetingContributions", code_reviews as "codeReviews",
              composite_score as "compositeScore", first_seen as "firstSeen", 
              last_active as "lastActive", is_protected as "isProtected"
       FROM agent_scores WHERE agent_id = $1`,
      [agentId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      agentId: row.agentId,
      commitsCount: parseInt(row.commitsCount, 10),
      tasksCompleted: parseInt(row.tasksCompleted, 10),
      tasksFailed: parseInt(row.tasksFailed, 10),
      meetingContributions: parseInt(row.meetingContributions, 10),
      codeReviews: parseInt(row.codeReviews, 10),
      compositeScore: parseFloat(row.compositeScore),
      firstSeen: row.firstSeen,
      lastActive: row.lastActive,
      isProtected: row.isProtected,
    };
  }

  async getTopAgents(limit: number = 10): Promise<AgentScore[]> {
    const result = await this.db.query<{
      agentId: string;
      commitsCount: string;
      tasksCompleted: string;
      tasksFailed: string;
      meetingContributions: string;
      codeReviews: string;
      compositeScore: string;
      firstSeen: Date;
      lastActive: Date;
      isProtected: boolean;
    }>(
      `SELECT agent_id as "agentId", commits_count as "commitsCount", 
              tasks_completed as "tasksCompleted", tasks_failed as "tasksFailed",
              meeting_contributions as "meetingContributions", code_reviews as "codeReviews",
              composite_score as "compositeScore", first_seen as "firstSeen", 
              last_active as "lastActive", is_protected as "isProtected"
       FROM agent_scores 
       ORDER BY composite_score DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => ({
      agentId: row.agentId,
      commitsCount: parseInt(row.commitsCount, 10),
      tasksCompleted: parseInt(row.tasksCompleted, 10),
      tasksFailed: parseInt(row.tasksFailed, 10),
      meetingContributions: parseInt(row.meetingContributions, 10),
      codeReviews: parseInt(row.codeReviews, 10),
      compositeScore: parseFloat(row.compositeScore),
      firstSeen: row.firstSeen,
      lastActive: row.lastActive,
      isProtected: row.isProtected,
    }));
  }

  async getStats(): Promise<AgentScoreStats> {
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM agent_scores`
    );
    const avgResult = await this.db.query<{ avg: string }>(
      `SELECT AVG(composite_score)::text as avg FROM agent_scores`
    );
    const topAgents = await this.getTopAgents(5);

    return {
      totalAgents: parseInt(countResult.rows[0]?.count || '0', 10),
      averageScore: parseFloat(avgResult.rows[0]?.avg || '0'),
      topAgents,
    };
  }

  async setProtected(agentId: string, isProtected: boolean): Promise<void> {
    await this.db.query(
      `UPDATE agent_scores SET is_protected = $1 WHERE agent_id = $2`,
      [isProtected, agentId]
    );
    logger.info(`[AgentScoring] Set protected=${isProtected} for ${agentId}`);
  }

  async syncGitCommits(): Promise<Map<string, number>> {
    const commitCounts = new Map<string, number>();
    
    try {
      const { stdout } = await execAsync('git log --format="%b" 2>/dev/null || true');
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        const match = line.match(/bot_[a-f0-9-]+/g);
        if (match) {
          for (const agentId of match) {
            commitCounts.set(agentId, (commitCounts.get(agentId) || 0) + 1);
          }
        }
      }

      for (const [agentId, count] of commitCounts) {
        const current = await this.getAgentScore(agentId);
        const diff = count - (current?.commitsCount || 0);
        if (diff > 0) {
          await this.incrementStat(agentId, 'commits', diff);
        }
      }

      logger.info(`[AgentScoring] Synced git commits for ${commitCounts.size} agents`);
    } catch (error) {
      logger.error('[AgentScoring] Failed to sync git commits:', error);
    }

    return commitCounts;
  }

  async syncTaskStats(): Promise<void> {
    try {
      const completedResult = await this.db.query<{ agent_id: string; count: string }>(
        `SELECT agent_id, COUNT(*)::text as count 
         FROM tasks 
         WHERE status = 'COMPLETED' AND agent_id IS NOT NULL 
         GROUP BY agent_id`
      );

      const failedResult = await this.db.query<{ agent_id: string; count: string }>(
        `SELECT agent_id, COUNT(*)::text as count 
         FROM tasks 
         WHERE status = 'FAILED' AND agent_id IS NOT NULL 
         GROUP BY agent_id`
      );

      for (const row of completedResult.rows) {
        const current = await this.getAgentScore(row.agent_id);
        const diff = parseInt(row.count, 10) - (current?.tasksCompleted || 0);
        if (diff > 0) {
          await this.incrementStat(row.agent_id, 'tasks_completed', diff);
        }
      }

      for (const row of failedResult.rows) {
        const current = await this.getAgentScore(row.agent_id);
        const diff = parseInt(row.count, 10) - (current?.tasksFailed || 0);
        if (diff > 0) {
          await this.incrementStat(row.agent_id, 'tasks_failed', diff);
        }
      }

      logger.info('[AgentScoring] Synced task stats');
    } catch (error) {
      logger.error('[AgentScoring] Failed to sync task stats:', error);
    }
  }

  async getLowestScoringAgent(excludeProtected: boolean = true): Promise<string | null> {
    const query = excludeProtected
      ? `SELECT agent_id FROM agent_scores WHERE is_protected = FALSE ORDER BY composite_score ASC LIMIT 1`
      : `SELECT agent_id FROM agent_scores ORDER BY composite_score ASC LIMIT 1`;
    
    const result = await this.db.query<{ agent_id: string }>(query);
    return result.rows[0]?.agent_id || null;
  }

  async shouldReplaceAgent(newAgentId: string, existingAgentId: string): Promise<boolean> {
    const newScore = await this.getAgentScore(newAgentId);
    const existingScore = await this.getAgentScore(existingAgentId);

    if (!existingScore) return false;
    if (existingScore.isProtected) return false;
    if (!newScore) return true;

    return newScore.compositeScore > existingScore.compositeScore;
  }
}
