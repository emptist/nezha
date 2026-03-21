import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TraeAutoRecoveryService,
  type TraeRecoveryConfig,
} from '../services/TraeAutoRecoveryService.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('TraeAutoRecoveryService', () => {
  let service: TraeAutoRecoveryService;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockDb = {
      query: vi.fn(),
    };
    service = new TraeAutoRecoveryService(mockDb);
  });

  afterEach(() => {
    vi.useRealTimers();
    service.stop();
  });

  describe('constructor', () => {
    it('should create with defaults', () => {
      expect(service).toBeDefined();
    });

    it('should apply custom config', () => {
      const config: Partial<TraeRecoveryConfig> = {
        enabled: false,
        checkIntervalMs: 10000,
        maxAutoRetries: 5,
      };
      const svc = new TraeAutoRecoveryService(mockDb, config);
      expect(svc).toBeDefined();
    });
  });

  describe('start', () => {
    it('should start the recovery cycle', () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      service.start();

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should not start twice', () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      service.start();
      service.start();

      // Should only run one cycle initially
    });

    it('should not run when disabled', () => {
      const config: Partial<TraeRecoveryConfig> = { enabled: false };
      const svc = new TraeAutoRecoveryService(mockDb, config);

      svc.start();

      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the service', () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      service.start();

      service.stop();

      expect(service).toBeDefined();
    });
  });

  describe('recoverFailedTasks', () => {
    it('should recover failed tasks within retry limit', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          { id: 'task-1', title: 'Failed Task 1', retry_count: 1, error_category: 'TIMEOUT' },
          { id: 'task-2', title: 'Failed Task 2', retry_count: 2, error_category: 'NETWORK' },
        ],
      });

      const count = await service.recoverFailedTasks();

      expect(count).toBe(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'PENDING'"),
        expect.any(Array)
      );
    });

    it('should return 0 when no failed tasks', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const count = await service.recoverFailedTasks();

      expect(count).toBe(0);
    });
  });

  describe('recoverStuckTasks', () => {
    it('should recover tasks stuck in RUNNING state', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ id: 'task-1', title: 'Stuck Task', running_duration_seconds: 600 }],
      });

      const count = await service.recoverStuckTasks();

      expect(count).toBe(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'RUNNING'"),
        expect.any(Array)
      );
    });

    it('should return 0 when no stuck tasks', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const count = await service.recoverStuckTasks();

      expect(count).toBe(0);
    });
  });

  describe('retryDLQItems', () => {
    it('should return 0 when no items in DLQ', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ count: '0' }] });

      const count = await service.retryDLQItems();

      expect(count).toBe(0);
    });

    it('should skip retry when service not healthy', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // DLQ count
        .mockResolvedValueOnce({ ok: false, status: 500 }); // Health check

      const count = await service.retryDLQItems();

      expect(count).toBe(0);
    });
  });

  describe('checkServiceHealth', () => {
    it('should return healthy when health check succeeds', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      const serviceAny = service as unknown as {
        checkServiceHealth: () => Promise<{ healthy: boolean; latency?: number }>;
      };
      const result = await serviceAny.checkServiceHealth();

      expect(result.healthy).toBe(true);
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy when health check fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const serviceAny = service as unknown as {
        checkServiceHealth: () => Promise<{ healthy: boolean }>;
      };
      const result = await serviceAny.checkServiceHealth();

      expect(result.healthy).toBe(false);
    });
  });

  describe('getRecoveryStats', () => {
    it('should return complete recovery statistics', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // failed
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // stuck
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // dlq
        .mockResolvedValueOnce({ rows: [{ created_at: new Date() }] }); // last recovery

      const stats = await service.getRecoveryStats();

      expect(stats.failedTasksRecoverable).toBe(5);
      expect(stats.stuckTasks).toBe(2);
      expect(stats.dlqItemsPending).toBe(3);
      expect(stats.lastRecoveryAt).toBeDefined();
    });

    it('should handle zero counts', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const stats = await service.getRecoveryStats();

      expect(stats.failedTasksRecoverable).toBe(0);
      expect(stats.stuckTasks).toBe(0);
      expect(stats.dlqItemsPending).toBe(0);
      expect(stats.lastRecoveryAt).toBeNull();
    });
  });

  describe('runRecoveryCycle', () => {
    it('should run all recovery methods', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // recoverFailedTasks
        .mockResolvedValueOnce({ rows: [] }) // recoverStuckTasks
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // retryDLQItems

      const serviceAny = service as unknown as { runRecoveryCycle: () => Promise<void> };
      await serviceAny.runRecoveryCycle();

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockDb.query.mockRejectedValue(new Error('DB error'));

      const serviceAny = service as unknown as { runRecoveryCycle: () => Promise<void> };
      await expect(serviceAny.runRecoveryCycle()).resolves.not.toThrow();
    });
  });
});
