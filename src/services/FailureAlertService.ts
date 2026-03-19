import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, TASK_STATUS, ALERT_CONFIG } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';
import { categorizeError } from '../utils/ErrorClassifier.js';

export enum AlertType {
  REPEATED_FAILURE = 'repeated_failure',
  STUCK_TASK = 'stuck_task',
  DLQ_THRESHOLD = 'dlq_threshold',
  WATCHDOG_KILL = 'watchdog_kill',
  CONSECUTIVE_FAILURES = 'consecutive_failures',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AlertConfig {
  repeatedFailureThreshold?: number;
  stuckTaskThresholdSeconds?: number;
  dlqSizeThreshold?: number;
  consecutiveFailureThreshold?: number;
  checkIntervalMs?: number;
  autoAcknowledgeAfterMs?: number;
  enableWebhooks?: boolean;
}

export interface FailureAlert {
  id: string;
  alertType: AlertType;
  taskId?: string;
  originalTaskId?: string;
  title: string;
  errorCategory?: string;
  errorMessage?: string;
  failureCount: number;
  threshold: number;
  severity: AlertSeverity;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  createdAt: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  alertType: AlertType;
  threshold: number;
  severity: AlertSeverity;
  enabled: boolean;
  webhookUrl?: string;
  cooldownMs: number;
  lastAlertAt?: Date;
}

export class FailureAlertService extends EventEmitter {
  private readonly db: DatabaseClient;
  private readonly repeatedFailureThreshold: number;
  private readonly stuckTaskThresholdSeconds: number;
  private readonly dlqSizeThreshold: number;
  private readonly consecutiveFailureThreshold: number;
  private readonly checkIntervalMs: number;
  private readonly autoAcknowledgeAfterMs: number;
  private readonly enableWebhooks: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private alertRules: Map<AlertType, AlertRule> = new Map();
  private recentAlerts: Map<string, Date> = new Map();
  private webhookCallback?: (alert: FailureAlert) => Promise<void>;

  constructor(db: DatabaseClient, config?: AlertConfig) {
    super();
    this.db = db;
    this.repeatedFailureThreshold =
      config?.repeatedFailureThreshold ?? ALERT_CONFIG.REPEATED_FAILURE_THRESHOLD;
    this.stuckTaskThresholdSeconds =
      config?.stuckTaskThresholdSeconds ?? ALERT_CONFIG.STUCK_TASK_THRESHOLD_SECONDS;
    this.dlqSizeThreshold = config?.dlqSizeThreshold ?? ALERT_CONFIG.DLQ_SIZE_THRESHOLD;
    this.consecutiveFailureThreshold =
      config?.consecutiveFailureThreshold ?? ALERT_CONFIG.CONSECUTIVE_FAILURE_THRESHOLD;
    this.checkIntervalMs = config?.checkIntervalMs ?? ALERT_CONFIG.CHECK_INTERVAL_MS;
    this.autoAcknowledgeAfterMs =
      config?.autoAcknowledgeAfterMs ?? ALERT_CONFIG.AUTO_ACKNOWLEDGE_AFTER_MS;
    this.enableWebhooks = config?.enableWebhooks ?? true;

    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    this.alertRules.set(AlertType.REPEATED_FAILURE, {
      id: 'default-repeated-failure',
      name: 'Repeated Failure Alert',
      alertType: AlertType.REPEATED_FAILURE,
      threshold: this.repeatedFailureThreshold,
      severity: AlertSeverity.MEDIUM,
      enabled: true,
      cooldownMs: 300000,
    });

    this.alertRules.set(AlertType.STUCK_TASK, {
      id: 'default-stuck-task',
      name: 'Stuck Task Alert',
      alertType: AlertType.STUCK_TASK,
      threshold: this.stuckTaskThresholdSeconds,
      severity: AlertSeverity.HIGH,
      enabled: true,
      cooldownMs: 60000,
    });

    this.alertRules.set(AlertType.DLQ_THRESHOLD, {
      id: 'default-dlq-threshold',
      name: 'DLQ Size Threshold Alert',
      alertType: AlertType.DLQ_THRESHOLD,
      threshold: this.dlqSizeThreshold,
      severity: AlertSeverity.HIGH,
      enabled: true,
      cooldownMs: 3600000,
    });

    this.alertRules.set(AlertType.CONSECUTIVE_FAILURES, {
      id: 'default-consecutive-failures',
      name: 'Consecutive Failures Alert',
      alertType: AlertType.CONSECUTIVE_FAILURES,
      threshold: this.consecutiveFailureThreshold,
      severity: AlertSeverity.CRITICAL,
      enabled: true,
      cooldownMs: 300000,
    });
  }

