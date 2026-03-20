import type { NezhaClient } from './nezha-client.js';
import type { UploadConfig } from './config.js';
import type { VideoMetadata } from './video-creator.js';

export interface UploadResult {
  videoId: string;
  url: string;
  scheduledAt?: Date;
}

export class UploadManager {
  private config: UploadConfig;
  private nezha: NezhaClient;

  constructor(config: UploadConfig, nezha: NezhaClient) {
    this.config = config;
    this.nezha = nezha;
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
      const videoId = this.generateVideoId();
      const url = `https://youtube.com/watch?v=${videoId}`;

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
      const [hours, minutes] = time.split(':').map(Number);
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
