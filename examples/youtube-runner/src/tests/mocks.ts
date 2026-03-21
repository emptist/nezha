import type { NezhaClient } from '../nezha-client.js';

export const createMockNezhaClient = (): NezhaClient =>
  ({
    createTask: vi.fn().mockResolvedValue('task-123'),
    getPendingTasks: vi.fn().mockResolvedValue([]),
    completeTask: vi.fn().mockResolvedValue(undefined),
    failTask: vi.fn().mockResolvedValue(undefined),
    createIssue: vi.fn().mockResolvedValue('issue-123'),
    saveLearning: vi.fn().mockResolvedValue(undefined),
    getSkill: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  }) as unknown as NezhaClient;

export const createMockYouTubeClient = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  uploadVideo: vi
    .fn()
    .mockResolvedValue({ videoId: 'yt_123', url: 'https://youtube.com/watch?v=yt_123' }),
  getVideo: vi
    .fn()
    .mockResolvedValue({
      id: 'yt_123',
      title: 'Test',
      description: 'Test',
      publishedAt: new Date(),
      privacy: 'private',
    }),
  listVideos: vi.fn().mockResolvedValue([]),
  getAnalytics: vi
    .fn()
    .mockResolvedValue({
      videoId: 'yt_123',
      views: 100,
      likes: 10,
      comments: 5,
      watchTimeMinutes: 500,
      averageViewDuration: 5,
    }),
  deleteVideo: vi.fn().mockResolvedValue(undefined),
  updateVideoMetadata: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
});
