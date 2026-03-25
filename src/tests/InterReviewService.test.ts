import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterReviewService } from '../services/InterReviewService.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
  })),
}));

vi.mock('../services/ai/index.js', () => ({
  AIProviderFactory: {
    createFromEnv: vi.fn().mockReturnValue({
      complete: vi.fn().mockResolvedValue({ content: 'AI response' }),
    }),
  },
}));

describe('InterReviewService', () => {
  let service: InterReviewService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new InterReviewService(mockDb);
  });

  describe('constructor', () => {
    it('should create service', () => {
      expect(service).toBeDefined();
    });
  });

  describe('service', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('requestReview', () => {
    it('should create review request', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'review-123' }] });

      const result = await service.requestReview({
        reviewerId: 'test-agent',
        context: {},
      });

      expect(result).toBe('review-123');
    });
  });

  describe('getReview', () => {
    it('should return null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      expect(await service.getReview('non-existent')).toBeNull();
    });
  });
});
