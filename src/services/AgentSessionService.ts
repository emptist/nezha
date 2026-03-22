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
  private maxSessionsPerType: number = 1;

  constructor(db: DatabaseClient, maxSessionsPerType: number = 1) {
    this.db = db;
    this.maxSessionsPerType = maxSessionsPerType;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async registerSession(agentType: string = 'opencode'): Promise<string> {
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
        await client.query(
          `UPDATE agent_sessions 
           SET status = 'dead'
           WHERE status = 'alive' AND agent_type = $1
           AND id = (SELECT id FROM agent_sessions WHERE status = 'alive' AND agent_type = $1 ORDER BY last_heartbeat ASC LIMIT 1)`,
          [agentType]
        );
      }

      const config = Config.getInstance();
      const configAgentId = (config as unknown as { config: { agentId: string } }).config.agentId;
      const sessionId = configAgentId.startsWith('bot_') 
        ? configAgentId 
        : `bot_${crypto.randomUUID()}`;
      this.sessionId = sessionId;

      const gitBranch = await this.getGitBranch();

      await client.query(
        `INSERT INTO agent_sessions (id, started_at, last_heartbeat, status, git_branch, agent_type)
         VALUES ($1, NOW(), NOW(), 'alive', $2, $3)
         ON CONFLICT (id) DO UPDATE SET 
           status = 'alive',
           last_heartbeat = NOW(),
           git_branch = $2`,
        [sessionId, gitBranch, agentType]
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

  async heartbeat(workingOn?: string): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    await this.db.query(
      `UPDATE agent_sessions 
       SET last_heartbeat = NOW(), working_on = COALESCE($1, working_on)
       WHERE id = $2 AND status = 'alive'`,
      [workingOn, this.sessionId]
    );
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

  private async getGitBranch(): Promise<string | null> {
    try {
      const result = await this.db.query<{ branch: string }>(`SELECT git_branch_name() as branch`);
      return result.rows[0]?.branch ?? null;
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
