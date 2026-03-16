import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatService } from '../services/HeartbeatService.js';
import { Scheduler } from '../core/Scheduler.js';
import { Agent } from '../core/Agent.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../core/Scheduler.js', () => ({
  Scheduler: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isActive: vi.fn().mockReturnValue(true),
    onTaskReady: null,
    getStats: vi.fn().mockReturnValue({
      totalTasks: 0,
      lastHeartbeat: new Date(),
      isPaused: false,
      pauseUntil: null,
    }),
    getLastHeartbeat: vi.fn().mockReturnValue(new Date()),
  })),
}));

vi.mock('../core/Agent.js', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    executeTask: vi.fn().mockResolvedValue({ success: true, message: 'Task completed' }),
  })),
}));

vi.mock('../core/Memory.js', () => ({
  MemoryService: vi.fn().mockImplementation(() => ({
    save: vi.fn().mockResolvedValue('memory-id'),
  })),
}));

const createMockDb = (): DatabaseClient => {
  const mockDb = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseClient;
  return mockDb;
};

describe('HeartbeatService', () => {
  let service: HeartbeatService;
  let mockDb: DatabaseClient;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new HeartbeatService(mockDb, { heartbeatIntervalMs: 1000 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a heartbeat service instance', () => {
      expect(service).toBeDefined();
    });

    it('should use provided scheduler if given', () => {
      const customScheduler = new Scheduler(mockDb, 500);
      const customService = new HeartbeatService(mockDb, {}, customScheduler);
      expect(customService).toBeDefined();
    });
  });

  describe('start', () => {
    it('should start and stop without error', async () => {
      const startPromise = service.start();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await service.stop();
      await startPromise.catch(() => {});
    });
  });

  describe('stop', () => {
    it('should close database connection on stop', async () => {
      await service.stop();
      
      expect(mockDb.close).toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('should return true when scheduler is active', () => {
      const result = service.isRunning();
      expect(result).toBe(true);
    });

    it('should return false when scheduler is not active', () => {
      const inactiveScheduler = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        isActive: vi.fn().mockReturnValue(false),
        onTaskReady: null,
        getStats: vi.fn(),
        getLastHeartbeat: vi.fn(),
      } as unknown as Scheduler;
      
      const inactiveService = new HeartbeatService(mockDb, {}, inactiveScheduler);
      const result = inactiveService.isRunning();
      
      expect(result).toBe(false);
    });
  });

  describe('getHealth', () => {
    it('should return correct health status when running', () => {
      const health = service.getHealth();
      
      expect(health.isRunning).toBe(true);
      expect(health.stats).toHaveProperty('tasksExecuted');
      expect(health.stats).toHaveProperty('tasksSucceeded');
      expect(health.stats).toHaveProperty('tasksFailed');
      expect(health.lastError).toBeNull();
    });

    it('should return correct health status when not running', () => {
      const inactiveScheduler = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        isActive: vi.fn().mockReturnValue(false),
        onTaskReady: null,
        getStats: vi.fn(),
        getLastHeartbeat: vi.fn(),
      } as unknown as Scheduler;
      
      const inactiveService = new HeartbeatService(mockDb, {}, inactiveScheduler);
      const health = inactiveService.getHealth();
      
      expect(health.isRunning).toBe(false);
    });
  });

  describe('executeTask', () => {
    it('should execute task and mark as completed on success', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 } as QueryResult<unknown>);
      
      await service.executeTask('task-123', 'Test Task', 'Test description');
      
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should increment tasksExecuted counter', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 } as QueryResult<unknown>);
      
      const healthBefore = service.getHealth();
      const initialExecuted = healthBefore.stats.tasksExecuted;
      
      await service.executeTask('task-123', 'Test Task');
      
      const healthAfter = service.getHealth();
      expect(healthAfter.stats.tasksExecuted).toBe(initialExecuted + 1);
    });
  });
});
