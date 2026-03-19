import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InterReviewService, InterReviewEvent, type ReviewRequest, type ReviewResult } from '../services/InterReviewService.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
  })),
}));

describe('InterReviewService', () => {
  let service: InterReviewService;
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      query: vi.fn(),
    };
    service = new InterReviewService(mockDb as unknown as import('../db/DatabaseClient.js').DatabaseClient);
  });

  describe('constructor', () => {
    it('should create service without AI provider', () => {
      const svc = new InterReviewService(mockDb as unknown as import('../db/DatabaseClient.js').DatabaseClient);
      expect(svc).toBeDefined();
    });
  });

  describe('isAIAvailable', () => {
    it('should return false when no AI provider', () => {
      expect((service as unknown as { isAIAvailable: () => boolean }).isAIAvailable()).toBe(false);
    });
  });

  describe('loadPromptFromSkills', () => {
    it('should return null when no skills found', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as never);
      const result = await service.loadPromptFromSkills('nonexistent');
      expect(result).toBeNull();
    });

    it('should return content when skill found', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ content: 'test content' }] } as never);
      const result = await service.loadPromptFromSkills('test-prompt');
      expect(result).toBe('test content');
    });

    it('should return null on database error', async () => {
      vi.mocked(mockDb.query).mockRejectedValueOnce(new Error('DB error'));
      const result = await service.loadPromptFromSkills('error-prompt');
      expect(result).toBeNull();
    });
  });

  describe('savePromptToSkills', () => {
    it('should save prompt to skills', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as never);
      await service.savePromptToSkills('test-prompt', 'test content');
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO skills'),
        ['test-prompt', 'test content']
      );
    });

    it('should handle save errors gracefully', async () => {
      vi.mocked(mockDb.query).mockRejectedValueOnce(new Error('Save failed'));
      await expect(service.savePromptToSkills('error', 'content')).resolves.not.toThrow();
    });
  });

  describe('requestReview', () => {
    it('should create review request and return id', async () => {
      const reviewId = 'review-123';
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ id: reviewId }] } as never);

      const request: ReviewRequest = {
        reviewerId: 'agent-1',
        context: {
          taskDescription: 'Test task',
        },
      };

      const result = await service.requestReview(request);
      expect(result).toBe(reviewId);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('request_inter_review'),
        expect.arrayContaining(['agent-1'])
      );
    });

    it('should emit REVIEW_REQUESTED event', async () => {
      const eventHandler = vi.fn();
      service.on(InterReviewEvent.REVIEW_REQUESTED, eventHandler);
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ id: 'r1' }] } as never);

      await service.requestReview({ reviewerId: 'agent-1', context: {} });
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ reviewId: 'r1' })
      );
    });
  });

  describe('getReview', () => {
    it('should return null when review not found', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as never);
      const result = await service.getReview('nonexistent');
      expect(result).toBeNull();
    });

    it('should return review data', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [{
          id: 'r1',
          task_id: 't1',
          status: 'completed',
          summary: 'Good work',
          findings: [],
          overall_score: 85,
          response: null,
          requested_at: new Date(),
          completed_at: new Date(),
        }],
      } as never);

      const result = await service.getReview('r1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('r1');
      expect(result!.overallScore).toBe(85);
    });
  });

  describe('getPendingReviews', () => {
    it('should return pending reviews', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [{
          id: 'r1',
          task_id: 't1',
          reviewer_id: 'agent-1',
          requested_at: new Date(),
          pending_minutes: 30,
        }],
      } as never);

      const result = await service.getPendingReviews();
      expect(result).toHaveLength(1);
      expect(result[0]!.reviewerId).toBe('agent-1');
      expect(result[0]!.pendingMinutes).toBe(30);
    });

    it('should return empty array when no pending reviews', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as never);
      const result = await service.getPendingReviews();
      expect(result).toEqual([]);
    });
  });

  describe('getReviewStats', () => {
    it('should return review statistics', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [{
          pending_count: '5',
          completed_count: '20',
          failed_count: '2',
          avg_score: '82.5',
          avg_code_quality: '80',
          avg_test_coverage: '75',
          avg_documentation: '85',
        }],
      } as never);

      const result = await service.getReviewStats();
      expect(result.pendingCount).toBe(5);
      expect(result.completedCount).toBe(20);
      expect(result.failedCount).toBe(2);
      expect(result.avgScore).toBe(82.5);
      expect(result.avgCodeQuality).toBe(80);
      expect(result.avgTestCoverage).toBe(75);
      expect(result.avgDocumentation).toBe(85);
    });

    it('should handle null avg scores', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [{
          pending_count: '0',
          completed_count: '0',
          failed_count: '0',
          avg_score: null,
          avg_code_quality: null,
          avg_test_coverage: null,
          avg_documentation: null,
        }],
      } as never);

      const result = await service.getReviewStats();
      expect(result.avgScore).toBeNull();
      expect(result.avgCodeQuality).toBeNull();
    });
  });

  describe('respondToReview', () => {
    it('should save review response', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as never);
      await service.respondToReview('r1', 'Looks good!', ['s1']);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('respond_to_inter_review'),
        ['r1', 'Looks good!', '["s1"]']
      );
    });

    it('should emit REVIEW_RESPONSE event', async () => {
      const eventHandler = vi.fn();
      service.on(InterReviewEvent.REVIEW_RESPONSE, eventHandler);
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as never);

      await service.respondToReview('r1', 'Response text');
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ reviewId: 'r1' })
      );
    });
  });

  describe('getLearningsForAIContext', () => {
    it('should return empty string when no learnings', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as never);
      const result = await service.getLearningsForAIContext('typescript');
      expect(result).toBe('');
    });

    it('should return formatted learnings context', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [{
          content: '## AI Learning from Inter-Review\n\n**Topic**: TypeScript\n\n**Reminder**: Use strict types\n\n---\nRemember this.',
          metadata: { topic: 'TypeScript' },
        }],
      } as never);

      const result = await service.getLearningsForAIContext('TypeScript');
      expect(result).toContain('AI Review Learnings');
      expect(result).toContain('TypeScript');
    });
  });

  describe('getSkillsFromLearnings', () => {
    it('should return learnings as skills', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [
          { name: 'review-learning-typescript', content: 'Use strict types' },
        ],
      } as never);

      const result = await service.getSkillsFromLearnings();
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('review-learning-typescript');
    });
  });

  describe('extractPatternsFromReviews', () => {
    it('should extract patterns from reviews', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [{
          topic: 'TypeScript',
          reminder: '## AI Learning from Inter-Review\n\n**Topic**: TypeScript\n\n**Reminder**: Use strict types\n\n---',
          frequency: '5',
        }],
      } as never);

      const result = await service.extractPatternsFromReviews(10);
      expect(result).toHaveLength(1);
      expect(result[0]!.topic).toBe('TypeScript');
      expect(result[0]!.frequency).toBe(5);
    });
  });

  describe('events', () => {
    it('should emit events correctly', () => {
      const startedHandler = vi.fn();
      const completedHandler = vi.fn();
      const failedHandler = vi.fn();

      service.on(InterReviewEvent.REVIEW_STARTED, startedHandler);
      service.on(InterReviewEvent.REVIEW_COMPLETED, completedHandler);
      service.on(InterReviewEvent.REVIEW_FAILED, failedHandler);

      service.emit(InterReviewEvent.REVIEW_STARTED, { reviewId: 'r1' });
      expect(startedHandler).toHaveBeenCalled();

      service.emit(InterReviewEvent.REVIEW_COMPLETED, { reviewId: 'r1', result: {} });
      expect(completedHandler).toHaveBeenCalled();

      service.emit(InterReviewEvent.REVIEW_FAILED, { reviewId: 'r1', error: new Error('Failed') });
      expect(failedHandler).toHaveBeenCalled();
    });
  });
});
