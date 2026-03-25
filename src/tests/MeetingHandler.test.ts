import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingHandler, type DiscussionTask } from '../services/MeetingHandler.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
  })),
}));

vi.mock('../config/Config.js', () => ({
  Config: {
    getInstance: () => ({
      getAgentId: () => 'test-agent-id',
    }),
  },
}));

vi.mock('../services/ai/index.js', () => ({
  AIProviderFactory: {
    createFromEnv: vi.fn().mockReturnValue({
      complete: vi.fn().mockResolvedValue({ content: 'opinion content' }),
    }),
  },
}));

describe('MeetingHandler', () => {
  let handler: MeetingHandler;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      query: vi.fn(),
    };
    handler = new MeetingHandler(mockDb);
  });

  describe('constructor', () => {
    it('should create handler', () => {
      expect(handler).toBeDefined();
    });
  });

  describe('DiscussionTask interface', () => {
    it('should define task structure', () => {
      const task: DiscussionTask = {
        id: 'task-1',
        title: 'Discussion: Architecture Decision',
        description: 'We need to decide on the architecture',
        status: 'PENDING',
        priority: 5,
      };
      expect(task.id).toBe('task-1');
    });
  });

  describe('createMeetingFromTask', () => {
    it('should create meeting and return id', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const task: DiscussionTask = {
        id: 'task-1',
        title: 'Discussion: Test',
        description: 'Test description',
        status: 'PENDING',
        priority: 5,
      };

      const meetingId = await handler.createMeetingFromTask(task);

      expect(meetingId).toBeDefined();
      expect(typeof meetingId).toBe('string');
      expect(mockDb.query).toHaveBeenCalled();
    });
  });
});
