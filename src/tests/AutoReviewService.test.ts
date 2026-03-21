import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../core/EventBus.js';
import { SCHEDULER_EVENTS } from '../core/Scheduler.js';
import { AutoReviewService, type AutoReviewConfig } from '../services/AutoReviewService.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../services/InterReviewService.js', () => ({
  InterReviewService: vi.fn().mockImplementation(() => ({
    requestReview: vi.fn().mockResolvedValue('review-123'),
    performReview: vi.fn().mockResolvedValue({ overallScore: 85 }),
  })),
}));

describe('AutoReviewService', () => {
  let eventBus: EventBus;
  let service: AutoReviewService;
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    eventBus = new EventBus();
    mockDb = {
      query: vi.fn(),
    };
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const svc = new AutoReviewService(eventBus, mockDb as never);
      expect(svc).toBeDefined();
    });

    it('should apply custom config', () => {
      const config: Partial<AutoReviewConfig> = {
        enabled: false,
        minScoreThreshold: 50,
        reviewerId: 'custom-reviewer',
      };
      const svc = new AutoReviewService(eventBus, mockDb as never, config);
      expect(svc).toBeDefined();
    });
  });

  describe('start', () => {
    it('should subscribe to task events when enabled', () => {
      const config: Partial<AutoReviewConfig> = { enabled: true };
      service = new AutoReviewService(eventBus, mockDb as never, config);
      const subscribeSpy = vi.spyOn(eventBus, 'subscribe');

      service.start();

      expect(subscribeSpy).toHaveBeenCalledWith(
        SCHEDULER_EVENTS.TASK_COMPLETED,
        expect.any(Function)
      );
      expect(subscribeSpy).toHaveBeenCalledWith(SCHEDULER_EVENTS.TASK_FAILED, expect.any(Function));
    });

    it('should not subscribe when disabled', () => {
      const config: Partial<AutoReviewConfig> = { enabled: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);
      const subscribeSpy = vi.spyOn(eventBus, 'subscribe');

      service.start();

      expect(subscribeSpy).not.toHaveBeenCalled();
    });

    it('should not double-subscribe', () => {
      const config: Partial<AutoReviewConfig> = { enabled: true };
      service = new AutoReviewService(eventBus, mockDb as never, config);
      const subscribeSpy = vi.spyOn(eventBus, 'subscribe');

      service.start();
      service.start();

      expect(subscribeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('should unsubscribe from events', () => {
      const config: Partial<AutoReviewConfig> = { enabled: true };
      service = new AutoReviewService(eventBus, mockDb as never, config);
      const unsubscribeSpy = vi.spyOn(eventBus, 'unsubscribe');

      service.start();
      service.stop();

      expect(unsubscribeSpy).toHaveBeenCalledWith(
        SCHEDULER_EVENTS.TASK_COMPLETED,
        expect.any(Function)
      );
    });

    it('should handle stop without start', () => {
      const config: Partial<AutoReviewConfig> = { enabled: true };
      service = new AutoReviewService(eventBus, mockDb as never, config);

      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('handleTaskCompleted', () => {
    it('should skip review when reviewOnSuccess is false', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();

      const config: Partial<AutoReviewConfig> = { enabled: true, reviewOnSuccess: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);
      service.start();

      const event = { taskId: 'task-1', title: 'Test Task' };
      await eventBus.publish(SCHEDULER_EVENTS.TASK_COMPLETED, event);
    });

    it('should trigger review on task completion', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync)
        .mockReturnValueOnce('abc123\n')
        .mockReturnValueOnce('main\n')
        .mockReturnValueOnce('');

      const config: Partial<AutoReviewConfig> = { enabled: true, reviewOnSuccess: true };
      service = new AutoReviewService(eventBus, mockDb as never, config);
      service.start();

      const event = { taskId: 'task-1', title: 'Test Task' };
      await eventBus.publish(SCHEDULER_EVENTS.TASK_COMPLETED, event);
    });
  });

  describe('handleTaskFailed', () => {
    it('should trigger review on task failure', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync)
        .mockReturnValueOnce('abc123\n')
        .mockReturnValueOnce('main\n')
        .mockReturnValueOnce('');

      const config: Partial<AutoReviewConfig> = { enabled: true, reviewOnFailure: true };
      service = new AutoReviewService(eventBus, mockDb as never, config);
      service.start();

      const event = { taskId: 'task-1', title: 'Test Task', error: 'Connection timeout' };
      await eventBus.publish(SCHEDULER_EVENTS.TASK_FAILED, event);
    });

    it('should skip review when reviewOnFailure is false', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();

      const config: Partial<AutoReviewConfig> = { enabled: true, reviewOnFailure: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);
      service.start();

      const event = { taskId: 'task-1', title: 'Test Task', error: 'Error' };
      await eventBus.publish(SCHEDULER_EVENTS.TASK_FAILED, event);
    });
  });

  describe('getCurrentCommit', () => {
    it('should return current git commit hash', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync).mockReturnValueOnce('abc123def456\n');

      const config: Partial<AutoReviewConfig> = { enabled: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);

      const serviceAny = service as unknown as { getCurrentCommit: () => string | undefined };
      const commit = serviceAny.getCurrentCommit();

      expect(commit).toBe('abc123def456');
    });

    it('should return undefined on git error', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      const config: Partial<AutoReviewConfig> = { enabled: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);

      const serviceAny = service as unknown as { getCurrentCommit: () => string | undefined };
      const commit = serviceAny.getCurrentCommit();

      expect(commit).toBeUndefined();
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync).mockReturnValueOnce('feature-branch\n');

      const config: Partial<AutoReviewConfig> = { enabled: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);

      const serviceAny = service as unknown as { getCurrentBranch: () => string };
      const branch = serviceAny.getCurrentBranch();

      expect(branch).toBe('feature-branch');
    });

    it('should return main on error', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Git error');
      });

      const config: Partial<AutoReviewConfig> = { enabled: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);

      const serviceAny = service as unknown as { getCurrentBranch: () => string };
      const branch = serviceAny.getCurrentBranch();

      expect(branch).toBe('main');
    });
  });

  describe('getChangedFiles', () => {
    it('should return list of changed files', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync).mockReturnValueOnce('file1.ts\nfile2.ts\nfile3.ts\n');

      const config: Partial<AutoReviewConfig> = { enabled: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);

      const serviceAny = service as unknown as { getChangedFiles: () => string[] };
      const files = serviceAny.getChangedFiles();

      expect(files).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
    });

    it('should return empty array on error', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Git error');
      });

      const config: Partial<AutoReviewConfig> = { enabled: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);

      const serviceAny = service as unknown as { getChangedFiles: () => string[] };
      const files = serviceAny.getChangedFiles();

      expect(files).toEqual([]);
    });

    it('should return empty array when no changes', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync).mockReturnValueOnce('');

      const config: Partial<AutoReviewConfig> = { enabled: false };
      service = new AutoReviewService(eventBus, mockDb as never, config);

      const serviceAny = service as unknown as { getChangedFiles: () => string[] };
      const files = serviceAny.getChangedFiles();

      expect(files).toEqual([]);
    });
  });
});
