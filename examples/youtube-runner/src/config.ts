import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../.env') });

export interface YouTubeConfig {
  channelId: string;
  credentialsFile: string;
  tokenFile: string;
}

export interface VideoCreationConfig {
  outputDir: string;
  tempDir: string;
  defaultFormat: string;
  maxDurationMinutes: number;
}

export interface UploadConfig {
  defaultPrivacy: 'private' | 'public' | 'unlisted';
  defaultCategory: string;
  tags: string[];
  schedule: {
    enabled: boolean;
    preferredTimes: string[];
  };
}

export interface AnalyticsConfig {
  reviewIntervalHours: number;
  metrics: string[];
  alertThresholds: {
    lowViews: number;
    highDislikeRatio: number;
  };
}

export interface Config {
  youtube: YouTubeConfig;
  videoCreation: VideoCreationConfig;
  upload: UploadConfig;
  analytics: AnalyticsConfig;
  databaseUrl: string;
}

export function loadConfig(): Config {
  return {
    youtube: {
      channelId: process.env.YOUTUBE_CHANNEL_ID || '',
      credentialsFile: 'credentials.json',
      tokenFile: 'token.json',
    },
    videoCreation: {
      outputDir: 'output/videos',
      tempDir: 'temp',
      defaultFormat: 'mp4',
      maxDurationMinutes: 15,
    },
    upload: {
      defaultPrivacy: 'private',
      defaultCategory: '22',
      tags: ['AI', 'Automation'],
      schedule: {
        enabled: true,
        preferredTimes: ['09:00', '15:00', '20:00'],
      },
    },
    analytics: {
      reviewIntervalHours: 24,
      metrics: ['views', 'likes', 'comments', 'watch_time'],
      alertThresholds: {
        lowViews: 100,
        highDislikeRatio: 0.3,
      },
    },
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/nezha',
  };
}
