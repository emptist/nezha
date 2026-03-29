// NezhaCore - Main entry point for the Nezha autonomous agent system

import { DatabaseClient } from './db/DatabaseClient.js';
import { Config } from './config/Config.js';
import { HeartbeatService } from './services/heartbeat/index.js';
import { Scheduler } from './core/Scheduler.js';
import { EncryptionService } from './services/EncryptionService.js';

export interface NezhaCoreConfig {
  heartbeatIntervalMs?: number;
  workspaceDir?: string;
  enablePi?: boolean;
}

export class NezhaCore {
  private db: DatabaseClient | null = null;
  private heartbeatService: HeartbeatService | null = null;
  private scheduler: Scheduler | null = null;
  private config: Config;

  constructor() {
    this.config = Config.getInstance();
  }

  async initialize(config?: NezhaCoreConfig): Promise<void> {
    const encryptionService = EncryptionService.getInstance();
    await encryptionService.initialize();

    this.db = new DatabaseClient(this.config);
    this.scheduler = new Scheduler(this.db, config?.heartbeatIntervalMs);
    this.heartbeatService = new HeartbeatService(this.db, {
      heartbeatIntervalMs: config?.heartbeatIntervalMs,
      enablePi: config?.enablePi ?? false,
    });
  }

  async start(): Promise<void> {
    if (!this.db || !this.heartbeatService) {
      throw new Error('NezhaCore not initialized. Call initialize() first.');
    }
    if (this.heartbeatService) {
      await this.heartbeatService.start();
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatService) {
      await this.heartbeatService.stop();
    }
  }

  getScheduler(): Scheduler | null {
    return this.scheduler;
  }

  isRunning(): boolean {
    return this.heartbeatService?.isRunning() ?? false;
  }
}
