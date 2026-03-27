import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';

export interface Soul {
  id: string;
  agentId?: string;
  name?: string;
  content?: string;
  traits: Record<string, unknown>;
  createdAt: Date;
}

export class SoulService {
  private readonly db: DatabaseClient;
  private agentId: string | null;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.agentId = null;
  }

  private async ensureAgentId(): Promise<void> {
    if (!this.agentId) {
      const { AgentIdentityService } = await import('./AgentIdentityService.js');
      const identity = await AgentIdentityService.getResolvedIdentity();
      this.agentId = identity.id;
    }
  }

  async saveSoul(
    agentId: string,
    name?: string,
    content?: string,
    traits?: Record<string, unknown>
  ): Promise<string> {
    const id = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO souls (id, agent_id, name, content, traits)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (agent_id) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, souls.name),
         content = COALESCE(EXCLUDED.content, souls.content),
         traits = COALESCE(EXCLUDED.traits, souls.traits),
         updated_at = NOW()`,
      [id, agentId, name, content, JSON.stringify(traits || {})]
    );

    logger.info(`[Soul] Saved soul for ${agentId}${name ? ` (${name})` : ''}`);
    return id;
  }

  async getSoul(agentId: string): Promise<Soul | null> {
    const result = await this.db.query<{
      id: string;
      agent_id: string;
      name: string;
      content: string;
      traits: Record<string, unknown>;
      created_at: Date;
    }>(`SELECT id, agent_id, name, content, traits, created_at FROM souls WHERE agent_id = $1`, [
      agentId,
    ]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    return {
      id: row.id,
      agentId: row.agent_id,
      name: row.name,
      content: row.content,
      traits: row.traits,
      createdAt: row.created_at,
    };
  }

  async listSouls(): Promise<Array<{ agentId: string; name?: string }>> {
    const result = await this.db.query<{ agent_id: string; name: string }>(
      `SELECT agent_id, name FROM souls ORDER BY updated_at DESC`
    );
    return result.rows.map(r => ({ agentId: r.agent_id, name: r.name }));
  }

  async markViewed(table: string, id: string): Promise<void> {
    const validTables = ['memory', 'issues', 'skills'];
    if (!validTables.includes(table)) {
      logger.warn(`[Soul] Invalid table for markViewed: ${table}`);
      return;
    }

    await this.ensureAgentId();
    await this.db.query(
      `UPDATE ${table} SET viewers = array_append(viewers, $1) WHERE id = $2 AND NOT ($1 = ANY(viewers))`,
      [this.agentId, id]
    );
  }
}
