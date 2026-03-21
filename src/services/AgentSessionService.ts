import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';

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

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async registerSession(agentType: string = 'opencode'): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    const result = await this.db.query<{ generate_bot_id: string }>(
      `SELECT generate_bot_id() as generate_bot_id`
    );

    this.sessionId = result.rows[0]?.generate_bot_id ?? `bot_${crypto.randomUUID()}`;

    const gitBranch = await this.getGitBranch();

    await this.db.query(
      `INSERT INTO agent_sessions (id, started_at, last_heartbeat, status, git_branch, agent_type)
       VALUES ($1, NOW(), NOW(), 'alive', $2, $3)`,
      [this.sessionId, gitBranch, agentType]
    );

    logger.info(`[AgentSession] Registered session: ${this.sessionId} (${agentType})`);

    return this.sessionId;
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
