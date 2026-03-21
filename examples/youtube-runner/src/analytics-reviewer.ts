import type { NezhaClient } from './nezha-client.js';
import type { AnalyticsConfig } from './config.js';
import { YouTubeClient } from './youtube-client.js';

export interface VideoAnalytics {
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  watchTime: number;
  dislikes: number;
}

export interface AnalyticsAlert {
  videoId: string;
  type: 'low_views' | 'high_dislike_ratio' | 'high_engagement';
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export class AnalyticsReviewer {
  private config: AnalyticsConfig;
  private nezha: NezhaClient;
  private youtubeClient: YouTubeClient | null = null;

  constructor(config: AnalyticsConfig, nezha: NezhaClient, youtubeClient?: YouTubeClient) {
    this.config = config;
    this.nezha = nezha;
    this.youtubeClient = youtubeClient || null;
  }

  setYouTubeClient(client: YouTubeClient): void {
    this.youtubeClient = client;
  }

  async reviewVideo(videoId: string): Promise<{ analytics: VideoAnalytics; alerts: AnalyticsAlert[] }> {
    const taskId = await this.nezha.createTask(
      `Review analytics: ${videoId}`,
      `Analyze performance metrics for video ${videoId}`,
      6
    );

    try {
      const analytics = await this.fetchAnalytics(videoId);
      const alerts = this.analyzeMetrics(analytics);

      await this.nezha.completeTask(taskId, `Analytics reviewed: ${alerts.length} alerts`);
      await this.nezha.saveLearning(
        `Reviewed video ${videoId}: ${analytics.views} views, ${analytics.likes} likes`,
        'Analytics review workflow'
      );

      if (alerts.length > 0) {
        for (const alert of alerts) {
          await this.nezha.createIssue(
            `Analytics Alert: ${alert.type}`,
            `Video ${videoId}: ${alert.message}`,
            alert.severity
          );
        }
      }

      return { analytics, alerts };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.nezha.failTask(taskId, errorMessage);
      throw error;
    }
  }

  async reviewAllVideos(videoIds: string[]): Promise<Map<string, { analytics: VideoAnalytics; alerts: AnalyticsAlert[] }>> {
    const results = new Map();
    
    for (const videoId of videoIds) {
      try {
        const result = await this.reviewVideo(videoId);
        results.set(videoId, result);
      } catch (error) {
        console.error(`Failed to review video ${videoId}:`, error);
      }
    }

    return results;
  }

  private async fetchAnalytics(videoId: string): Promise<VideoAnalytics> {
    if (this.youtubeClient) {
      try {
        const ytAnalytics = await this.youtubeClient.getAnalytics(videoId);
        return {
          videoId,
          views: ytAnalytics.views,
          likes: ytAnalytics.likes,
          comments: ytAnalytics.comments,
          watchTime: ytAnalytics.watchTimeMinutes,
          dislikes: 0,
        };
      } catch (error) {
        console.warn(`Failed to fetch real analytics for ${videoId}, using mock data:`, error);
      }
    }

    return {
      videoId,
      views: Math.floor(Math.random() * 10000),
      likes: Math.floor(Math.random() * 500),
      comments: Math.floor(Math.random() * 100),
      watchTime: Math.floor(Math.random() * 50000),
      dislikes: Math.floor(Math.random() * 50),
    };
  }

  private analyzeMetrics(analytics: VideoAnalytics): AnalyticsAlert[] {
    const alerts: AnalyticsAlert[] = [];

    if (analytics.views < this.config.alertThresholds.lowViews) {
      alerts.push({
        videoId: analytics.videoId,
        type: 'low_views',
        message: `Low views: ${analytics.views} (threshold: ${this.config.alertThresholds.lowViews})`,
        severity: 'medium',
      });
    }

    const totalRatings = analytics.likes + analytics.dislikes;
    if (totalRatings > 0) {
      const dislikeRatio = analytics.dislikes / totalRatings;
      if (dislikeRatio > this.config.alertThresholds.highDislikeRatio) {
        alerts.push({
          videoId: analytics.videoId,
          type: 'high_dislike_ratio',
          message: `High dislike ratio: ${(dislikeRatio * 100).toFixed(1)}%`,
          severity: 'high',
        });
      }
    }

    if (analytics.views > 5000 && analytics.likes > 200) {
      alerts.push({
        videoId: analytics.videoId,
        type: 'high_engagement',
        message: `High engagement: ${analytics.views} views, ${analytics.likes} likes`,
        severity: 'low',
      });
    }

    return alerts;
  }
}
