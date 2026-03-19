import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { TASK_STATUS } from '../config/constants.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';

export interface DaemonState {
  version: string;
  savedAt: string;
  opencodeSessionId?: string;
  stats: {
    tasksExecuted: number;
    tasksSucceeded: number;
    tasksFailed: number;
    reconnectAttempts: number;
  };
  dailyMemoryPath?: string;
  isPaused: boolean;
  pauseUntil?: string;
  transportMode?: 'http' | 'cli';
  agentSessionId?: string;
}

export interface CheckpointServiceConfig {
  stateFilePath?: string;
}

export class CheckpointService {
  private readonly stateFilePath: string;
  private currentSessionId?: string;
  private agentSessionId?: string;
  private transportMode?: 'http' | 'cli';
  private stats = {
    tasksExecuted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    reconnectAttempts: 0,
  };
  private isPaused: boolean = false;
  private pauseUntil?: Date;

  constructor(config?: CheckpointServiceConfig) {
    this.stateFilePath =
      config?.stateFilePath || path.join(process.cwd(), '.tmp', 'nezha-state.json');
  }

  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  getSessionId(): string | undefined {
    return this.currentSessionId;
  }

  setAgentSessionId(sessionId: string): void {
    this.agentSessionId = sessionId;
  }

  getAgentSessionId(): string | undefined {
    return this.agentSessionId;
  }

  setTransportMode(mode: 'http' | 'cli'): void {
    this.transportMode = mode;
  }

  getTransportMode(): 'http' | 'cli' | undefined {
    return this.transportMode;
  }

  updateStats(stats: Partial<typeof this.stats>): void {
    this.stats = { ...this.stats, ...stats };
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  setPaused(isPaused: boolean, pauseUntil?: Date): void {
    this.isPaused = isPaused;
    this.pauseUntil = pauseUntil;
  }

  async saveState(dailyMemoryPath?: string): Promise<void> {
    const state: DaemonState = {
      version: '1.0.0',
      savedAt: new Date().toISOString(),
      opencodeSessionId: this.currentSessionId,
      stats: { ...this.stats },
      dailyMemoryPath,
      isPaused: this.isPaused,
      pauseUntil: this.pauseUntil?.toISOString(),
      transportMode: this.transportMode,
      agentSessionId: this.agentSessionId,
    };

    try {
      const dir = path.dirname(this.stateFilePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
      logger.info(`State saved to ${this.stateFilePath}`);
    } catch (error) {
      logger.error('Failed to save state:', error);
    }
  }

  async loadState(): Promise<DaemonState | null> {
    try {
      const exists = await fs
        .access(this.stateFilePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        logger.debug('No saved state found');
        return null;
      }

      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content) as DaemonState;

      this.currentSessionId = state.opencodeSessionId;
      this.agentSessionId = state.agentSessionId;
      this.transportMode = state.transportMode;
      this.stats = { ...state.stats };
      this.isPaused = state.isPaused;
      this.pauseUntil = state.pauseUntil ? new Date(state.pauseUntil) : undefined;

      logger.info(`State loaded from ${this.stateFilePath}`);
      return state;
    } catch (error) {
      logger.error('Failed to load state:', error);
      return null;
    }
  }

  async clearState(): Promise<void> {
    try {
      await fs.unlink(this.stateFilePath);
      logger.info('State cleared');
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async resetRunningTasks(db: DatabaseClient): Promise<number> {
    try {
      const result = await db.query(
        `UPDATE tasks SET status = $1, updated_at = NOW() WHERE status = $2`,
        [TASK_STATUS.PENDING, TASK_STATUS.RUNNING]
      );
      const count = result.rowCount ?? 0;
      if (count > 0) {
        logger.info(`Reset ${count} RUNNING tasks to PENDING`);
      }
      return count;
    } catch (error) {
      logger.error('Failed to reset running tasks:', error);
      return 0;
    }
  }
}
