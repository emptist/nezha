// NezhaCore - Main entry point for the Nezha autonomous agent system

import { DatabaseClient } from './db/DatabaseClient.js';
import { Config } from './config/Config.js';
import { HeartbeatService } from './services/HeartbeatService.js';
import { EventBus } from './core/EventBus.js';
import { Scheduler } from './core/Scheduler.js';
import { AgentSystem, type AgentSystemConfig } from './core/AgentSystem.js';
import { EncryptionService } from './services/EncryptionService.js';

export interface NezhaCoreConfig {
  heartbeatIntervalMs?: number;
  workspaceDir?: string;
  agentSystemConfig?: AgentSystemConfig;
}

export class NezhaCore {
  private db: DatabaseClient | null = null;
  private heartbeatService: HeartbeatService | null = null;
  private eventBus: EventBus;
  private scheduler: Scheduler | null = null;
  private agentSystem: AgentSystem | null = null;
  private config: Config;

  constructor() {
    this.config = Config.getInstance();
    this.eventBus = new EventBus();
  }

  async initialize(config?: NezhaCoreConfig): Promise<void> {
    const encryptionService = EncryptionService.getInstance();
    await encryptionService.initialize();

    this.db = new DatabaseClient(this.config);
    this.scheduler = new Scheduler(this.db, config?.heartbeatIntervalMs);
    this.heartbeatService = new HeartbeatService(
      this.db,
      {
        heartbeatIntervalMs: config?.heartbeatIntervalMs,
        workspaceDir: config?.workspaceDir,
      },
      this.scheduler
    );
    this.agentSystem = new AgentSystem(config?.agentSystemConfig, this.eventBus);
  }

  async start(): Promise<void> {
    if (!this.db || !this.heartbeatService || !this.scheduler || !this.agentSystem) {
      throw new Error('NezhaCore not initialized. Call initialize() first.');
    }
    await this.agentSystem.start();
    if (this.heartbeatService) {
      await this.heartbeatService.start();
    }
  }

  async stop(): Promise<void> {
    if (this.agentSystem) {
      await this.agentSystem.stop();
    }
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

  getAgentSystem(): AgentSystem | null {
    return this.agentSystem;
  }

  isRunning(): boolean {
    return this.heartbeatService?.isRunning() ?? false;
  }
}
