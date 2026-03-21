import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadManager } from '../upload-manager.js';
import type { NezhaClient } from '../nezha-client.js';
import type { UploadConfig } from '../config.js';
import type { VideoMetadata } from '../video-creator.js';
import { createMockNezhaClient, createMockYouTubeClient } from './mocks.js';

describe('UploadManager', () => {
  let uploadManager: UploadManager;
  let mockNezha: NezhaClient;
  let config: UploadConfig;

  const defaultMetadata: VideoMetadata = {
    title: 'Test Video',
    description: 'Test description',
    tags: ['test'],
    duration: 300,
    format: 'mp4',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      defaultPrivacy: 'private',
      defaultCategory: '22',
      tags: ['AI', 'Automation'],
      schedule: {
        enabled: true,
        preferredTimes: ['09:00', '15:00', '20:00'],
      },
    };

    mockNezha = createMockNezhaClient();
    uploadManager = new UploadManager(config, mockNezha);
  });

  describe('constructor', () => {
    it('should create UploadManager with config', () => {
      expect(uploadManager).toBeDefined();
    });

    it('should accept optional YouTubeClient', () => {
      const mockYouTube = createMockYouTubeClient();
      const manager = new UploadManager(config, mockNezha, mockYouTube);
      expect(manager).toBeDefined();
    });
  });

  describe('setYouTubeClient', () => {
    it('should set YouTube client', () => {
      const mockYouTube = createMockYouTubeClient();
      uploadManager.setYouTubeClient(mockYouTube);
    });
  });

  describe('uploadVideo', () => {
    it('should create task in nezha', async () => {
      await uploadManager.uploadVideo('/path/to/video.mp4', defaultMetadata);

      expect(mockNezha.createTask).toHaveBeenCalledWith(
        'Upload video: Test Video',
        expect.stringContaining('Upload video'),
        8
      );
    });

    it('should complete task on success', async () => {
      const result = await uploadManager.uploadVideo('/path/to/video.mp4', defaultMetadata);

      expect(mockNezha.completeTask).toHaveBeenCalledWith(
        'task-123',
        expect.stringContaining('Video uploaded')
      );
      expect(result.url).toContain('youtube.com');
    });

    it('should save learning on success', async () => {
      await uploadManager.uploadVideo('/path/to/video.mp4', defaultMetadata);

      expect(mockNezha.saveLearning).toHaveBeenCalledWith(
        expect.stringContaining('Uploaded video'),
        'YouTube upload workflow'
      );
    });

    it('should fail task on error', async () => {
      let callCount = 0;
      mockNezha.createTask = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Upload failed');
        return 'task-123';
      });

      await expect(
        uploadManager.uploadVideo('/path/to/video.mp4', defaultMetadata)
      ).rejects.toThrow('Upload failed');
    });

    it('should use YouTubeClient when available', async () => {
      const mockYouTube = createMockYouTubeClient();
      uploadManager.setYouTubeClient(mockYouTube);

      const result = await uploadManager.uploadVideo('/path/to/video.mp4', defaultMetadata);

      expect(mockYouTube.uploadVideo).toHaveBeenCalled();
      expect(result.videoId).toBe('yt_123');
    });

    it('should merge tags from config and metadata', async () => {
      const mockYouTube = createMockYouTubeClient();
      uploadManager.setYouTubeClient(mockYouTube);

      await uploadManager.uploadVideo('/path/to/video.mp4', defaultMetadata);

      const call = mockYouTube.uploadVideo.mock.calls[0];
      expect(call[1].tags).toContain('AI');
      expect(call[1].tags).toContain('Automation');
      expect(call[1].tags).toContain('test');
    });

    it('should use default privacy from config', async () => {
      const mockYouTube = createMockYouTubeClient();
      uploadManager.setYouTubeClient(mockYouTube);

      await uploadManager.uploadVideo('/path/to/video.mp4', defaultMetadata);

      const call = mockYouTube.uploadVideo.mock.calls[0];
      expect(call[1].privacy).toBe('private');
    });
  });

  describe('scheduleUpload', () => {
    it('should schedule video for future time', async () => {
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 24);

      const result = await uploadManager.scheduleUpload(
        '/path/to/video.mp4',
        defaultMetadata,
        scheduledTime
      );

      expect(result.scheduledAt).toEqual(scheduledTime);
    });

    it('should pass schedule to YouTubeClient', async () => {
      const mockYouTube = createMockYouTubeClient();
      uploadManager.setYouTubeClient(mockYouTube);

      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 24);

      await uploadManager.scheduleUpload('/path/to/video.mp4', defaultMetadata, scheduledTime);

      const call = mockYouTube.uploadVideo.mock.calls[0];
      expect(call[1].scheduledAt).toEqual(scheduledTime);
    });
  });
});
