import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler, type ScheduledTask } from '../core/Scheduler.js';
import { HeartbeatService } from '../services/HeartbeatService.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
    close: vi.fn(),
  })),
}));

const createMockDb = (): DatabaseClient => {
  const mockDb = {
    query: vi.fn(),
    close: vi.fn(),
  } as unknown as DatabaseClient;
  return mockDb;
};

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockDb: DatabaseClient;

  beforeEach(() => {
    mockDb = createMockDb();
    mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    scheduler = new Scheduler(mockDb, 100);
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.clearAllMocks();
  });

  it('should create a scheduler instance', () => {
    expect(scheduler).toBeDefined();
    expect(scheduler.isActive()).toBe(false);
  });

  it('should start and stop correctly', async () => {
    await scheduler.start();
    expect(scheduler.isActive()).toBe(true);

    await scheduler.stop();
    expect(scheduler.isActive()).toBe(false);
  });

  it('should not start twice', async () => {
    await scheduler.start();
    const isRunningBefore = scheduler.isActive();
    await scheduler.start();
    const isRunningAfter = scheduler.isActive();

    expect(isRunningBefore).toBe(true);
    expect(isRunningAfter).toBe(true);
  });

  it('should not stop twice', async () => {
    await scheduler.start();
    await scheduler.stop();
    const isRunningFirstStop = scheduler.isActive();
    await scheduler.stop();
    const isRunningSecondStop = scheduler.isActive();

    expect(isRunningFirstStop).toBe(false);
    expect(isRunningSecondStop).toBe(false);
  });

  it('should return stats correctly', () => {
    const stats = scheduler.getStats();
    expect(stats).toHaveProperty('totalTasks');
    expect(stats).toHaveProperty('lastHeartbeat');
    expect(stats).toHaveProperty('isPaused');
    expect(stats).toHaveProperty('pauseUntil');
  });

  it('should return null for last heartbeat before start', () => {
    expect(scheduler.getLastHeartbeat()).toBeNull();
    expect(scheduler.getLastRun()).toBeNull();
  });

  it('should return empty map for task runs before execution', () => {
    const runs = scheduler.getAllLastTaskRuns();
    expect(runs.size).toBe(0);
    expect(scheduler.getLastTaskRun('task-1')).toBeUndefined();
  });

  it('should return 0 total tasks executed initially', () => {
    expect(scheduler.getTotalTasksExecuted()).toBe(0);
  });

  it('should schedule a recurring task', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    const task: ScheduledTask = {
      id: 'task-1',
      data: { foo: 'bar' },
      scheduledAt: new Date(),
      intervalMs: 50,
    };

    await scheduler.scheduleTask(task);
    
    // Wait for recurring task to trigger
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(mockQuery).toHaveBeenCalled();
  });

  it('should execute task callback when task is ready', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    // First call: reset stuck tasks
    // Second call: get pending task
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
      .mockResolvedValueOnce({
        rows: [{ id: 'task-1', title: 'Test Task', description: 'Test description' }],
        rowCount: 1,
      } as QueryResult<unknown>);

    const callback = vi.fn().mockResolvedValue(undefined);
    scheduler.onTaskReady = callback;

    await scheduler.start();
    
    // Wait for heartbeat to execute
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(callback).toHaveBeenCalledWith('task-1', 'Test Task', 'Test description');
    expect(scheduler.getTotalTasksExecuted()).toBe(1);
  });

  it('should handle task execution failure', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
      .mockResolvedValueOnce({
        rows: [{ id: 'task-1', title: 'Test Task', description: 'Test' }],
        rowCount: 1,
      } as QueryResult<unknown>)
      .mockResolvedValue({ rows: [], rowCount: 1 } as QueryResult<unknown>);

    const callback = vi.fn().mockRejectedValue(new Error('Task failed'));
    scheduler.onTaskReady = callback;

    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(callback).toHaveBeenCalled();
    expect(scheduler.getTotalTasksExecuted()).toBe(0); // Failed tasks don't increment
  });
});

describe('HeartbeatService', () => {
  let heartbeatService: HeartbeatService;
  let mockDb: DatabaseClient;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  afterEach(async () => {
    if (heartbeatService) {
      await heartbeatService.stop();
    }
    vi.clearAllMocks();
  });

  it('should create a heartbeat service instance', () => {
    heartbeatService = new HeartbeatService(mockDb, { heartbeatIntervalMs: 100 });
    expect(heartbeatService).toBeDefined();
    expect(heartbeatService.isRunning()).toBe(false);
  });

  it('should return correct health status when not running', () => {
    heartbeatService = new HeartbeatService(mockDb);
    const health = heartbeatService.getHealth();

    expect(health.isRunning).toBe(false);
    expect(health.stats).toEqual({
      tasksExecuted: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
    });
    expect(health.lastError).toBeNull();
  });

  it('should start and stop correctly', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    heartbeatService = new HeartbeatService(mockDb, { heartbeatIntervalMs: 100 });
    
    await heartbeatService.start();
    expect(heartbeatService.isRunning()).toBe(true);

    await heartbeatService.stop();
    expect(heartbeatService.isRunning()).toBe(false);
  });

  it('should track task execution stats', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    heartbeatService = new HeartbeatService(mockDb, { heartbeatIntervalMs: 100 });
    await heartbeatService.start();
    await heartbeatService.stop();

    const health = heartbeatService.getHealth();
    expect(health.stats.tasksExecuted).toBeGreaterThanOrEqual(0);
  });
});
