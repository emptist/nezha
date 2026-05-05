import { execSync } from 'child_process';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { Config } from '../config/Config.js';

export interface AgentSession {
  id: string;
  startedAt: Date;
  lastHeartbeat: Date;
  status: 'alive' | 'dead';
  gitBranch?: string;
  workingOn?: string;
  agentType: string;
}

export class AgentSessionService {
  private db: DatabaseClient;
  private sessionId: string | null = null;
  private maxSessionsPerType: number;
  private useSmartScoring: boolean = true;

  constructor(db: DatabaseClient, maxSessionsPerType?: number, useSmartScoring: boolean = true) {
    this.db = db;
    this.maxSessionsPerType =
      maxSessionsPerType ?? parseInt(process.env.NEZHA_MAX_SESSIONS ?? '3', 10);
    this.useSmartScoring = useSmartScoring;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async registerSession(agentType: string = 'opencode', identityId?: string): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    const pool = this.db.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM agent_sessions WHERE status = 'alive' AND agent_type = $1`,
        [agentType]
      );
      const aliveCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

      if (aliveCount >= this.maxSessionsPerType) {
        if (this.useSmartScoring) {
          const victimResult = await client.query<{ id: string }>(
            `SELECT s.id 
             FROM agent_sessions s
             LEFT JOIN agent_scores a ON s.id = a.agent_id
             WHERE s.status = 'alive' AND s.agent_type = $1
             AND (a.is_protected IS NULL OR a.is_protected = FALSE)
             ORDER BY COALESCE(a.composite_score, 0) ASC, s.last_heartbeat ASC
             LIMIT 1`,
            [agentType]
          );

          if (victimResult.rows[0]) {
            await client.query(`UPDATE agent_sessions SET status = 'dead' WHERE id = $1`, [
              victimResult.rows[0].id,
            ]);
            logger.info(`[AgentSession] Killed lowest-scoring agent: ${victimResult.rows[0].id}`);
          }
        } else {
          await client.query(
            `UPDATE agent_sessions 
             SET status = 'dead'
             WHERE status = 'alive' AND agent_type = $1
             AND id = (SELECT id FROM agent_sessions WHERE status = 'alive' AND agent_type = $1 ORDER BY last_heartbeat ASC LIMIT 1)`,
            [agentType]
          );
        }
      }

      const config = Config.getInstance();
      const configAgentId = (config as unknown as { config: { agentId: string } }).config.agentId;
      const sessionId = configAgentId.startsWith('bot_')
        ? configAgentId
        : `bot_${crypto.randomUUID()}`;
      this.sessionId = sessionId;

      const gitBranch = await this.getGitBranch();

      await client.query(
        `INSERT INTO agent_sessions (id, started_at, last_heartbeat, status, git_branch, agent_type, identity_id)
         VALUES ($1, NOW(), NOW(), 'alive', $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET 
           status = 'alive',
           last_heartbeat = NOW(),
           git_branch = $2,
           identity_id = $4`,
        [sessionId, gitBranch, agentType, identityId || null]
      );

      await client.query('COMMIT');

      logger.info(`[AgentSession] Registered session: ${sessionId} (${agentType})`);

      return sessionId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async unregister(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    await this.db.query(`UPDATE agent_sessions SET status = 'dead' WHERE id = $1`, [
      this.sessionId,
    ]);

    logger.info(`[AgentSession] Unregistered session: ${this.sessionId}`);
    this.sessionId = null;
  }

  async getActiveSessions(): Promise<AgentSession[]> {
    const result = await this.db.query<{
      id: string;
      started_at: Date;
      last_heartbeat: Date;
      status: 'alive' | 'dead';
      git_branch: string | null;
      working_on: string | null;
      agent_type: string;
    }>(`SELECT * FROM agent_sessions WHERE status = 'alive' ORDER BY last_heartbeat DESC`);

    return result.rows.map(row => ({
      id: row.id,
      startedAt: row.started_at,
      lastHeartbeat: row.last_heartbeat,
      status: row.status,
      gitBranch: row.git_branch ?? undefined,
      workingOn: row.working_on ?? undefined,
      agentType: row.agent_type,
    }));
  }

  async cleanupStaleSessions(intervalMinutes: number = 5): Promise<number> {
    const result = await this.db.query<{ cleanup_stale_sessions: number }>(
      `SELECT cleanup_stale_sessions($1) as cleanup_stale_sessions`,
      [intervalMinutes]
    );

    const cleaned = result.rows[0]?.cleanup_stale_sessions ?? 0;

    if (cleaned > 0) {
      logger.info(`[AgentSession] Cleaned up ${cleaned} stale sessions`);
    }

    return cleaned;
  }

  async cleanupDeadSessions(ageHours: number = 24): Promise<number> {
    const result = await this.db.query<{ cleanup_dead_sessions: number }>(
      `SELECT cleanup_dead_sessions($1) as cleanup_dead_sessions`,
      [ageHours]
    );

    const deleted = result.rows[0]?.cleanup_dead_sessions ?? 0;

    if (deleted > 0) {
      logger.info(`[AgentSession] Deleted ${deleted} dead sessions`);
    }

    return deleted;
  }

  private async getGitBranch(): Promise<string | null> {
    try {
      const branch = execSync('git branch --show-current', {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      return branch || null;
    } catch {
      return null;
    }
  }
}

let agentSessionService: AgentSessionService | null = null;

export function getAgentSessionService(db: DatabaseClient): AgentSessionService {
  if (!agentSessionService) {
    agentSessionService = new AgentSessionService(db);
  }
  return agentSessionService;
}

export function getCurrentSessionId(): string | null {
  return agentSessionService?.getSessionId() ?? null;
}