  setWebhookCallback(callback: (alert: FailureAlert) => Promise<void>): void {
    this.webhookCallback = callback;
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('FailureAlertService already running');
      return;
    }

    this.isRunning = true;
    this.timer = setInterval(() => {
      this.checkForAlerts().catch(err => {
        logger.error('Alert check failed:', err);
      });
    }, this.checkIntervalMs);

    logger.info(`FailureAlertService started (interval: ${this.checkIntervalMs}ms)`);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    logger.info('FailureAlertService stopped');
  }

  async createAlert(
    alertType: AlertType,
    title: string,
    options?: {
      taskId?: string;
      originalTaskId?: string;
      errorCategory?: string;
      errorMessage?: string;
      failureCount?: number;
      threshold?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<FailureAlert | null> {
    const rule = this.alertRules.get(alertType);
    if (!rule || !rule.enabled) {
      return null;
    }

    const cooldownKey = `${alertType}:${options?.taskId || options?.originalTaskId}`;
    const lastAlert = this.recentAlerts.get(cooldownKey);
    if (lastAlert && Date.now() - lastAlert.getTime() < rule.cooldownMs) {
      logger.debug(`Alert ${alertType} on cooldown (${cooldownKey})`);
      return null;
    }

    const threshold = options?.threshold ?? rule.threshold;
    const failureCount = options?.failureCount ?? threshold;
    const severity = this.calculateSeverity(alertType, failureCount, threshold);

    try {
      const result = await this.db.query<{
        id: string;
        alert_type: string;
        task_id: string | null;
        title: string;
        error_category: string | null;
        error_message: string | null;
        failure_count: number;
        threshold: number;
        acknowledged: boolean;
        created_at: Date;
      }>(
        `INSERT INTO failure_alerts (alert_type, task_id, original_task_id, title, error_category, error_message, failure_count, threshold, alert_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          alertType,
          options?.taskId ?? null,
          options?.originalTaskId ?? null,
          title,
          options?.errorCategory ?? null,
          options?.errorMessage ?? null,
          failureCount,
          threshold,
          JSON.stringify(options?.metadata ?? {}),
        ]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0]!;
      const alert: FailureAlert = {
        id: row.id,
        alertType: row.alert_type as AlertType,
        taskId: row.task_id ?? undefined,
        title: row.title,
        errorCategory: row.error_category ?? undefined,
        errorMessage: row.error_message ?? undefined,
        failureCount: row.failure_count,
        threshold: row.threshold,
        severity,
        acknowledged: row.acknowledged,
        createdAt: row.created_at,
      };

      this.recentAlerts.set(cooldownKey, new Date());
      this.emit('alert', alert);

      if (this.enableWebhooks && this.webhookCallback) {
        this.webhookCallback(alert).catch(err => {
          logger.error('Webhook callback failed:', err);
        });
      }

      logger.warn(`Alert created: ${alertType} - ${title} (severity: ${severity})`);
      return alert;
    } catch (error) {
      logger.error('Failed to create alert:', error);
      return null;
    }
  }

  private calculateSeverity(alertType: AlertType, count: number, threshold: number): AlertSeverity {
    const ratio = count / threshold;

    switch (alertType) {
      case AlertType.CONSECUTIVE_FAILURES:
        return ratio >= 2
          ? AlertSeverity.CRITICAL
          : ratio >= 1.5
            ? AlertSeverity.HIGH
            : AlertSeverity.MEDIUM;
      case AlertType.STUCK_TASK:
        return AlertSeverity.HIGH;
      case AlertType.DLQ_THRESHOLD:
        return ratio >= 2 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH;
      default:
        return ratio >= 2
          ? AlertSeverity.HIGH
          : ratio >= 1
            ? AlertSeverity.MEDIUM
            : AlertSeverity.LOW;
    }
  }

  async checkForAlerts(): Promise<void> {
    if (!this.isRunning) return;

    await this.checkRepeatedFailures();
    await this.checkStuckTasks();
    await this.checkDLQSize();
    await this.checkConsecutiveFailures();
    await this.autoAcknowledgeOldAlerts();
  }

  private async checkRepeatedFailures(): Promise<void> {
    const result = await this.db.query<{
      id: string;
      title: string;
      error_category: string | null;
      error: string | null;
      consecutive_failures: number;
    }>(
      `SELECT id, title, error_category, error, consecutive_failures
       FROM ${DATABASE_TABLES.TASKS}
       WHERE consecutive_failures >= $1
       AND error IS NOT NULL
       ORDER BY consecutive_failures DESC
       LIMIT 10`,
      [this.repeatedFailureThreshold]
    );

    for (const task of result.rows) {
      await this.createAlert(AlertType.REPEATED_FAILURE, `Task repeated failures: ${task.title}`, {
        taskId: task.id,
        errorCategory: task.error_category ?? undefined,
        errorMessage: task.error ?? undefined,
        failureCount: task.consecutive_failures,
        threshold: this.repeatedFailureThreshold,
      });
    }
  }

  private async checkStuckTasks(): Promise<void> {
    const result = await this.db.query<{
      id: string;
      title: string;
      started_at: Date | null;
    }>(
      `SELECT id, title, started_at
       FROM ${DATABASE_TABLES.TASKS}
       WHERE status = $1
       AND is_stuck = true
       LIMIT 10`,
      [TASK_STATUS.RUNNING]
    );

    for (const task of result.rows) {
      await this.createAlert(AlertType.STUCK_TASK, `Task stuck: ${task.title}`, {
        taskId: task.id,
        metadata: { startedAt: task.started_at },
      });
    }
  }

  private async checkDLQSize(): Promise<void> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM dead_letter_queue WHERE resolved = false`
    );

    const count = parseInt(result.rows[0]?.count || '0', 10);

    if (count >= this.dlqSizeThreshold) {
      await this.createAlert(
        AlertType.DLQ_THRESHOLD,
        `DLQ size threshold exceeded: ${count} items`,
        {
          failureCount: count,
          threshold: this.dlqSizeThreshold,
          metadata: { dlqSize: count },
        }
      );
    }
  }

  private async checkConsecutiveFailures(): Promise<void> {
    const result = await this.db.query<{
      id: string;
      title: string;
      error_category: string | null;
      error: string | null;
      consecutive_failures: number;
    }>(
      `SELECT id, title, error_category, error, consecutive_failures
       FROM ${DATABASE_TABLES.TASKS}
       WHERE consecutive_failures >= $1
       ORDER BY consecutive_failures DESC
       LIMIT 5`,
      [this.consecutiveFailureThreshold]
    );

    for (const task of result.rows) {
      await this.createAlert(
        AlertType.CONSECUTIVE_FAILURES,
        `Consecutive failures: ${task.title}`,
        {
          taskId: task.id,
          errorCategory: task.error_category ?? undefined,
          errorMessage: task.error ?? undefined,
          failureCount: task.consecutive_failures,
          threshold: this.consecutiveFailureThreshold,
          metadata: { severity: 'critical' },
        }
      );
    }
  }

  private async autoAcknowledgeOldAlerts(): Promise<void> {
    if (this.autoAcknowledgeAfterMs <= 0) return;

    await this.db.query(
      `UPDATE failure_alerts
       SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = 'system:auto-acknowledge'
       WHERE acknowledged = false
       AND created_at < NOW() - ($1 || ' milliseconds')::INTERVAL`,
      [this.autoAcknowledgeAfterMs]
    );
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    try {
      const result = await this.db.query(
        `UPDATE failure_alerts
         SET acknowledged = true, acknowledged_by = $2, acknowledged_at = NOW()
         WHERE id = $1`,
        [alertId, acknowledgedBy]
      );
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to acknowledge alert:', error);
      return false;
    }
  }

  async getUnacknowledgedAlerts(limit?: number): Promise<FailureAlert[]> {
    const result = await this.db.query<{
      id: string;
      alert_type: string;
      task_id: string | null;
      original_task_id: string | null;
      title: string;
      error_category: string | null;
      error_message: string | null;
      failure_count: number;
      threshold: number;
      acknowledged: boolean;
      acknowledged_by: string | null;
      acknowledged_at: Date | null;
      created_at: Date;
    }>(
      `SELECT * FROM failure_alerts
       WHERE acknowledged = false
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit ?? 50]
    );

    return result.rows.map(row => {
      const r = row!;
      return {
        id: r.id,
        alertType: r.alert_type as AlertType,
        taskId: r.task_id ?? undefined,
        originalTaskId: r.original_task_id ?? undefined,
        title: r.title,
        errorCategory: r.error_category ?? undefined,
        errorMessage: r.error_message ?? undefined,
        failureCount: r.failure_count,
        threshold: r.threshold,
        severity: this.calculateSeverity(r.alert_type as AlertType, r.failure_count, r.threshold),
        acknowledged: r.acknowledged,
        acknowledgedBy: r.acknowledged_by ?? undefined,
        acknowledgedAt: r.acknowledged_at ?? undefined,
        createdAt: r.created_at,
      };
    });
  }

  async categorizeAndRecordFailure(
    taskId: string,
    title: string,
    error: Error | string,
    retryCount: number = 0
  ): Promise<string> {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const categorized = categorizeError(error instanceof Error ? error : new Error(errorMessage));
    const category = categorized.category;

    await this.db.query(`SELECT track_task_failure($1, $2, $3, $4)`, [
      taskId,
      errorMessage,
      category,
      retryCount,
    ]);

    if (categorized.retryable && retryCount > 0) {
      await this.createAlert(AlertType.REPEATED_FAILURE, `Retryable failure: ${title}`, {
        taskId,
        errorCategory: category,
        errorMessage: errorMessage,
        failureCount: retryCount,
        metadata: {
          retryable: categorized.retryable,
          troubleshooting: categorized.troubleshooting,
        },
      });
    }

    return category;
  }

  async getAlertStats(): Promise<{
    total: number;
    unacknowledged: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    const total = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM failure_alerts`
    );
    const unack = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM failure_alerts WHERE acknowledged = false`
    );

    const byTypeResult = await this.db.query<{ alert_type: string; count: string }>(
      `SELECT alert_type, COUNT(*) as count FROM failure_alerts GROUP BY alert_type`
    );

    const bySeverityResult = await this.db.query<{ severity: string; count: string }>(
      `SELECT 
         CASE
           WHEN failure_count >= threshold * 2 THEN 'critical'
           WHEN failure_count >= threshold * 1.5 THEN 'high'
           WHEN failure_count >= threshold THEN 'medium'
           ELSE 'low'
         END as severity,
         COUNT(*) as count
       FROM failure_alerts
       WHERE acknowledged = false
       GROUP BY severity`
    );

    return {
      total: parseInt(total.rows[0]?.count || '0', 10),
      unacknowledged: parseInt(unack.rows[0]?.count || '0', 10),
      byType: Object.fromEntries(byTypeResult.rows.map(r => [r.alert_type, parseInt(r.count, 10)])),
      bySeverity: Object.fromEntries(
        bySeverityResult.rows.map(r => [r.severity, parseInt(r.count, 10)])
      ),
    };
  }

  updateRule(alertType: AlertType, updates: Partial<AlertRule>): void {
    const rule = this.alertRules.get(alertType);
    if (rule) {
      this.alertRules.set(alertType, { ...rule, ...updates });
    }
  }

  getRule(alertType: AlertType): AlertRule | undefined {
    return this.alertRules.get(alertType);
  }
}
