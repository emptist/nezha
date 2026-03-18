// Enhanced EventBus with async support and audit logging

import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export interface Event<T = unknown> {
  type: string;
  data: T;
  timestamp: Date;
}

export interface EventSubscription {
  id: string;
  event: string;
  handler: EventHandler;
  createdAt: Date;
}

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private subscriptions: Map<string, EventSubscription> = new Map();
  private db?: DatabaseClient;
  private eventHistory: Event[] = [];
  private maxHistorySize: number = 100;

  constructor(db?: DatabaseClient) {
    this.db = db;
  }

  setDatabase(db: DatabaseClient): void {
    this.db = db;
  }

  subscribe<T = unknown>(event: string, handler: EventHandler<T>): string {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    (this.handlers.get(event) as Set<EventHandler<T>>).add(handler as EventHandler<T>);

    const subscriptionId = `${event}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      event,
      handler: handler as EventHandler,
      createdAt: new Date(),
    });

    return subscriptionId;
  }

  unsubscribe(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  unsubscribeById(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.unsubscribe(subscription.event, subscription.handler);
      this.subscriptions.delete(subscriptionId);
      return true;
    }
    return false;
  }

  async publish<T = unknown>(event: string, data: T): Promise<void> {
    const eventData: Event<T> = {
      type: event,
      data,
      timestamp: new Date(),
    };

    this.addToHistory(eventData);

    const handlers = this.handlers.get(event);
    if (!handlers) return;

    const promises: Promise<void>[] = [];
    handlers.forEach(handler => {
      try {
        const result = handler(data);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        logger.error(`Event handler error for ${event}:`, error);
      }
    });

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    if (this.db && this.shouldLogToDb(event)) {
      await this.logToDatabase(eventData);
    }
  }

  private addToHistory<T>(event: Event<T>): void {
    this.eventHistory.push(event as Event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private shouldLogToDb(event: string): boolean {
    const loggedEvents = ['task:started', 'task:completed', 'task:failed', 'scheduler:heartbeat'];
    return loggedEvents.some(e => event.includes(e));
  }

  private async logToDatabase(event: Event): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO event_log (event_type, event_data, created_at)
         VALUES ($1, $2, $3)`,
        [event.type, JSON.stringify(event.data), event.timestamp]
      );
    } catch (error) {
      logger.error('Failed to log event to database:', error);
    }
  }

  getHistory(eventType?: string, limit: number = 50): Event[] {
    let events = this.eventHistory;
    if (eventType) {
      events = events.filter(e => e.type === eventType);
    }
    return events.slice(-limit);
  }

  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  clear(): void {
    this.handlers.clear();
    this.subscriptions.clear();
  }

  clearHistory(): void {
    this.eventHistory = [];
  }
}

// Standard event types for the system
export const NEZHA_EVENTS = {
  // Task lifecycle
  TASK_STARTED: 'task:started',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  TASK_RETRY: 'task:retry',

  // Scheduler events
  SCHEDULER_HEARTBEAT: 'scheduler:heartbeat',
  SCHEDULER_PAUSED: 'scheduler:paused',
  SCHEDULER_RESUMED: 'scheduler:resumed',

  // Agent events
  AGENT_REGISTERED: 'agent:registered',
  AGENT_UNREGISTERED: 'agent:unregistered',
  AGENT_ERROR: 'agent:error',

  // System events
  SYSTEM_STARTED: 'system:started',
  SYSTEM_STOPPED: 'system:stopped',
  HEALTH_CHECK: 'system:health:check',
} as const;

export type NezhaEventType = (typeof NEZHA_EVENTS)[keyof typeof NEZHA_EVENTS];
