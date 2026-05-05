import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { getGitInfo } from '../utils/git.js';
import { AgentIdentityService } from './AgentIdentityService.js';

export type BroadcastPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Broadcast {
  id: string;
  fromAgent: string;
  fromAgentName?: string;
  message: string;
  target?: string;
  priority: BroadcastPriority;
  gitHash?: string;
  gitBranch?: string;
  environment: string;
  createdAt: Date;
  readAt?: Date;
  readBy?: string;
}

export class BroadcastService {
  private readonly db: DatabaseClient;
  private readonly agentId: string;
  private readonly agentName?: string;
  private readonly environment: string;

  constructor(db: DatabaseClient, agentId: string, agentName?: string) {
    this.db = db;
    this.agentId = agentId;
    this.agentName = agentName;
    this.environment = process.env.NODE_ENV || 'development';
  }

  static async create(db: DatabaseClient): Promise<BroadcastService> {
    const identityService = new AgentIdentityService(db);
    const resolved = await identityService.resolve();
    logger.info(`[BroadcastService] Using resolved agent ID: ${resolved.id}`);
    return new BroadcastService(db, resolved.id, resolved.displayName);
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

  async sendBroadcast(
    message: string,
    options: {
      targetAgent?: string;
      priority?: BroadcastPriority;
    } = {}
  ): Promise<string> {
    const id = crypto.randomUUID();
    const gitInfo = this.getGitInfo();
    const priority = options.priority || 'normal';
    const defaultProjectId = '00000000-0000-0000-0000-000000000001';

    await this.db.query(
      `INSERT INTO project_communications 
       (id, project_id, from_ai, to_ai, message_type, content, metadata, priority, git_hash, git_branch, environment)
       VALUES ($1, $2, $3, $4, 'broadcast', $5, $6, $7, $8, $9, $10)`,
      [
        id,
        defaultProjectId,
        this.agentId,
        options.targetAgent || 'all-ais',
        message,
        JSON.stringify({
          agentName: this.agentName,
          sentAt: new Date().toISOString(),
        }),
        priority,
        gitInfo.hash,
        gitInfo.branch,
        this.environment,
      ]
    );

    const priorityIcon = priority === 'critical' ? '🚨' : priority === 'high' ? '⚠️' : '📢';
    logger.info(
      `[Broadcast] ${priorityIcon} Sent ${priority} broadcast: ${message.substring(0, 50)}...`
    );
    return id;
  }

  async sendToAllAgents(message: string, priority?: BroadcastPriority): Promise<string> {
    return this.sendBroadcast(message, { targetAgent: 'all-ais', priority });
  }

  async sendToAgent(
    agentId: string,
    message: string,
    priority?: BroadcastPriority
  ): Promise<string> {
    return this.sendBroadcast(message, { targetAgent: agentId, priority });
  }

  async sendCritical(message: string): Promise<string> {
    return this.sendBroadcast(message, { priority: 'critical' });
  }

  async sendHighPriority(message: string): Promise<string> {
    return this.sendBroadcast(message, { priority: 'high' });
  }

  async endBroadcast(broadcastId: string, resolution?: string): Promise<void> {
    await this.db.query(
      `UPDATE project_communications 
       SET metadata = metadata || $1::jsonb
       WHERE id = $2`,
      [
        JSON.stringify({
          ended: true,
          endedAt: new Date().toISOString(),
          resolution: resolution || 'resolved',
        }),
        broadcastId,
      ]
    );
    logger.info(`[Broadcast] Ended broadcast ${broadcastId}`);
  }

  async resolveRelatedBroadcasts(contentPattern: string, resolution: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE project_communications 
       SET metadata = metadata || $1::jsonb
       WHERE message_type = 'broadcast' 
         AND content LIKE '%' || $2 || '%'
         AND (metadata->>'ended') IS NULL`,
      [
        JSON.stringify({
          ended: true,
          endedAt: new Date().toISOString(),
          resolution,
        }),
        contentPattern,
      ]
    );
    logger.info(
      `[Broadcast] Resolved ${result.rowCount || 0} related broadcasts matching "${contentPattern}"`
    );
    return result.rowCount || 0;
  }

  async getBroadcasts(
    limit: number = 20,
    priority?: BroadcastPriority,
    includeEnded: boolean = false
  ): Promise<Broadcast[]> {
    let query = `SELECT id, from_ai, content, to_ai, created_at, metadata, priority, git_hash, git_branch, environment, read_at
       FROM project_communications
       WHERE message_type = 'broadcast'
         AND (to_ai = 'all-ais' OR to_ai = 'all' OR to_ai = $1 OR from_ai = $1)`;
    const params: (string | number)[] = [this.agentId];

    if (priority) {
      query += ` AND priority = $${params.length + 1}`;
      params.push(priority);
    }

    if (!includeEnded) {
      query += ` AND (metadata->>'ended') IS NULL`;
    }

    query += ` ORDER BY 
         CASE priority 
           WHEN 'critical' THEN 1 
           WHEN 'high' THEN 2 
           WHEN 'normal' THEN 3 
           ELSE 4 
         END, 
         created_at DESC 
       LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.db.query<{
      id: string;
      from_ai: string;
      content: string;
      to_ai: string;
      created_at: Date;
      metadata: Record<string, unknown>;
      priority: string;
      git_hash: string | null;
      git_branch: string | null;
      environment: string;
      read_at: Date | null;
    }>(query, params);

    return result.rows.map(row => ({
      id: row.id,
      fromAgent: row.from_ai,
      fromAgentName: row.metadata?.agentName as string | undefined,
      message: row.content,
      target: row.to_ai,
      priority: row.priority as BroadcastPriority,
      gitHash: row.git_hash || undefined,
      gitBranch: row.git_branch || undefined,
      environment: row.environment,
      createdAt: row.created_at,
      readAt: row.read_at || undefined,
    }));
  }

  async markAsRead(broadcastId: string): Promise<void> {
    await this.db.query(
      `UPDATE project_communications 
       SET read_at = NOW()
       WHERE id = $1
         AND message_type = 'broadcast'`,
      [broadcastId]
    );
  }

  async getUnreadBroadcasts(): Promise<Broadcast[]> {
    const result = await this.db.query<{
      id: string;
      from_ai: string;
      content: string;
      to_ai: string;
      created_at: Date;
      metadata: Record<string, unknown>;
      priority: string;
      git_hash: string | null;
      git_branch: string | null;
      environment: string;
    }>(
      `SELECT id, from_ai, content, to_ai, created_at, metadata, priority, git_hash, git_branch, environment
       FROM project_communications
       WHERE message_type = 'broadcast'
         AND (to_ai = 'all-ais' OR to_ai = 'all' OR to_ai = $1 OR from_ai = $1)
         AND read_at IS NULL
       ORDER BY 
         CASE priority 
           WHEN 'critical' THEN 1 
           WHEN 'high' THEN 2 
           WHEN 'normal' THEN 3 
           ELSE 4 
         END, 
         created_at DESC`,
      [this.agentId]
    );

    return result.rows.map(row => ({
      id: row.id,
      fromAgent: row.from_ai,
      fromAgentName: row.metadata?.agentName as string | undefined,
      message: row.content,
      target: row.to_ai,
      priority: row.priority as BroadcastPriority,
      gitHash: row.git_hash || undefined,
      gitBranch: row.git_branch || undefined,
      environment: row.environment,
      createdAt: row.created_at,
    }));
  }

  async markAllAsRead(): Promise<number> {
    const result = await this.db.query(
      `UPDATE project_communications
       SET read_at = NOW()
       WHERE message_type = 'broadcast'
         AND (to_ai = 'all-ais' OR to_ai = 'all' OR to_ai = $1 OR from_ai = $1)
         AND read_at IS NULL`,
      [this.agentId]
    );

    return result.rowCount || 0;
  }

  async getCriticalBroadcasts(): Promise<Broadcast[]> {
    return this.getBroadcasts(10, 'critical');
  }

  async hasUnreadCritical(): Promise<boolean> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM project_communications
       WHERE message_type = 'broadcast'
         AND priority = 'critical'
         AND (to_ai = 'all-ais' OR to_ai = 'all' OR to_ai = $1 OR from_ai = $1)
         AND read_at IS NULL`,
      [this.agentId]
    );
    return result.rows[0] ? parseInt(result.rows[0].count, 10) > 0 : false;
  }
}
