import type { NezhaClient } from './nezha-client.js';
import type { VideoCreationConfig } from './config.js';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  duration: number;
  format: string;
}

export interface VideoResult {
  filePath: string;
  metadata: VideoMetadata;
}

export class VideoCreator {
  private config: VideoCreationConfig;
  private nezha: NezhaClient;

  constructor(config: VideoCreationConfig, nezha: NezhaClient) {
    this.config = config;
    this.nezha = nezha;
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.outputDir, { recursive: true });
    await mkdir(this.config.tempDir, { recursive: true });
    await this.nezha.saveLearning('VideoCreator initialized', 'System startup');
  }

  async createVideo(topic: string, options?: Partial<VideoMetadata>): Promise<VideoResult> {
    const taskId = await this.nezha.createTask(
      `Create video: ${topic}`,
      `Generate video content for topic: ${topic}`,
      7
    );

    try {
      const metadata: VideoMetadata = {
        title: options?.title || this.generateTitle(topic),
        description: options?.description || this.generateDescription(topic),
        tags: options?.tags || this.generateTags(topic),
        duration: options?.duration || 300,
        format: options?.format || this.config.defaultFormat,
      };

      const filePath = resolve(
        this.config.outputDir,
        `${this.sanitizeFilename(metadata.title)}.${metadata.format}`
      );

      await this.nezha.completeTask(taskId, `Video created: ${filePath}`);
      await this.nezha.saveLearning(
        `Created video for topic: ${topic}`,
        'Video creation workflow'
      );

      return { filePath, metadata };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.nezha.failTask(taskId, errorMessage);
      throw error;
    }
  }

  private generateTitle(topic: string): string {
    return `${topic} - AI Generated Content`;
  }

  private generateDescription(topic: string): string {
    return `This video explores ${topic} using AI-powered content generation.\n\n#AI #Automation #${topic.replace(/\s+/g, '')}`;
  }

  private generateTags(topic: string): string[] {
    return ['AI', 'Automation', topic.replace(/\s+/g, '')];
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  }
}
