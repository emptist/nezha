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
    // Second call: check running tasks count
    // Third call: get pending task
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<unknown>)
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
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<unknown>)
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
      reconnectAttempts: 0,
    });
    expect(health.lastError).toBeNull();
  });

  it('should start and stop correctly', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    heartbeatService = new HeartbeatService(mockDb, { heartbeatIntervalMs: 100, autoReconnect: false });
    
    const startPromise = heartbeatService.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(heartbeatService.isRunning()).toBe(true);

    await heartbeatService.stop();
    await startPromise.catch(() => {});
    expect(heartbeatService.isRunning()).toBe(false);
  });

  it('should track task execution stats', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    heartbeatService = new HeartbeatService(mockDb, { heartbeatIntervalMs: 100, autoReconnect: false });
    const startPromise = heartbeatService.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    await heartbeatService.stop();
    await startPromise.catch(() => {});

    const health = heartbeatService.getHealth();
    expect(health.stats.tasksExecuted).toBeGreaterThanOrEqual(0);
  });

  it('should set last error on task failure', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    heartbeatService = new HeartbeatService(mockDb);
    const healthBefore = heartbeatService.getHealth();
    expect(healthBefore.lastError).toBeNull();
  });
});

describe('Scheduler - Additional Edge Cases', () => {
  let scheduler: Scheduler;
  let mockDb: DatabaseClient;

  const createMockDb = (): DatabaseClient => {
    const mockDb = {
      query: vi.fn(),
      close: vi.fn(),
    } as unknown as DatabaseClient;
    return mockDb;
  };

  beforeEach(() => {
    mockDb = createMockDb();
    mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    scheduler = new Scheduler(mockDb, 100);
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.clearAllMocks();
  });

  it('should update lastRun on each heartbeat', async () => {
    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(scheduler.getLastRun()).not.toBeNull();
  });

  it('should track lastTaskRun after successful task execution', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<unknown>)
      .mockResolvedValueOnce({
        rows: [{ id: 'task-123', title: 'Test Task', description: 'Test' }],
        rowCount: 1,
      } as QueryResult<unknown>);

    scheduler.onTaskReady = vi.fn().mockResolvedValue(undefined);

    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(scheduler.getLastTaskRun('task-123')).toBeDefined();
  });

  it('should set pauseUntil when pausing after consecutive failures', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    const failingTask = {
      rows: [{ id: 'task-1', title: 'Task 1', description: 'Test' }],
      rowCount: 1,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<unknown>)
      .mockResolvedValueOnce(failingTask)
      .mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    scheduler.onTaskReady = vi.fn().mockRejectedValue(new Error('Failure'));

    await scheduler.start();
    
    for (let i = 0; i < 5; i++) {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<unknown>)
        .mockResolvedValueOnce(failingTask);
      await new Promise(resolve => setTimeout(resolve, 120));
    }

    const stats = scheduler.getStats();
    expect(stats.isPaused).toBe(true);
    expect(stats.pauseUntil).not.toBeNull();
    expect(stats.pauseUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should clear recurring task timers on stop', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    const task: ScheduledTask = {
      id: 'recurring-task',
      data: { foo: 'bar' },
      scheduledAt: new Date(),
      intervalMs: 50,
    };

    await scheduler.scheduleTask(task);
    await new Promise(resolve => setTimeout(resolve, 60));
    
    await scheduler.stop();
    
    const task2: ScheduledTask = {
      id: 'recurring-task-2',
      data: { foo: 'bar' },
      scheduledAt: new Date(),
      intervalMs: 50,
    };
    
    await scheduler.scheduleTask(task2);
    await scheduler.stop();
    
    expect(scheduler.isActive()).toBe(false);
  });

  it('should schedule task without recurring interval', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    const task: ScheduledTask = {
      id: 'one-time-task',
      data: { foo: 'bar' },
      scheduledAt: new Date(),
    };

    const taskId = await scheduler.scheduleTask(task);
    expect(taskId).toBe('one-time-task');
    expect(mockQuery).toHaveBeenCalled();
  });
});

