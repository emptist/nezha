// Webhook service for task notifications

import { logger } from '../utils/logger.js';
import type { FailureAlert } from './FailureAlertService.js';

export interface WebhookConfig {
  url: string;
  secret?: string;
  retryCount?: number;
  retryDelayMs?: number;
  enabled?: boolean;
}

export interface WebhookPayload {
  event: 'task:completed' | 'task:failed';
  timestamp: string;
  task: {
    id: string;
    title: string;
    description?: string;
    status: string;
    result?: string;
    error?: string;
    duration_ms?: number;
  };
}

export interface AlertWebhookPayload {
  event: 'alert:created' | 'alert:acknowledged';
  timestamp: string;
  alert: {
    id: string;
    alertType: string;
    title: string;
    severity: string;
    errorCategory?: string;
    errorMessage?: string;
    failureCount: number;
    taskId?: string;
    acknowledged?: boolean;
  };
}

export class WebhookService {
  private config: WebhookConfig;
  private retryCount: number;
  private retryDelayMs: number;

  constructor(config: WebhookConfig) {
    this.config = config;
    this.retryCount = config.retryCount ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
  }

  isEnabled(): boolean {
    return this.config.enabled ?? false;
  }

  async sendTaskCompleted(
    taskId: string,
    title: string,
    description: string | undefined,
    result: string
  ): Promise<boolean> {
    return this.send('task:completed', {
      event: 'task:completed',
      timestamp: new Date().toISOString(),
      task: {
        id: taskId,
        title,
        description,
        status: 'COMPLETED',
        result,
      },
    });
  }

  async sendTaskFailed(
    taskId: string,
    title: string,
    description: string | undefined,
    error: string
  ): Promise<boolean> {
    return this.send('task:failed', {
      event: 'task:failed',
      timestamp: new Date().toISOString(),
      task: {
        id: taskId,
        title,
        description,
        status: 'FAILED',
        error,
      },
    });
  }

  async sendAlert(alert: FailureAlert): Promise<boolean> {
    return this.send('alert:created', {
      event: 'alert:created',
      timestamp: new Date().toISOString(),
      alert: {
        id: alert.id,
        alertType: alert.alertType,
        title: alert.title,
        severity: alert.severity,
        errorCategory: alert.errorCategory,
        errorMessage: alert.errorMessage,
        failureCount: alert.failureCount,
        taskId: alert.taskId,
        acknowledged: alert.acknowledged,
      },
    });
  }

  private async send(event: string, payload: WebhookPayload | AlertWebhookPayload): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.debug('Webhook disabled, skipping');
      return false;
    }

    if (!this.config.url) {
      logger.warn('Webhook URL not configured');
      return false;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.secret) {
      headers['X-Webhook-Secret'] = this.config.secret;
    }

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        const response = await fetch(this.config.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          logger.info(`Webhook sent successfully: ${event}`);
          return true;
        }

        logger.warn(
          `Webhook failed (attempt ${attempt}/${this.retryCount}): ${response.status} ${response.statusText}`
        );
      } catch (error) {
        logger.error(`Webhook error (attempt ${attempt}/${this.retryCount}):`, error);
      }

      if (attempt < this.retryCount) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
      }
    }

    logger.error(`Webhook failed after ${this.retryCount} attempts: ${event}`);
    return false;
  }
}

// Environment-based webhook config
export function createWebhookConfigFromEnv(): WebhookConfig {
  const parseEnvInt = (key: string, fallback: number): number => {
    const value = process.env[key];
    if (!value) return fallback;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Invalid environment variable ${key}: "${value}" is not a valid integer`);
    }
    return parsed;
  };

  return {
    url: process.env.WEBHOOK_URL ?? '',
    secret: process.env.WEBHOOK_SECRET ?? '',
    retryCount: parseEnvInt('WEBHOOK_RETRY_COUNT', 3),
    retryDelayMs: parseEnvInt('WEBHOOK_RETRY_DELAY', 1000),
    enabled: process.env.WEBHOOK_URL ? true : false,
  };
}
