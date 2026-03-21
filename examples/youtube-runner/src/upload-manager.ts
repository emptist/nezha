import type { NezhaClient } from './nezha-client.js';
import type { UploadConfig } from './config.js';
import type { VideoMetadata } from './video-creator.js';
import { YouTubeClient, type YouTubeVideoMetadata } from './youtube-client.js';

export interface UploadResult {
  videoId: string;
  url: string;
  scheduledAt?: Date;
}

export class UploadManager {
  private config: UploadConfig;
  private nezha: NezhaClient;
  private youtubeClient: YouTubeClient | null = null;

  constructor(config: UploadConfig, nezha: NezhaClient, youtubeClient?: YouTubeClient) {
    this.config = config;
    this.nezha = nezha;
    this.youtubeClient = youtubeClient || null;
  }

  setYouTubeClient(client: YouTubeClient): void {
    this.youtubeClient = client;
  }

  async uploadVideo(
    filePath: string,
    metadata: VideoMetadata,
    schedule?: Date
  ): Promise<UploadResult> {
    const taskId = await this.nezha.createTask(
      `Upload video: ${metadata.title}`,
      `Upload video from ${filePath} to YouTube`,
      8
    );

    try {
      let videoId: string;
      let url: string;

      if (this.youtubeClient) {
        const ytMetadata: YouTubeVideoMetadata = {
          title: metadata.title,
          description: metadata.description,
          tags: [...this.config.tags, ...metadata.tags],
          categoryId: this.config.defaultCategory,
          privacy: this.config.defaultPrivacy,
          scheduledAt: schedule,
        };

        const result = await this.youtubeClient.uploadVideo(filePath, ytMetadata);
        videoId = result.videoId;
        url = result.url;
      } else {
        videoId = this.generateVideoId();
        url = `https://youtube.com/watch?v=${videoId}`;
      }

      const scheduledAt = schedule || (this.config.schedule.enabled 
        ? this.getNextScheduleTime() 
        : undefined);

      await this.nezha.completeTask(taskId, `Video uploaded: ${url}`);
      await this.nezha.saveLearning(
        `Uploaded video: ${metadata.title}`,
        'YouTube upload workflow'
      );

      return { videoId, url, scheduledAt };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.nezha.failTask(taskId, errorMessage);
      throw error;
    }
  }

  async scheduleUpload(
    filePath: string,
    metadata: VideoMetadata,
    scheduledTime: Date
  ): Promise<UploadResult> {
    return this.uploadVideo(filePath, metadata, scheduledTime);
  }

  private getNextScheduleTime(): Date {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    for (const time of this.config.schedule.preferredTimes) {
      const scheduleTime = new Date(`${today}T${time}:00`);
      
      if (scheduleTime > now) {
        return scheduleTime;
      }
    }

    const [hours, minutes] = this.config.schedule.preferredTimes[0].split(':').map(Number);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hours, minutes, 0, 0);
    
    return tomorrow;
  }

  private generateVideoId(): string {
    return `yt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
