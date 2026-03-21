import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoCreator, type VideoMetadata } from '../video-creator.js';
import type { NezhaClient } from '../nezha-client.js';
import { createMockNezhaClient } from './mocks.js';
import type { VideoCreationConfig } from '../config.js';

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('VideoCreator', () => {
  let videoCreator: VideoCreator;
  let mockNezha: NezhaClient;
  let config: VideoCreationConfig;

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
      outputDir: 'output/videos',
      tempDir: 'temp',
      defaultFormat: 'mp4',
      maxDurationMinutes: 15,
    };

    mockNezha = createMockNezhaClient();
    videoCreator = new VideoCreator(config, mockNezha);
  });

  describe('constructor', () => {
    it('should create VideoCreator with config', () => {
      expect(videoCreator).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should create output directories', async () => {
      await videoCreator.initialize();
      const { mkdir } = await import('fs/promises');
      expect(mkdir).toHaveBeenCalledWith(config.outputDir, { recursive: true });
      expect(mkdir).toHaveBeenCalledWith(config.tempDir, { recursive: true });
    });

    it('should save learning on init', async () => {
      await videoCreator.initialize();
      expect(mockNezha.saveLearning).toHaveBeenCalledWith(
        'VideoCreator initialized',
        'System startup'
      );
    });
  });

  describe('createVideo', () => {
    it('should create video with default metadata', async () => {
      const result = await videoCreator.createVideo('Test Topic');

      expect(result.metadata.title).toBe('Test Topic - AI Generated Content');
      expect(result.metadata.tags).toContain('AI');
      expect(result.metadata.tags).toContain('Automation');
      expect(result.filePath).toContain(config.outputDir);
    });

    it('should create video with custom metadata', async () => {
      const customMetadata: Partial<VideoMetadata> = {
        title: 'Custom Title',
        description: 'Custom Description',
        tags: ['custom', 'video'],
      };

      const result = await videoCreator.createVideo('Test Topic', customMetadata);

      expect(result.metadata.title).toBe('Custom Title');
      expect(result.metadata.description).toBe('Custom Description');
      expect(result.metadata.tags).toContain('custom');
    });

    it('should create task in nezha', async () => {
      await videoCreator.createVideo('Test Topic');

      expect(mockNezha.createTask).toHaveBeenCalledWith(
        'Create video: Test Topic',
        expect.stringContaining('Generate video content'),
        7
      );
    });

    it('should complete task on success', async () => {
      await videoCreator.createVideo('Test Topic');

      expect(mockNezha.completeTask).toHaveBeenCalledWith(
        'task-123',
        expect.stringContaining('Video created')
      );
    });

    it('should save learning on success', async () => {
      await videoCreator.createVideo('Test Topic');

      expect(mockNezha.saveLearning).toHaveBeenCalledWith(
        expect.stringContaining('Created video for topic'),
        'Video creation workflow'
      );
    });

    it('should fail task on error', async () => {
      let callCount = 0;
      mockNezha.createTask = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('DB Error');
        return 'task-123';
      });

      await expect(videoCreator.createVideo('Test Topic')).rejects.toThrow('DB Error');
    });

    it('should sanitize filename', async () => {
      const customMetadata: Partial<VideoMetadata> = {
        title: 'Test Video With Spaces & Special Characters!',
      };

      const result = await videoCreator.createVideo('Topic', customMetadata);

      expect(result.filePath).not.toContain(' ');
      expect(result.filePath).not.toContain('&');
    });
  });

  describe('generateTitle', () => {
    it('should generate default title format', async () => {
      const result = await videoCreator.createVideo('My Topic');

      expect(result.metadata.title).toMatch(/My Topic - AI Generated Content/);
    });
  });

  describe('generateDescription', () => {
    it('should generate description with topic', async () => {
      const result = await videoCreator.createVideo('JavaScript');

      expect(result.metadata.description).toContain('JavaScript');
      expect(result.metadata.description).toContain('#AI');
      expect(result.metadata.description).toContain('#Automation');
    });
  });

  describe('generateTags', () => {
    it('should include AI and Automation tags', async () => {
      const result = await videoCreator.createVideo('Python');

      expect(result.metadata.tags).toContain('AI');
      expect(result.metadata.tags).toContain('Automation');
    });

    it('should include topic without spaces', async () => {
      const result = await videoCreator.createVideo('Machine Learning');

      expect(result.metadata.tags).toContain('MachineLearning');
    });
  });
});
