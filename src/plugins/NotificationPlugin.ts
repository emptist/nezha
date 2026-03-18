// Notification Plugin - sends notifications on task events

import { Plugin, TaskContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';

export interface NotificationConfig {
  onTaskStart?: boolean;
  onTaskComplete?: boolean;
  onTaskError?: boolean;
  webhookUrl?: string;
}

export class NotificationPlugin implements Plugin {
  name = 'notification';
  version = '1.0.0';
  description = 'Sends notifications on task events';
  config: Record<string, unknown>;
  
  constructor(config: NotificationConfig = {}) {
    this.config = {
      onTaskStart: config.onTaskStart ?? false,
      onTaskComplete: config.onTaskComplete ?? true,
      onTaskError: config.onTaskError ?? true,
      webhookUrl: config.webhookUrl,
    };
  }
  
  hooks = {
    beforeTask: async (context: TaskContext) => {
      if (!this.config.onTaskStart) return;
      
      logger.info(`[NotificationPlugin] Task starting: ${context.title}`);
      await this.sendNotification(`Task Started: ${context.title}`, context.description || '');
    },
    
    afterTask: async (context: TaskContext) => {
      if (!this.config.onTaskComplete) return;
      
      const status = context.status === 'COMPLETED' ? '✅ Completed' : '⚠️ Failed';
      logger.info(`[NotificationPlugin] Task ${context.status}: ${context.title}`);
      
      await this.sendNotification(
        `${status}: ${context.title}`,
        context.result || context.error || 'No result'
      );
    },
    
    onError: async (context: TaskContext, error: Error) => {
      if (!this.config.onTaskError) return;
      
      logger.error(`[NotificationPlugin] Task error: ${context.title}`, error.message);
      
      await this.sendNotification(
        `❌ Error: ${context.title}`,
        error.message
      );
    },
  };
  
  private async sendNotification(title: string, message: string): Promise<void> {
    const webhookUrl = this.config.webhookUrl as string | undefined;
    if (!webhookUrl) {
      logger.debug(`[NotificationPlugin] No webhook configured, skipping notification`);
      return;
    }
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message }),
      });
      
      if (!response.ok) {
        logger.warn(`[NotificationPlugin] Webhook failed: ${response.status}`);
      }
    } catch (error) {
      logger.error(`[NotificationPlugin] Failed to send notification:`, error);
    }
  }
}
