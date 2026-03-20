import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { Config } from '../config/Config.js';

export interface Broadcast {
  id: string;
  fromAgent: string;
  message: string;
  target?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export class BroadcastService {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async sendBroadcast(message: string, targetAgent?: string): Promise<string> {
    const id = crypto.randomUUID();
    const fromAgent = Config.getInstance().getAgentId();

    await this.db.query(
      `INSERT INTO project_communications 
       (id, project_id, from_ai, to_ai, message_type, content, metadata)
       VALUES ($1, NULL, $2, $3, 'broadcast', $4, $5)`,
      [
        id,
        fromAgent,
        targetAgent || 'all',
        message,
        JSON.stringify({
          type: 'broadcast',
          target: targetAgent || 'all',
          sentAt: new Date().toISOString(),
        }),
      ]
    );

    logger.info(`[Broadcast] Sent broadcast: ${message.substring(0, 50)}...`);
    return id;
  }

  async sendToAllAgents(message: string): Promise<string> {
    return this.sendBroadcast(message, 'all');
  }

  async sendToAgent(agentId: string, message: string): Promise<string> {
    return this.sendBroadcast(message, agentId);
  }

  async getBroadcasts(limit: number = 20): Promise<Broadcast[]> {
    const result = await this.db.query<{
      id: string;
      from_ai: string;
      content: string;
      to_ai: string;
      created_at: Date;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, from_ai, content, to_ai, created_at, metadata
       FROM project_communications
       WHERE message_type = 'broadcast'
         AND (to_ai = 'all' OR to_ai = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [Config.getInstance().getAgentId(), limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      fromAgent: row.from_ai,
      message: row.content,
      target: row.to_ai,
      createdAt: row.created_at,
    }));
  }

  async getUnreadBroadcasts(): Promise<Broadcast[]> {
    const agentId = Config.getInstance().getAgentId();

    const result = await this.db.query<{
      id: string;
      from_ai: string;
      content: string;
      to_ai: string;
      created_at: Date;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, from_ai, content, to_ai, created_at, metadata
       FROM project_communications
       WHERE message_type = 'broadcast'
         AND (to_ai = 'all' OR to_ai = $1)
         AND metadata->>'read' IS NULL
       ORDER BY created_at DESC`,
      [agentId]
    );

    return result.rows.map(row => ({
      id: row.id,
      fromAgent: row.from_ai,
      message: row.content,
      target: row.to_ai,
      createdAt: row.created_at,
    }));
  }

  async markAsRead(broadcastId: string): Promise<void> {
    const agentId = Config.getInstance().getAgentId();

    await this.db.query(
      `UPDATE project_communications 
       SET metadata = metadata || jsonb_build_object('read', true, 'readBy', $1, 'readAt', NOW())
       WHERE id = $2
         AND message_type = 'broadcast'`,
      [agentId, broadcastId]
    );
  }

  async markAllAsRead(): Promise<number> {
    const agentId = Config.getInstance().getAgentId();

    const result = await this.db.query(
      `UPDATE project_communications
       SET metadata = metadata || jsonb_build_object('read', true, 'readBy', $1, 'readAt', NOW())
       WHERE message_type = 'broadcast'
         AND (to_ai = 'all' OR to_ai = $1)
         AND metadata->>'read' IS NULL`,
      [agentId]
    );

    return result.rowCount || 0;
  }
}
