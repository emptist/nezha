import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskWatchdogService, WatchdogEvent } from '../services/TaskWatchdogService.js';

const mockQuery = vi.fn();
const mockDb = {
  query: mockQuery,
} as any;

describe('TaskWatchdogService', () => {
  let service: TaskWatchdogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaskWatchdogService(mockDb, {
      checkIntervalMs: 1000,
      defaultTimeoutSeconds: 5,
      maxKillsPerTask: 3,
      gracePeriodMs: 100,
      enableProcessKill: false,
    });
  });

  afterEach(() => {
    service.stop();
  });

  describe('start/stop', () => {
    it('should start and stop the service', async () => {
      const startedEvent = vi.fn();
      const stoppedEvent = vi.fn();
      service.on(WatchdogEvent.WATCHDOG_STARTED, startedEvent);
      service.on(WatchdogEvent.WATCHDOG_STOPPED, stoppedEvent);

      service.start();
      expect(service['isRunning']).toBe(true);
      expect(startedEvent).toHaveBeenCalled();

      service.stop();
      expect(service['isRunning']).toBe(false);
      expect(stoppedEvent).toHaveBeenCalled();
    });

    it('should not start twice', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      service.start();
      service.start();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('trackTask', () => {
    it('should track a task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.trackTask('task-1', 'Test Task', undefined, 60);

      expect(service['trackedTasks'].has('task-1')).toBe(true);
      const task = service['trackedTasks'].get('task-1');
      expect(task?.taskId).toBe('task-1');
      expect(task?.title).toBe('Test Task');
      expect(task?.watchdogTimeoutSeconds).toBe(60);
      expect(task?.isKilled).toBe(false);
    });

    it('should use default timeout if not specified', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.trackTask('task-2', 'Test Task 2');

      const task = service['trackedTasks'].get('task-2');
      expect(task?.watchdogTimeoutSeconds).toBe(5);
    });
  });

  describe('untrackTask', () => {
    it('should untrack a task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.trackTask('task-1', 'Test Task');
      expect(service['trackedTasks'].has('task-1')).toBe(true);

      await service.untrackTask('task-1');
      expect(service['trackedTasks'].has('task-1')).toBe(false);
    });
  });

  describe('updateHeartbeat', () => {
    it('should update heartbeat for tracked task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.trackTask('task-1', 'Test Task');
      const originalHeartbeat = service['trackedTasks'].get('task-1')?.lastHeartbeat;

      await new Promise(resolve => setTimeout(resolve, 10));
      await service.updateHeartbeat('task-1');

      const updatedHeartbeat = service['trackedTasks'].get('task-1')?.lastHeartbeat;
      expect(updatedHeartbeat?.getTime()).toBeGreaterThan(originalHeartbeat?.getTime() ?? 0);
    });
  });

  describe('getStuckTasksCount', () => {
    it('should return count of stuck tasks', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '5' }], rowCount: 1 });

      const count = await service.getStuckTasksCount();
      expect(count).toBe(5);
    });
  });

  describe('getWatchdogStats', () => {
    it('should return watchdog statistics', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('is_stuck = true')) {
          return Promise.resolve({ rows: [{ count: '2' }], rowCount: 1 });
        }
        if (sql.includes('is_killed = true')) {
          return Promise.resolve({ rows: [{ count: '2' }], rowCount: 1 });
        }
        if (sql.includes('SUM(watchdog_kills)')) {
          return Promise.resolve({ rows: [{ total: '3' }], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      await service.trackTask('task-1', 'Task 1');
      await service.trackTask('task-2', 'Task 2');

      const stats = await service.getWatchdogStats();
      expect(stats.trackedTasks).toBe(2);
      expect(stats.stuckTasks).toBe(2);
      expect(stats.totalKills).toBe(3);
    });
  });
});
