import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export interface TraeRecoveryConfig {
  enabled: boolean;
  checkIntervalMs: number;
  failedTaskResetDelayMs: number;
  maxAutoRetries: number;
  dlqRetryDelayMs: number;
  minTasksForRecovery: number;
}

const DEFAULT_CONFIG: TraeRecoveryConfig = {
  enabled: true,
  checkIntervalMs: 60000,
  failedTaskResetDelayMs: 300000,
  maxAutoRetries: 3,
  dlqRetryDelayMs: 300000,
  minTasksForRecovery: 1,
};

export class TraeAutoRecoveryService {
  private db: Pool;
  private config: TraeRecoveryConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(db: Pool, config: Partial<TraeRecoveryConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('[TraeAutoRecovery] Service already running');
      return;
    }

    logger.info('[TraeAutoRecovery] Starting automatic recovery service');
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      this.runRecoveryCycle().catch(error => {
        logger.error('[TraeAutoRecovery] Recovery cycle error:', error);
      });
    }, this.config.checkIntervalMs);

    this.runRecoveryCycle().catch(error => {
      logger.error('[TraeAutoRecovery] Initial recovery cycle error:', error);
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('[TraeAutoRecovery] Service stopped');
  }

  private async runRecoveryCycle(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    logger.debug('[TraeAutoRecovery] Running recovery cycle');

    const results = await Promise.allSettled([
      this.recoverFailedTasks(),
      this.recoverStuckTasks(),
      this.retryDLQItems(),
    ]);

    const summary = {
      failedTasks: results[0].status === 'fulfilled' ? results[0].value : 0,
      stuckTasks: results[1].status === 'fulfilled' ? results[1].value : 0,
      dlqItems: results[2].status === 'fulfilled' ? results[2].value : 0,
    };

    if (summary.failedTasks > 0 || summary.stuckTasks > 0 || summary.dlqItems > 0) {
      logger.info('[TraeAutoRecovery] Recovery cycle complete:', summary);
    }
  }

  async recoverFailedTasks(): Promise<number> {
    const result = await this.db.query<{
      id: string;
      title: string;
      retry_count: number;
      error_category: string;
    }>(
      `UPDATE tasks 
       SET status = 'PENDING', 
           error = NULL,
           next_retry_at = NOW() + ($3 || ' seconds')::INTERVAL,
           updated_at = NOW()
       WHERE status = 'FAILED'
         AND retry_count < $1
         AND completed_at < NOW() - ($2 || ' seconds')::INTERVAL
         AND error_category NOT IN ('FATAL', 'PERMANENT', 'INVALID_INPUT')
       RETURNING id, title, retry_count, error_category`,
      [this.config.maxAutoRetries, this.config.failedTaskResetDelayMs / 1000, 60]
    );

    if (result.rows.length > 0) {
      logger.info(
        `[TraeAutoRecovery] Recovered ${result.rows.length} failed tasks:`,
        result.rows.map(r => r.title)
      );
    }

    return result.rows.length;
  }

  async recoverStuckTasks(): Promise<number> {
    const result = await this.db.query<{
      id: string;
      title: string;
      running_duration_seconds: number;
    }>(
      `UPDATE tasks 
       SET status = 'PENDING', 
            error = 'Auto-recovered: stuck in RUNNING state',
            retry_count = COALESCE(retry_count, 0) + 1,
            updated_at = NOW()
        WHERE status = 'RUNNING'
          AND started_at < NOW() - INTERVAL '10 minutes'
          AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '5 minutes')
        RETURNING id, title,
         EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER as running_duration_seconds`,
      []
    );

    if (result.rows.length > 0) {
      logger.warn(
        `[TraeAutoRecovery] Recovered ${result.rows.length} stuck tasks:`,
        result.rows.map(r => ({
          title: r.title,
          duration: `${Math.floor(r.running_duration_seconds / 60)}m`,
        }))
      );
    }

    return result.rows.length;
  }

  async retryDLQItems(): Promise<number> {
    const dlqCheck = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM dead_letter_queue WHERE resolved = false`
    );

    const dlqCount = parseInt(dlqCheck.rows[0]?.count || '0', 10);

    if (dlqCount === 0) {
      return 0;
    }

    const serviceHealth = await this.checkServiceHealth();

    if (!serviceHealth.healthy) {
      logger.debug('[TraeAutoRecovery] Service not healthy, skipping DLQ retry');
      return 0;
    }

    const dlqItems = await this.db.query<{
      id: string;
      original_task_id: string;
      title: string;
      description: string;
      error_message: string;
      retry_count: number;
    }>(
      `SELECT id, original_task_id, title, description, error_message, retry_count
       FROM dead_letter_queue 
       WHERE resolved = false
         AND retry_count < $1
         AND failed_at < NOW() - ($2 || ' seconds')::INTERVAL
       ORDER BY failed_at ASC
       LIMIT 10`,
      [this.config.maxAutoRetries, this.config.dlqRetryDelayMs / 1000]
    );

    if (dlqItems.rows.length === 0) {
      return 0;
    }

    let successCount = 0;
    const createdBy = 'trae-auto-recovery';

    for (const item of dlqItems.rows) {
      try {
        const newTaskId = crypto.randomUUID();

        await this.db.query(
          `INSERT INTO tasks (id, title, description, status, priority, error, created_by)
           VALUES ($1, $2, $3, 'PENDING', 10, $4, $5)`,
          [
            newTaskId,
            `[AUTO-RETRY] ${item.title}`,
            item.description || '',
            `Auto-retry from DLQ: ${item.error_message}`,
            createdBy,
          ]
        );

        await this.db.query(
          `UPDATE dead_letter_queue 
           SET resolved = true, 
               review_status = 'resolved', 
               resolution_notes = 'Auto-retried by TraeAutoRecoveryService'
           WHERE id = $1`,
          [item.id]
        );

        logger.info(`[TraeAutoRecovery] Auto-retried DLQ item: ${item.title}`);
        successCount++;
      } catch (error) {
        logger.error(`[TraeAutoRecovery] Failed to retry DLQ item ${item.title}:`, error);
      }
    }

    return successCount;
  }

  private async checkServiceHealth(): Promise<{ healthy: boolean; latency?: number }> {
    try {
      const start = Date.now();
      const response = await fetch('http://localhost:4098/health', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;

      return {
        healthy: response.ok,
        latency,
      };
    } catch {
      return { healthy: false };
    }
  }

  async getRecoveryStats(): Promise<{
    failedTasksRecoverable: number;
    stuckTasks: number;
    dlqItemsPending: number;
    lastRecoveryAt: Date | null;
  }> {
    const [failed, stuck, dlq, lastRecovery] = await Promise.all([
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) FROM tasks 
         WHERE status = 'FAILED' 
         AND retry_count < $1
         AND error_category NOT IN ('FATAL', 'PERMANENT', 'INVALID_INPUT')`,
        [this.config.maxAutoRetries]
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) FROM tasks 
         WHERE status = 'RUNNING' 
         AND started_at < NOW() - INTERVAL '10 minutes'`
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) FROM dead_letter_queue WHERE resolved = false`
      ),
      this.db.query<{ created_at: Date }>(
        `SELECT created_at FROM tasks 
         WHERE created_by = 'trae-auto-recovery'
         ORDER BY created_at DESC 
         LIMIT 1`
      ),
    ]);

    return {
      failedTasksRecoverable: parseInt(failed.rows[0]?.count || '0', 10),
      stuckTasks: parseInt(stuck.rows[0]?.count || '0', 10),
      dlqItemsPending: parseInt(dlq.rows[0]?.count || '0', 10),
      lastRecoveryAt: lastRecovery.rows[0]?.created_at || null,
    };
  }
}
