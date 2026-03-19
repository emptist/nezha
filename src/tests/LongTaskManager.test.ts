import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LongTaskManager, PauseReason } from '../services/LongTaskManager.js';

const mockQuery = vi.fn();
const mockDb = {
  query: mockQuery,
} as any;

describe('LongTaskManager', () => {
  let manager: LongTaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new LongTaskManager(mockDb, {
      checkIntervalMs: 60000,
      defaultMaxRuntimeSeconds: 1800,
      defaultPauseDurationSeconds: 3600,
      enableAutoResume: true,
    });
  });

  afterEach(() => {
    manager.stop();
  });

  describe('start/stop', () => {
    it('should start and stop the manager', () => {
      manager.start();
      expect(manager['isRunning']).toBe(true);

      manager.stop();
      expect(manager['isRunning']).toBe(false);
    });
  });

  describe('registerTask', () => {
    it('should register a task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Long Running Task');

      expect(manager['longTasks'].has('task-1')).toBe(true);
      const task = manager['longTasks'].get('task-1');
      expect(task?.taskId).toBe('task-1');
      expect(task?.title).toBe('Long Running Task');
      expect(task?.isPaused).toBe(false);
    });

    it('should mark short tasks as non-long-running', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-2', 'Quick Task', { maxRuntimeSeconds: 60 });

      const task = manager['longTasks'].get('task-2');
      expect(task?.isLongRunning).toBe(false);
    });
  });

  describe('updateProgress', () => {
    it('should update task progress', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');
      await manager.updateProgress({ taskId: 'task-1', progressPercent: 50 });

      const task = manager['longTasks'].get('task-1');
      expect(task?.progressPercent).toBe(50);
    });

    it('should emit progress event', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const progressHandler = vi.fn();
      manager.on('progress', progressHandler);

      await manager.registerTask('task-1', 'Test Task');
      await manager.updateProgress({ taskId: 'task-1', progressPercent: 75 });

      expect(progressHandler).toHaveBeenCalledWith({
        taskId: 'task-1',
        progressPercent: 75,
      });
    });
  });

  describe('pauseTask', () => {
    it('should pause a running task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');
      const result = await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);

      expect(result).toBe(true);
      expect(manager['longTasks'].get('task-1')?.isPaused).toBe(true);
      expect(manager['pausedTasks'].has('task-1')).toBe(true);
    });

    it('should not pause already paused task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');
      await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);
      const result = await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);

      expect(result).toBe(false);
    });

    it('should emit paused event', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const pausedHandler = vi.fn();
      manager.on('paused', pausedHandler);

      await manager.registerTask('task-1', 'Test Task');
      await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);

      expect(pausedHandler).toHaveBeenCalled();
    });
  });

  describe('resumeTask', () => {
    it('should resume a paused task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');
      await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);
      const result = await manager.resumeTask('task-1');

      expect(result).toBe(true);
      expect(manager['longTasks'].get('task-1')?.isPaused).toBe(false);
      expect(manager['pausedTasks'].has('task-1')).toBe(false);
    });

    it('should not resume running task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');
      const result = await manager.resumeTask('task-1');

      expect(result).toBe(false);
    });

    it('should emit resumed event', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const resumedHandler = vi.fn();
      manager.on('resumed', resumedHandler);

      await manager.registerTask('task-1', 'Test Task');
      await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);
      await manager.resumeTask('task-1');

      expect(resumedHandler).toHaveBeenCalledWith({ taskId: 'task-1' });
    });
  });

  describe('unregisterTask', () => {
    it('should unregister a task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');
      await manager.unregisterTask('task-1');

      expect(manager['longTasks'].has('task-1')).toBe(false);
      expect(manager['pausedTasks'].has('task-1')).toBe(false);
    });
  });

  describe('isTaskPaused', () => {
    it('should return true for paused task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');
      await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);

      expect(manager.isTaskPaused('task-1')).toBe(true);
    });

    it('should return false for running task', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');

      expect(manager.isTaskPaused('task-1')).toBe(false);
    });
  });

  describe('getTaskProgress', () => {
    it('should return task progress', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Test Task');
      await manager.updateProgress({ taskId: 'task-1', progressPercent: 60 });

      expect(manager.getTaskProgress('task-1')).toBe(60);
    });

    it('should return undefined for unknown task', () => {
      expect(manager.getTaskProgress('unknown')).toBeUndefined();
    });
  });

  describe('forceResumeAll', () => {
    it('should resume all paused tasks', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Task 1');
      await manager.registerTask('task-2', 'Task 2');
      await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);
      await manager.pauseTask('task-2', PauseReason.MAX_RUNTIME);

      const count = await manager.forceResumeAll();

      expect(count).toBe(2);
      expect(manager['pausedTasks'].size).toBe(0);
    });
  });

  describe('getLongTaskStats', () => {
    it('should return long task statistics', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await manager.registerTask('task-1', 'Task 1');
      await manager.registerTask('task-2', 'Task 2');
      await manager.pauseTask('task-1', PauseReason.MAX_RUNTIME);
      await manager.updateProgress({ taskId: 'task-1', progressPercent: 50 });
      await manager.updateProgress({ taskId: 'task-2', progressPercent: 50 });

      const stats = await manager.getLongTaskStats();

      expect(stats.total).toBe(2);
      expect(stats.running).toBe(1);
      expect(stats.paused).toBe(1);
      expect(stats.avgProgress).toBe(50);
    });
  });
});
