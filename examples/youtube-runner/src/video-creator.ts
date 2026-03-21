import type { NezhaClient } from './nezha-client.js';
import type { VideoCreationConfig } from './config.js';
import { mkdir, unlink } from 'fs/promises';
import { resolve, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  duration: number;
  format: string;
  imageUrl?: string;
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
        duration: options?.duration || 60,
        format: options?.format || this.config.defaultFormat,
        imageUrl: options?.imageUrl,
      };

      const fileName = `${this.sanitizeFilename(metadata.title)}.${metadata.format}`;
      const filePath = resolve(this.config.outputDir, fileName);

      if (metadata.imageUrl) {
        await this.generateVideoFromImage(filePath, metadata);
      } else {
        await this.generateVideoWithFFmpeg(filePath, metadata);
      }

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

  private async generateVideoFromImage(
    outputPath: string,
    metadata: VideoMetadata
  ): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });

    const tempImagePath = resolve(this.config.tempDir, 'source-image.jpg');
    const downloadCmd = `curl -L -o "${tempImagePath}" "${metadata.imageUrl}"`;

    try {
      await execAsync(downloadCmd, { maxBuffer: 10 * 1024 * 1024 });
    } catch {
      throw new Error(`Failed to download image from ${metadata.imageUrl}`);
    }

    const totalFrames = metadata.duration * 30;
    const zoomEnd = 1.3;

    const cmd = [
      'ffmpeg -y',
      `-loop 1 -i "${tempImagePath}"`,
      `-f lavfi -i "sine=frequency=523:duration=${metadata.duration}"`,
      `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,zoompan=z='min(zoom+0.0015,${zoomEnd})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=30"`,
      `-c:v libx264 -preset medium -crf 23`,
      `-c:a aac -b:a 128k`,
      `-t ${metadata.duration}`,
      `"${outputPath}"`,
    ].join(' ');

    try {
      const { stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
      if (stderr.includes('Error') || stderr.includes('error')) {
        console.log('FFmpeg stderr:', stderr);
      }
    } catch (error) {
      throw new Error(`FFmpeg video generation failed: ${error}`);
    } finally {
      if (existsSync(tempImagePath)) {
        await unlink(tempImagePath).catch(() => {});
      }
    }
  }

  private async generateVideoWithFFmpeg(
    outputPath: string,
    metadata: VideoMetadata
  ): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });

    const colors = ['0xFF6B6B', '0x4ECDC4', '0x45B7D1', '0x96CEB4', '0xFFEAA7', '0xDDA0DD'];
    const bgColor = colors[Math.floor(Math.random() * colors.length)];

    const cmd = [
      'ffmpeg -y',
      `-f lavfi -i "color=c=${bgColor}:s=1920x1080:d=${metadata.duration}:r=30"`,
      `-f lavfi -i "sine=frequency=440:duration=${metadata.duration}"`,
      `-c:v libx264 -preset medium -crf 23`,
      `-c:a aac -b:a 128k`,
      `-t ${metadata.duration}`,
      `"${outputPath}"`,
    ].join(' ');

    try {
      const { stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
      if (stderr.includes('Error') || stderr.includes('error')) {
        console.log('FFmpeg stderr:', stderr);
      }
    } catch (error) {
      throw new Error(`FFmpeg video generation failed: ${error}`);
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
