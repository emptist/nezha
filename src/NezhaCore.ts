// NezhaCore - Main entry point for the Nezha autonomous agent system

import { DatabaseClient } from './db/DatabaseClient.js';
import { Config } from './config/Config.js';
import { HeartbeatService } from './services/HeartbeatService.js';
import { EventBus } from './core/EventBus.js';
import { Scheduler } from './core/Scheduler.js';

export interface NezhaCoreConfig {
  heartbeatIntervalMs?: number;
  workspaceDir?: string;
}

export class NezhaCore {
  private db: DatabaseClient | null = null;
  private heartbeatService: HeartbeatService | null = null;
  private eventBus: EventBus;
  private scheduler: Scheduler | null = null;
  private config: Config;

  constructor() {
    this.config = Config.getInstance();
    this.eventBus = new EventBus();
  }

  async initialize(config?: NezhaCoreConfig): Promise<void> {
    this.db = new DatabaseClient(this.config);
    this.scheduler = new Scheduler(this.db, config?.heartbeatIntervalMs);
    this.heartbeatService = new HeartbeatService(this.db, {
      heartbeatIntervalMs: config?.heartbeatIntervalMs,
      workspaceDir: config?.workspaceDir,
    }, this.scheduler);
  }

  async start(): Promise<void> {
    if (this.heartbeatService) {
      await this.heartbeatService.start();
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatService) {
      await this.heartbeatService.stop();
    }
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  getScheduler(): Scheduler | null {
    return this.scheduler;
  }

  isRunning(): boolean {
    return this.heartbeatService?.isRunning() ?? false;
  }
}
