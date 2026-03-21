import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewService, type ReviewFinding } from '../services/ReviewService.js';
import { DatabaseClient } from '../db/DatabaseClient.js';

vi.mock('../config/Config.js', () => ({
  Config: {
    getInstance: () => ({
      getAgentId: () => 'test-agent-id',
    }),
  },
}));

describe('ReviewService', () => {
  let service: ReviewService;
  let mockDb: any;

  const mockReview = {
    id: 'review-1',
    review_type: 'code',
    status: 'pending',
    current_state: 'initial',
    target_id: 'task-1',
    target_type: 'task',
    title: 'Test Review',
    description: 'Test description',
    reviewer_id: 'agent-1',
    findings: [],
    action_items: [],
    follow_up_due: null,
    follow_up_status: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockDb = {
      query: vi.fn(),
    };

    service = new ReviewService(mockDb as unknown as DatabaseClient);
  });

  describe('createReview', () => {
    it('should create a review and return id', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const id = await service.createReview('code', 'Test Review', 'task-1', 'task', 'Description');

      expect(id).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        expect.arrayContaining(['code', 'Test Review', 'task-1', 'task', 'Description'])
      );
    });

    it('should create review without optional parameters', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const id = await service.createReview('qc', 'QC Review');

      expect(id).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        expect.arrayContaining(['qc', 'QC Review'])
      );
    });

    it('should use current agent as reviewer', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await service.createReview('code', 'Test');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('reviewer_id'),
        expect.arrayContaining(['test-agent-id'])
      );
    });
  });

  describe('createQCReviewFromTask', () => {
    it('should create QC review from task', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ title: 'Original Task' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const reviewId = await service.createQCReviewFromTask('task-123', 5);

      expect(reviewId).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should cap priority at 8 when exceeded', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ title: 'Task' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await service.createQCReviewFromTask('task-1', 10);

      const insertCall = mockDb.query.mock.calls[2];
      expect(insertCall?.[1]).toContain(8);
    });

    it('should handle non-existent task', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const reviewId = await service.createQCReviewFromTask('nonexistent');

      expect(reviewId).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('startReview', () => {
    it('should update review status to in_progress', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await service.startReview('review-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'in_progress'"),
        expect.arrayContaining(['test-agent-id', 'review-1'])
      );
    });
  });

  describe('completeReview', () => {
    it('should complete review without findings', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ target_id: 'task-1', title: 'Test', reviewer_id: 'agent-1' }],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await service.completeReview('review-1', []);

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should create action items as tasks', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ target_id: 'task-1', title: 'Test', reviewer_id: 'agent-1' }],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const findings: ReviewFinding[] = [
        { severity: 'high', category: 'security', message: 'Fix this' },
      ];
      const actionItems = [{ description: 'Fix the issue' }];

      await service.completeReview('review-1', findings, actionItems);

      expect(mockDb.query).toHaveBeenCalledTimes(4);
    });

    it('should set follow_up status when findings exist', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ target_id: 'task-1', title: 'Test', reviewer_id: 'agent-1' }],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const findings: ReviewFinding[] = [
        { severity: 'critical', category: 'bug', message: 'Critical bug found' },
      ];

      await service.completeReview('review-1', findings);

      const updateCall = mockDb.query.mock.calls[0];
      expect(updateCall?.[0]).toContain("'follow_up'");
    });
  });

  describe('getPendingFollowUps', () => {
    it('should return pending follow-up reviews', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ ...mockReview, status: 'follow_up', follow_up_status: 'pending' }],
      });

      const result = await service.getPendingFollowUps();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('follow_up');
    });

    it('should return empty array when no follow-ups', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await service.getPendingFollowUps();

      expect(result).toHaveLength(0);
    });

    it('should limit results to 20', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.getPendingFollowUps();

      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 20'));
    });
  });

  describe('completeActionItem', () => {
    it('should mark action item as completed', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ pending: '1' }] });

      await service.completeActionItem('review-1', 'action-1');

      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should mark review as completed when all items done', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ pending: '0' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await service.completeActionItem('review-1', 'action-1');

      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('markOverdueFollowUps', () => {
    it('should mark overdue reviews and return count', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: 'r1' }, { id: 'r2' }], rowCount: 2 });

      const count = await service.markOverdueFollowUps();

      expect(count).toBe(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("follow_up_status = 'overdue'")
      );
    });

    it('should return 0 when no overdue reviews', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const count = await service.markOverdueFollowUps();

      expect(count).toBe(0);
    });
  });

  describe('getReviewStats', () => {
    it('should return complete review statistics', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            total: '100',
            pending: '20',
            in_progress: '10',
            completed: '60',
            follow_up: '5',
            overdue: '3',
            avg_hours: '4.5',
          },
        ],
      });

      const stats = await service.getReviewStats();

      expect(stats.total).toBe(100);
      expect(stats.pending).toBe(20);
      expect(stats.inProgress).toBe(10);
      expect(stats.completed).toBe(60);
      expect(stats.followUp).toBe(5);
      expect(stats.overdue).toBe(3);
      expect(stats.avgCompletionTimeHours).toBe(4.5);
    });

    it('should handle empty results', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            total: '0',
            pending: '0',
            in_progress: '0',
            completed: '0',
            follow_up: '0',
            overdue: '0',
            avg_hours: null,
          },
        ],
      });

      const stats = await service.getReviewStats();

      expect(stats.total).toBe(0);
      expect(stats.avgCompletionTimeHours).toBe(0);
    });
  });

  describe('completeReview notification handling', () => {
    it('should handle notification failure gracefully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockRejectedValueOnce(new Error('DB error for notification'));

      await expect(service.completeReview('review-1', [])).resolves.not.toThrow();
    });

    it('should not create notification when review has no target_id', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await service.completeReview('review-1', []);

      const calls = mockDb.query.mock.calls;
      const notificationCall = calls.find((call: any) =>
        call[0]?.includes('project_communications')
      );
      expect(notificationCall).toBeUndefined();
    });
  });

  describe('mapRowToReview (via getPendingFollowUps)', () => {
    it('should correctly map all review types', async () => {
      const reviewTypes = ['code', 'design', 'qc', 'peer', 'task', 'security', 'other'] as const;

      for (const reviewType of reviewTypes) {
        mockDb.query.mockResolvedValue({
          rows: [
            {
              ...mockReview,
              review_type: reviewType,
              findings: [{ severity: 'high', category: 'test', message: 'Test' }],
              action_items: [
                { id: 'a1', description: 'Item', status: 'pending', created_at: new Date() },
              ],
              follow_up_status: 'pending',
            },
          ],
        });

        const result = await service.getPendingFollowUps();
        expect(result[0].reviewType).toBe(reviewType);
      }
    });

    it('should map findings and action items correctly', async () => {
      const findings = [
        { severity: 'critical' as const, category: 'bug', message: 'Critical bug' },
      ];
      const actionItems = [
        { id: 'action-1', description: 'Fix', status: 'pending' as const, created_at: new Date() },
      ];

      mockDb.query.mockResolvedValue({
        rows: [
          {
            ...mockReview,
            findings,
            action_items: actionItems,
          },
        ],
      });

      const result = await service.getPendingFollowUps();
      expect(result[0].findings).toEqual(findings);
      expect(result[0].actionItems).toEqual(actionItems);
    });

    it('should handle null findings and action items', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ ...mockReview, findings: null, action_items: null }],
      });

      const result = await service.getPendingFollowUps();
      expect(result[0].findings).toEqual([]);
      expect(result[0].actionItems).toEqual([]);
    });
  });

  describe('completeActionItem edge cases', () => {
    it('should handle missing review gracefully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ pending: '0' }] });

      await expect(service.completeActionItem('nonexistent', 'action-1')).resolves.not.toThrow();
    });
  });

  describe('startReview edge cases', () => {
    it('should handle startReview for nonexistent review', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(service.startReview('nonexistent')).resolves.not.toThrow();
    });
  });
});
