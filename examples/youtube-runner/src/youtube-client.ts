import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { readFile, writeFile } from 'fs/promises';
import { createReadStream, existsSync as fileExists } from 'fs';
import type { YouTubeConfig } from './config.js';

export interface YouTubeVideoMetadata {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacy?: 'private' | 'public' | 'unlisted';
  scheduledAt?: Date;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: Date;
  privacy: string;
}

export interface YouTubeAnalytics {
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  watchTimeMinutes: number;
  averageViewDuration: number;
}

export class YouTubeClient {
  private config: YouTubeConfig;
  private oauth2Client: OAuth2Client | null = null;
  private youtube: ReturnType<typeof google.youtube> | null = null;

  constructor(config: YouTubeConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const credentials = await this.loadCredentials();

    this.oauth2Client = new OAuth2Client({
      clientId: credentials.installed.client_id,
      clientSecret: credentials.installed.client_secret,
      redirectUri: credentials.installed.redirect_uris[0],
    });

    const tokenExists = await this.loadToken();
    if (!tokenExists) {
      await this.authorize();
    }

    this.youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
  }

  private async loadCredentials(): Promise<{
    installed: { client_id: string; client_secret: string; redirect_uris: string[] };
  }> {
    try {
      const content = await readFile(this.config.credentialsFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      throw new Error(
        `Failed to load credentials from ${this.config.credentialsFile}. Please download credentials.json from Google Cloud Console.`
      );
    }
  }

  private async loadToken(): Promise<boolean> {
    if (!fileExists(this.config.tokenFile)) {
      return false;
    }

    try {
      const content = await readFile(this.config.tokenFile, 'utf-8');
      const token = JSON.parse(content);
      this.oauth2Client!.setCredentials(token);
      return true;
    } catch {
      return false;
    }
  }

  private async authorize(): Promise<void> {
    const authUrl = this.oauth2Client!.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
      ],
    });

    console.log('Authorize this app by visiting this URL:', authUrl);
    console.log('After authorization, paste the code here:');

    const code = await new Promise<string>(resolve => {
      process.stdin.once('data', data => {
        resolve(data.toString().trim());
      });
    });

    const { tokens } = await this.oauth2Client!.getToken(code);
    this.oauth2Client!.setCredentials(tokens);

    await writeFile(this.config.tokenFile, JSON.stringify(tokens));
    console.log('Token stored to', this.config.tokenFile);
  }

  async uploadVideo(
    filePath: string,
    metadata: YouTubeVideoMetadata
  ): Promise<{ videoId: string; url: string }> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized. Call initialize() first.');
    }

    const status: Record<string, string> = {
      privacyStatus: metadata.privacy || 'private',
    };

    if (metadata.scheduledAt) {
      status.publishAt = metadata.scheduledAt.toISOString();
    }

    const response = await this.youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId || '22',
        },
        status,
      },
      media: {
        body: createReadStream(filePath),
      },
    });

    const videoId = response.data.id!;
    const url = `https://youtube.com/watch?v=${videoId}`;

    return { videoId, url };
  }

  async getVideo(videoId: string): Promise<YouTubeVideo | null> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized. Call initialize() first.');
    }

    const response = await this.youtube.videos.list({
      part: ['snippet', 'status'],
      id: [videoId],
    });

    const video = response.data.items?.[0];
    if (!video) {
      return null;
    }

    return {
      id: video.id!,
      title: video.snippet?.title || '',
      description: video.snippet?.description || '',
      publishedAt: new Date(video.snippet?.publishedAt || ''),
      privacy: video.status?.privacyStatus || 'private',
    };
  }

  async listVideos(maxResults: number = 50): Promise<YouTubeVideo[]> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized. Call initialize() first.');
    }

    const response = await this.youtube.search.list({
      part: ['snippet'],
      channelId: this.config.channelId,
      type: ['video'],
      maxResults,
      order: 'date',
    });

    return (response.data.items || []).map(item => ({
      id: item.id?.videoId!,
      title: item.snippet?.title || '',
      description: item.snippet?.description || '',
      publishedAt: new Date(item.snippet?.publishedAt || ''),
      privacy: 'unknown',
    }));
  }

  async getAnalytics(videoId: string): Promise<YouTubeAnalytics> {
    if (!this.oauth2Client) {
      throw new Error('YouTube client not initialized. Call initialize() first.');
    }

    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: this.oauth2Client });

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const response = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,likes,comments,averageViewDuration,estimatedMinutesWatched',
      dimensions: 'video',
      filters: `video==${videoId}`,
    });

    const row = response.data.rows?.[0];
    if (!row) {
      return {
        videoId,
        views: 0,
        likes: 0,
        comments: 0,
        watchTimeMinutes: 0,
        averageViewDuration: 0,
      };
    }

    return {
      videoId,
      views: Number(row[1]) || 0,
      likes: Number(row[2]) || 0,
      comments: Number(row[3]) || 0,
      watchTimeMinutes: Number(row[5]) || 0,
      averageViewDuration: Number(row[4]) || 0,
    };
  }

  async deleteVideo(videoId: string): Promise<void> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized. Call initialize() first.');
    }

    await this.youtube.videos.delete({
      id: videoId,
    });
  }

  async updateVideoMetadata(
    videoId: string,
    metadata: Partial<YouTubeVideoMetadata>
  ): Promise<void> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized. Call initialize() first.');
    }

    const existingVideo = await this.getVideo(videoId);
    if (!existingVideo) {
      throw new Error(`Video ${videoId} not found`);
    }

    await this.youtube.videos.update({
      part: ['snippet'],
      requestBody: {
        id: videoId,
        snippet: {
          title: metadata.title || existingVideo.title,
          description: metadata.description || existingVideo.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId || '22',
        },
      },
    });
  }
}
