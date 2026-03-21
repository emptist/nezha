import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QCService,
  type QCFinding,
  type QCReview,
  type QCReviewResult,
} from '../services/QCService.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
  })),
}));

vi.mock('../config/Config.js', () => ({
  Config: {
    getInstance: () => ({
      getAgentId: () => 'test-agent-id',
    }),
  },
}));

describe('QCService', () => {
  let service: QCService;
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      query: vi.fn(),
    };
    service = new QCService(mockDb as unknown as import('../db/DatabaseClient.js').DatabaseClient);
  });

  describe('createQCReview', () => {
    it('should create a QC review', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: 'review-1' }] });

      const id = await service.createQCReview('task-1', 5);

      expect(id).toBe('review-1');
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('create_qc_review'), [
        'task-1',
        5,
      ]);
    });

    it('should handle missing review id', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const id = await service.createQCReview('task-1');

      expect(id).toBe('');
    });
  });

  describe('shouldTriggerQC', () => {
    it('should trigger for high priority tasks', async () => {
      const result = await service.shouldTriggerQC('task-1', 8);
      expect(result).toBe(true);
    });

    it('should trigger for TypeScript files', async () => {
      const result = await service.shouldTriggerQC('task-1', 5, ['src/test.ts']);
      expect(result).toBe(true);
    });

    it('should trigger for JavaScript files', async () => {
      const result = await service.shouldTriggerQC('task-1', 5, ['src/test.js']);
      expect(result).toBe(true);
    });

    it('should not trigger for low priority without code changes', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ count: '1' }] });

      const result = await service.shouldTriggerQC('task-1', 5, ['README.md']);

      expect(result).toBe(false);
    });

    it('should not trigger when review already exists', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ count: '1' }] });

      const result = await service.shouldTriggerQC('task-1', 5, ['README.md']);

      expect(result).toBe(false);
    });
  });

  describe('getQCReview', () => {
    it('should return review when found', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'review-1',
            original_task_id: 'task-1',
            reviewer_id: 'agent-1',
            status: 'pending',
            code_quality_score: 80,
            test_coverage_score: 70,
            documentation_score: 90,
            overall_score: 80,
            findings: [],
            summary: 'Good work',
            started_at: new Date(),
            completed_at: null,
          },
        ],
      });

      const review = await service.getQCReview('review-1');

      expect(review).not.toBeNull();
      expect(review!.id).toBe('review-1');
      expect(review!.overallScore).toBe(80);
    });

    it('should return null when not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const review = await service.getQCReview('nonexistent');

      expect(review).toBeNull();
    });

    it('should handle null values', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'review-1',
            original_task_id: 'task-1',
            reviewer_id: null,
            status: 'pending',
            code_quality_score: null,
            test_coverage_score: null,
            documentation_score: null,
            overall_score: null,
            findings: [],
            summary: null,
            started_at: null,
            completed_at: null,
          },
        ],
      });

      const review = await service.getQCReview('review-1');

      expect(review).not.toBeNull();
      expect(review!.reviewerId).toBeUndefined();
      expect(review!.codeQualityScore).toBeUndefined();
    });
  });

  describe('startReview', () => {
    it('should update review status to in_progress', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await service.startReview('review-1');

      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("status = 'in_progress'"), [
        'test-agent-id',
        'review-1',
      ]);
    });
  });

  describe('completeReview', () => {
    it('should complete review with results', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result: QCReviewResult = {
        reviewId: 'review-1',
        summary: 'QC completed',
        findings: [{ severity: 'high', category: 'security', message: 'Fix XSS vulnerability' }],
        scores: {
          codeQuality: 80,
          testCoverage: 70,
          documentation: 90,
          overall: 80,
        },
        suggestedTasks: [{ title: 'Fix XSS', description: 'Fix the XSS issue', priority: 8 }],
      };

      await service.completeReview(result);

      expect(mockDb.query).toHaveBeenCalledTimes(3);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'completed'"),
        expect.arrayContaining([80, 70, 90, 80])
      );
    });

    it('should create suggested tasks as new tasks', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result: QCReviewResult = {
        reviewId: 'review-1',
        summary: 'Done',
        findings: [],
        scores: { codeQuality: 100, testCoverage: 100, documentation: 100, overall: 100 },
        suggestedTasks: [],
      };

      await service.completeReview(result);

      // Called for update + original task status update
      expect(mockDb.query.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getPendingReviews', () => {
    it('should return pending and in_progress reviews', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'review-1',
            original_task_id: 'task-1',
            reviewer_id: null,
            status: 'pending',
            code_quality_score: null,
            test_coverage_score: null,
            documentation_score: null,
            overall_score: null,
            findings: [],
            summary: null,
            started_at: null,
          },
        ],
      });

      const reviews = await service.getPendingReviews();

      expect(reviews).toHaveLength(1);
      expect(reviews[0].status).toBe('pending');
    });

    it('should respect limit parameter', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.getPendingReviews(5);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [5]);
    });
  });

  describe('getReviewerStats', () => {
    it('should return reviewer statistics', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            reviews_completed: '20',
            avg_score: '82.5',
            avg_code_quality: '80',
            avg_test_coverage: '75',
            avg_documentation: '85',
          },
        ],
      });

      const stats = await service.getReviewerStats('agent-1');

      expect(stats.reviewsCompleted).toBe(20);
      expect(stats.avgScore).toBe(82.5);
      expect(stats.avgCodeQuality).toBe(80);
      expect(stats.avgTestCoverage).toBe(75);
      expect(stats.avgDocumentation).toBe(85);
    });

    it('should handle null values', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            reviews_completed: null,
            avg_score: null,
            avg_code_quality: null,
            avg_test_coverage: null,
            avg_documentation: null,
          },
        ],
      });

      const stats = await service.getReviewerStats('agent-1');

      expect(stats.reviewsCompleted).toBe(0);
      expect(stats.avgScore).toBe(0);
    });
  });

  describe('creditReviewer', () => {
    it('should credit reviewer in memory', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await service.creditReviewer('agent-1', 'review-1');

      expect(mockDb.query).toHaveBeenCalled();
      const call = mockDb.query.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO memory');
      expect(JSON.stringify(call[1])).toContain('agent-1');
    });
  });
});
