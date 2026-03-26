import { describe, it, expect, vi } from 'vitest';
import { getPluginManager } from '../../../core/PluginManager.js';

vi.mock('../../../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    getPool: vi.fn().mockReturnValue({}),
  })),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('HeartbeatService Integration', () => {
  describe('NextStepAdvisor Integration', () => {
    it('should have plugin manager available', () => {
      const pluginManager = getPluginManager();
      expect(pluginManager).toBeDefined();
      expect(pluginManager.registerPlugin).toBeDefined();
      expect(pluginManager.executeAfterTaskWithChanges).toBeDefined();
    });

    it('should call executeAfterTaskWithChanges', async () => {
      const pluginManager = getPluginManager();
      const spy = vi.spyOn(pluginManager, 'executeAfterTaskWithChanges');
      await pluginManager.executeAfterTaskWithChanges({
        taskId: 'test-id',
        title: 'Test Task',
        status: 'COMPLETED',
      });
      expect(spy).toHaveBeenCalled();
    });
  });
});
