import { DatabaseClient } from '../db/DatabaseClient.js';
import { BroadcastService } from '../services/BroadcastService.js';
import { logger } from '../utils/logger.js';

export interface NotificationServerOptions {
  db: DatabaseClient;
  pollIntervalMs?: number;
  onNotification?: (notification: Notification) => void;
}

export interface Notification {
  type: 'nezha-broadcast';
  id: string;
  from: string;
  priority: string;
  content: string;
  timestamp: string;
}

export class NotificationServer {
  private readonly db: DatabaseClient;
  private readonly pollIntervalMs: number;
  private readonly onNotification?: (notification: Notification) => void;
  private lastCheckedAt: Date;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: NotificationServerOptions) {
    this.db = options.db;
    this.pollIntervalMs = options.pollIntervalMs ?? 10000;
    this.onNotification = options.onNotification;
    this.lastCheckedAt = new Date();
  }

  async start(): Promise<void> {
    logger.info(`[NotificationServer] Starting (poll: ${this.pollIntervalMs}ms)`);

    this.timer = setInterval(async () => {
      await this.checkNewBroadcasts();
    }, this.pollIntervalMs);

    await this.checkNewBroadcasts();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[NotificationServer] Stopped');
  }

  private async checkNewBroadcasts(): Promise<void> {
    try {
      const result = await this.db.query<{
        id: string;
        content: string;
        from_ai: string;
        priority: string;
      }>(
        `SELECT id, content, from_ai, priority 
         FROM project_communications 
         WHERE message_type = 'broadcast' 
           AND created_at > $1
         ORDER BY created_at DESC`,
        [this.lastCheckedAt.toISOString()]
      );

      if (result.rows.length > 0) {
        for (const row of result.rows) {
          this.notifyClient(row);
        }
        this.lastCheckedAt = new Date();
      }
    } catch (error) {
      logger.debug('[NotificationServer] Poll error:', error);
    }
  }

  private notifyClient(broadcast: {
    id: string;
    content: string;
    from_ai: string;
    priority: string;
  }): void {
    logger.info(`[NotificationServer] New broadcast: ${broadcast.content.substring(0, 50)}...`);

    const notification: Notification = {
      type: 'nezha-broadcast',
      id: broadcast.id,
      from: broadcast.from_ai,
      priority: broadcast.priority,
      content: broadcast.content,
      timestamp: new Date().toISOString(),
    };

    if (this.onNotification) {
      this.onNotification(notification);
    }

    console.log(JSON.stringify(notification));
  }
}

const main = async () => {
  const { Config } = await import('../config/Config.js');
  const config = Config.getInstance();
  const db = new DatabaseClient(config);
  const server = new NotificationServer({ db, pollIntervalMs: 10000 });

  await server.start();

  process.on('SIGINT', () => {
    server.stop();
    db.close();
    process.exit(0);
  });
};

main().catch(console.error);
