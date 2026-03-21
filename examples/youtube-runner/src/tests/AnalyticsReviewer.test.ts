import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsReviewer } from '../analytics-reviewer.js';
import type { NezhaClient } from '../nezha-client.js';
import type { AnalyticsConfig } from '../config.js';
import { createMockNezhaClient, createMockYouTubeClient } from './mocks.js';

describe('AnalyticsReviewer', () => {
  let analyticsReviewer: AnalyticsReviewer;
  let mockNezha: NezhaClient;
  let config: AnalyticsConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      reviewIntervalHours: 24,
      metrics: ['views', 'likes', 'comments', 'watch_time'],
      alertThresholds: {
        lowViews: 100,
        highDislikeRatio: 0.3,
      },
    };

    mockNezha = createMockNezhaClient();
    analyticsReviewer = new AnalyticsReviewer(config, mockNezha);
  });

  describe('constructor', () => {
    it('should create AnalyticsReviewer with config', () => {
      expect(analyticsReviewer).toBeDefined();
    });

    it('should accept optional YouTubeClient', () => {
      const mockYouTube = createMockYouTubeClient();
      const reviewer = new AnalyticsReviewer(config, mockNezha, mockYouTube);
      expect(reviewer).toBeDefined();
    });
  });

  describe('setYouTubeClient', () => {
    it('should set YouTube client', () => {
      const mockYouTube = createMockYouTubeClient();
      analyticsReviewer.setYouTubeClient(mockYouTube);
    });
  });

  describe('reviewVideo', () => {
    it('should create task in nezha', async () => {
      await analyticsReviewer.reviewVideo('yt_123');

      expect(mockNezha.createTask).toHaveBeenCalledWith(
        'Review analytics: yt_123',
        expect.stringContaining('Analyze performance'),
        6
      );
    });

    it('should complete task on success', async () => {
      const result = await analyticsReviewer.reviewVideo('yt_123');

      expect(mockNezha.completeTask).toHaveBeenCalledWith(
        'task-123',
        expect.stringContaining('Analytics reviewed')
      );
      expect(result.analytics).toBeDefined();
      expect(result.alerts).toBeDefined();
    });

    it('should save learning on success', async () => {
      await analyticsReviewer.reviewVideo('yt_123');

      expect(mockNezha.saveLearning).toHaveBeenCalledWith(
        expect.stringContaining('Reviewed video'),
        'Analytics review workflow'
      );
    });

    it('should fail task on error', async () => {
      mockNezha.createTask.mockResolvedValueOnce('task-123');
      mockNezha.completeTask = vi.fn().mockRejectedValue(new Error('Review failed'));

      await expect(analyticsReviewer.reviewVideo('yt_123')).rejects.toThrow('Review failed');

      expect(mockNezha.failTask).toHaveBeenCalledWith('task-123', 'Review failed');
    });

    it('should use YouTubeClient when available', async () => {
      const mockYouTube = createMockYouTubeClient();
      analyticsReviewer.setYouTubeClient(mockYouTube);

      const result = await analyticsReviewer.reviewVideo('yt_123');

      expect(mockYouTube.getAnalytics).toHaveBeenCalledWith('yt_123');
      expect(result.analytics.views).toBe(100);
    });

    it('should generate low views alert', async () => {
      const mockYouTube = createMockYouTubeClient();
      mockYouTube.getAnalytics.mockResolvedValueOnce({
        videoId: 'yt_123',
        views: 50,
        likes: 10,
        comments: 5,
        watchTimeMinutes: 100,
        averageViewDuration: 5,
      });
      analyticsReviewer.setYouTubeClient(mockYouTube);

      const result = await analyticsReviewer.reviewVideo('yt_123');

      const lowViewsAlert = result.alerts.find(a => a.type === 'low_views');
      expect(lowViewsAlert).toBeDefined();
      expect(lowViewsAlert?.severity).toBe('medium');
    });

    it('should generate high engagement alert for popular videos', async () => {
      const mockYouTube = createMockYouTubeClient();
      mockYouTube.getAnalytics.mockResolvedValueOnce({
        videoId: 'yt_123',
        views: 10000,
        likes: 500,
        comments: 100,
        watchTimeMinutes: 50000,
        averageViewDuration: 300,
      });
      analyticsReviewer.setYouTubeClient(mockYouTube);

      const result = await analyticsReviewer.reviewVideo('yt_123');

      const engagementAlert = result.alerts.find(a => a.type === 'high_engagement');
      expect(engagementAlert).toBeDefined();
      expect(engagementAlert?.severity).toBe('low');
    });

    it('should create issue for alerts', async () => {
      const mockYouTube = createMockYouTubeClient();
      mockYouTube.getAnalytics.mockResolvedValueOnce({
        videoId: 'yt_123',
        views: 50,
        likes: 10,
        comments: 5,
        watchTimeMinutes: 100,
        averageViewDuration: 5,
      });
      analyticsReviewer.setYouTubeClient(mockYouTube);

      await analyticsReviewer.reviewVideo('yt_123');

      expect(mockNezha.createIssue).toHaveBeenCalled();
    });
  });

  describe('reviewAllVideos', () => {
    it('should review multiple videos', async () => {
      const videoIds = ['yt_1', 'yt_2', 'yt_3'];
      const results = await analyticsReviewer.reviewAllVideos(videoIds);

      expect(results.size).toBe(3);
      expect(results.has('yt_1')).toBe(true);
      expect(results.has('yt_2')).toBe(true);
      expect(results.has('yt_3')).toBe(true);
    });

    it('should handle errors for individual videos', async () => {
      mockNezha.createTask
        .mockResolvedValueOnce('task-1')
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('task-3');

      const videoIds = ['yt_1', 'yt_2', 'yt_3'];
      const results = await analyticsReviewer.reviewAllVideos(videoIds);

      expect(results.size).toBe(2);
      expect(results.has('yt_1')).toBe(true);
      expect(results.has('yt_2')).toBe(false);
      expect(results.has('yt_3')).toBe(true);
    });
  });
});
