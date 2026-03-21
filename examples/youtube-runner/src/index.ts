import { loadConfig, type Config, type VideoCreationConfig, type UploadConfig, type AnalyticsConfig } from './config.js';
import { NezhaClient } from './nezha-client.js';
import { VideoCreator } from './video-creator.js';
import { UploadManager } from './upload-manager.js';
import { AnalyticsReviewer } from './analytics-reviewer.js';
import { YouTubeClient } from './youtube-client.js';

export class YouTubeRunner {
  private config: Config;
  private nezha: NezhaClient;
  private videoCreator: VideoCreator;
  private uploadManager: UploadManager;
  private analyticsReviewer: AnalyticsReviewer;
  private youtubeClient: YouTubeClient | null = null;

  constructor(config?: Config) {
    this.config = config || loadConfig();
    this.nezha = new NezhaClient(this.config);
    this.videoCreator = new VideoCreator(this.config.videoCreation, this.nezha);
    this.uploadManager = new UploadManager(this.config.upload, this.nezha);
    this.analyticsReviewer = new AnalyticsReviewer(this.config.analytics, this.nezha);
  }

  async initialize(useRealYouTube: boolean = false): Promise<void> {
    await this.videoCreator.initialize();
    
    if (useRealYouTube && this.config.youtube.channelId) {
      this.youtubeClient = new YouTubeClient(this.config.youtube);
      await this.youtubeClient.initialize();
      this.uploadManager.setYouTubeClient(this.youtubeClient);
      this.analyticsReviewer.setYouTubeClient(this.youtubeClient);
    }

    await this.nezha.saveLearning('YouTubeRunner initialized', 'System startup');
  }

  async createAndUpload(topic: string): Promise<{ videoPath: string; uploadUrl: string }> {
    const video = await this.videoCreator.createVideo(topic);
    const upload = await this.uploadManager.uploadVideo(video.filePath, video.metadata);

    return {
      videoPath: video.filePath,
      uploadUrl: upload.url,
    };
  }

  async scheduleVideo(topic: string, scheduledTime: Date): Promise<{ videoPath: string; uploadUrl: string }> {
    const video = await this.videoCreator.createVideo(topic);
    const upload = await this.uploadManager.scheduleUpload(video.filePath, video.metadata, scheduledTime);

    return {
      videoPath: video.filePath,
      uploadUrl: upload.url,
    };
  }

  async reviewAnalytics(videoIds: string[]): Promise<void> {
    await this.analyticsReviewer.reviewAllVideos(videoIds);
  }

  async listVideos(maxResults: number = 50): Promise<Array<{ id: string; title: string; url: string }>> {
    if (!this.youtubeClient) {
      throw new Error('YouTube client not initialized. Call initialize(true) first.');
    }

    const videos = await this.youtubeClient.listVideos(maxResults);
    return videos.map(v => ({
      id: v.id,
      title: v.title,
      url: `https://youtube.com/watch?v=${v.id}`,
    }));
  }

  async getPendingTasks(): Promise<Array<{ id: string; title: string; description: string }>> {
    return this.nezha.getPendingTasks();
  }

  async close(): Promise<void> {
    await this.nezha.close();
  }
}

export { loadConfig, NezhaClient, VideoCreator, UploadManager, AnalyticsReviewer, YouTubeClient };
export type { Config, VideoCreationConfig, UploadConfig, AnalyticsConfig };