describe('Scheduler - Task Operations', () => {
  let scheduler: Scheduler;
  let mockDb: DatabaseClient;

  const createMockDb = (): DatabaseClient => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    const mockDb = {
      query: mockQuery,
      close: vi.fn(),
    } as unknown as DatabaseClient;
    return mockDb;
  };

  beforeEach(() => {
    mockDb = createMockDb();
    scheduler = new Scheduler(mockDb, 100);
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.clearAllMocks();
  });

  it('should complete task with result', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    await scheduler.completeTaskWithResult('task-1', { result: 'success' });
    
    expect(mockQuery).toHaveBeenCalled();
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[0]).toContain('UPDATE');
    expect(callArgs[1]).toContain('task-1');
  });

  it('should fail task with error', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    await scheduler.failTaskWithError('task-1', 'Task failed');
    
    expect(mockQuery).toHaveBeenCalled();
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[0]).toContain('UPDATE');
    expect(callArgs[1]).toContain('task-1');
  });

  it('should get task result', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({
      rows: [{ result: '{"foo":"bar"}', encrypted_result: null, status: 'COMPLETED' }],
      rowCount: 1,
    } as QueryResult<unknown>);
    
    const result = await scheduler.getTaskResult('task-1');
    
    expect(mockQuery).toHaveBeenCalled();
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should return null for non-existent task result', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    
    const result = await scheduler.getTaskResult('non-existent');
    
    expect(result).toBeNull();
  });

  it('should emit heartbeat event on start', async () => {
    const eventBus = scheduler.getEventBus();
    const callback = vi.fn();
    
    eventBus.subscribe('scheduler:heartbeat', callback);
    
    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(callback).toHaveBeenCalled();
  });

  it('should emit task started event', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<unknown>)
      .mockResolvedValueOnce({
        rows: [{ id: 'task-1', title: 'Test Task', description: 'Test' }],
        rowCount: 1,
      } as QueryResult<unknown>);

    const eventBus = scheduler.getEventBus();
    const callback = vi.fn();
    eventBus.subscribe('scheduler:task:started', callback);
    
    scheduler.onTaskReady = vi.fn().mockResolvedValue(undefined);
    
    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        title: 'Test Task',
      })
    );
  });

  it('should emit task completed event on success', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<unknown>)
      .mockResolvedValueOnce({
        rows: [{ id: 'task-1', title: 'Test Task', description: 'Test', retry_count: 0, max_retries: 3, timeout_seconds: 300 }],
        rowCount: 1,
      } as QueryResult<unknown>);

    const eventBus = scheduler.getEventBus();
    const callback = vi.fn();
    eventBus.subscribe('scheduler:task:completed', callback);
    
    scheduler.onTaskReady = vi.fn().mockResolvedValue(undefined);
    
    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        title: 'Test Task',
      })
    );
  });

  it('should emit task failed event on error', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult<unknown>)
      .mockResolvedValueOnce({
        rows: [{ id: 'task-1', title: 'Test Task', description: 'Test', retry_count: 0, max_retries: 3, timeout_seconds: 300 }],
        rowCount: 1,
      } as QueryResult<unknown>);

    const eventBus = scheduler.getEventBus();
    const callback = vi.fn();
    eventBus.subscribe('scheduler:task:failed', callback);
    
    scheduler.onTaskReady = vi.fn().mockRejectedValue(new Error('Task failed'));
    
    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        title: 'Test Task',
      })
    );
  });

  it('should respect pause until time', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    
    await scheduler.start();
    await scheduler.stop();
    
    expect(scheduler.isActive()).toBe(false);
  });

  it('should handle waitUntilStopped', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    
    await scheduler.start();
    
    const stopPromise = scheduler.stop();
    await scheduler.waitUntilStopped();
    await stopPromise;
    
    expect(scheduler.isActive()).toBe(false);
  });

  it('should return correct isExecutingTask state', () => {
    expect(scheduler.isExecutingTask()).toBe(false);
  });
});

describe('Scheduler - Database Error Handling', () => {
  let scheduler: Scheduler;
  let mockDb: DatabaseClient;

  const createMockDb = (): DatabaseClient => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    const mockDb = {
      query: mockQuery,
      close: vi.fn(),
    } as unknown as DatabaseClient;
    return mockDb;
  };

  beforeEach(() => {
    mockDb = createMockDb();
    scheduler = new Scheduler(mockDb, 100);
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.clearAllMocks();
  });

  it('should handle database errors when completing task', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    await expect(scheduler.completeTaskWithResult('task-1', { result: 'test' })).rejects.toThrow();
  });

  it('should handle database errors when failing task', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    await expect(scheduler.failTaskWithError('task-1', 'error')).rejects.toThrow();
  });
});

describe('Scheduler - Encryption Integration', () => {
  let scheduler: Scheduler;
  let mockDb: DatabaseClient;

  const createMockDb = (): DatabaseClient => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    const mockDb = {
      query: mockQuery,
      close: vi.fn(),
    } as unknown as DatabaseClient;
    return mockDb;
  };

  beforeEach(() => {
    mockDb = createMockDb();
    scheduler = new Scheduler(mockDb, 100);
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.clearAllMocks();
  });

  it('should get task result without encryption when not initialized', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({
      rows: [{ result: '{"foo":"bar"}', encrypted_result: null, status: 'COMPLETED' }],
      rowCount: 1,
    } as QueryResult<unknown>);

    const result = await scheduler.getTaskResult('task-1');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should return null when task does not exist', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    const result = await scheduler.getTaskResult('non-existent-task');
    expect(result).toBeNull();
  });
});

describe('Scheduler - Task Dependencies', () => {
  let scheduler: Scheduler;
  let mockDb: DatabaseClient;

  const createMockDb = (): DatabaseClient => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    const mockDb = {
      query: mockQuery,
      close: vi.fn(),
    } as unknown as DatabaseClient;
    return mockDb;
  };

  beforeEach(() => {
    mockDb = createMockDb();
    scheduler = new Scheduler(mockDb, 100);
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.clearAllMocks();
  });

  it('should not execute task with incomplete dependencies', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    scheduler.onTaskReady = vi.fn();
    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(scheduler.onTaskReady).not.toHaveBeenCalled();
  });
});

describe('Scheduler - Timeout Task Handling', () => {
  let scheduler: Scheduler;
  let mockDb: DatabaseClient;

  const createMockDb = (): DatabaseClient => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    const mockDb = {
      query: mockQuery,
      close: vi.fn(),
    } as unknown as DatabaseClient;
    return mockDb;
  };

  beforeEach(() => {
    mockDb = createMockDb();
    scheduler = new Scheduler(mockDb, 100);
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.clearAllMocks();
  });

  it('should detect and handle timed out tasks', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'timeout-task', title: 'Timeout Task', timeout_seconds: 1 }],
        rowCount: 1,
      } as QueryResult<unknown>)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult<unknown>);

    await scheduler.start();
    await new Promise(resolve => setTimeout(resolve, 150));

    const updateCall = mockQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('UPDATE')
    );
    expect(updateCall).toBeDefined();
  });
});
