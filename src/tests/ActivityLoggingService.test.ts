import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityLoggingService } from '../services/ActivityLoggingService.js';

describe('ActivityLoggingService', () => {
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    };
  });

  describe('create instance', () => {
    it('should create service', () => {
      const service = new ActivityLoggingService(mockDb as any);
      expect(service).toBeDefined();
    });
  });
});
