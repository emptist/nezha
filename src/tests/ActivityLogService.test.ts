import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityLogService, type ActivityType } from '../services/ActivityLogService.js';

describe('ActivityLogService', () => {
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    };
  });

  describe('types', () => {
    it('should define ActivityType', () => {
      const activityTypes: ActivityType[] = [
        'task_started',
        'task_completed',
        'task_failed',
        'review_created',
        'announcement_sent',
        'error_encountered',
      ];
      expect(activityTypes.length).toBeGreaterThan(0);
    });
  });

  describe('create instance', () => {
    it('should create service', () => {
      const service = new ActivityLogService(mockDb as any);
      expect(service).toBeDefined();
    });
  });
});
