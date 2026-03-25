import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { Config } from '../config/Config.js';

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
  private readonly agentId: string;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.agentId = Config.getInstance().getAgentId();
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
         name = COALESCE($3, souls.name),
         content = COALESCE($4, souls.content),
         traits = COALESCE($5, souls.traits),
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
    const column = table === 'learnings' ? 'viewers' : 'viewers';
    await this.db.query(
      `UPDATE ${table} SET ${column} = array_distinct(array_append(${column}, $1)) WHERE id = $2`,
      [this.agentId, id]
    );
  }
}
