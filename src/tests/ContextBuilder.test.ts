import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContextBuilder,
  type BuiltContext,
  type ContextMemoryResult,
} from '../services/ContextBuilder.js';
import { DatabaseClient } from '../db/DatabaseClient.js';

vi.mock('fs/promises');
vi.mock('../core/Memory.js');
vi.mock('../services/DailyMemory.js');
vi.mock('../services/InterReviewService.js');

describe('ContextBuilder', () => {
  let contextBuilder: ContextBuilder;
  let mockDb: any;
  let fs: any;
  let MemoryService: any;
  let DailyMemoryService: any;
  let InterReviewService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    fs = await import('fs/promises');
    const Memory = await import('../core/Memory.js');
    const DailyMemory = await import('../services/DailyMemory.js');
    const InterReview = await import('../services/InterReviewService.js');

    MemoryService = Memory.MemoryService;
    DailyMemoryService = DailyMemory.DailyMemoryService;
    InterReviewService = InterReview.InterReviewService;

    mockDb = {
      query: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default values', () => {
      const builder = new ContextBuilder(mockDb as unknown as DatabaseClient);
      expect(builder).toBeDefined();
    });

    it('should use custom memory directory when provided', () => {
      const builder = new ContextBuilder(mockDb as unknown as DatabaseClient, {
        memoryDir: '/custom/memory',
      });
      expect(builder).toBeDefined();
    });
  });

  describe('buildContext', () => {
    it('should build context with all components', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([{ id: '1', content: 'Test memory', metadata: {} }]),
        vectorSearch: vi
          .fn()
          .mockResolvedValue([{ id: '1', content: 'Test memory', similarity: 0.8, metadata: {} }]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue('Today: Did some work'),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue('Review learning content'),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockResolvedValue(undefined);
      fs.readFile = vi.fn().mockResolvedValue('Curated memory content');

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({
        taskId: 'task-1',
        title: 'Test Task',
        description: 'Test task description',
      });

      expect(result.originalTask).toBe('Test task description');
      expect(result.relevantMemories).toBeDefined();
      expect(result.todayMemory).toBeDefined();
      expect(result.curatedMemory).toBeDefined();
      expect(result.reviewLearnings).toBeDefined();
      expect(result.combinedPrompt).toBeDefined();
    });

    it('should use title when description is not provided', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockRejectedValue(new Error('File not found'));
      fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({
        taskId: 'task-1',
        title: 'Task Title Only',
      });

      expect(result.originalTask).toBe('Task Title Only');
    });
  });

  describe('combineContext', () => {
    it('should include curated memory when present', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockResolvedValue(undefined);
      fs.readFile = vi.fn().mockResolvedValue('Long-term memory content');

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({
        taskId: 'task-1',
        title: 'Test',
      });

      expect(result.combinedPrompt).toContain('Long-term Memory');
      expect(result.combinedPrompt).toContain('Long-term memory content');
    });

    it('should include review learnings when present', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue('Review findings: Be more careful'),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockRejectedValue(new Error('Not found'));
      fs.readFile = vi.fn().mockRejectedValue(new Error('Not found'));

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({
        taskId: 'task-1',
        title: 'Test',
      });

      expect(result.combinedPrompt).toContain('AI Review Learnings');
      expect(result.combinedPrompt).toContain('Review findings: Be more careful');
    });

    it('should include relevant memories when present', async () => {
      const memories: ContextMemoryResult[] = [
        { id: '1', content: 'Earlier we learned that X is better than Y', similarity: 0.85 },
      ];
      const mockMemory = {
        search: vi.fn().mockResolvedValue(memories),
        vectorSearch: vi.fn().mockResolvedValue(memories),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockRejectedValue(new Error('Not found'));
      fs.readFile = vi.fn().mockRejectedValue(new Error('Not found'));

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({
        taskId: 'task-1',
        title: 'Test',
      });

      expect(result.combinedPrompt).toContain('Relevant Past Experience');
      expect(result.combinedPrompt).toContain('Earlier we learned that X is better than Y');
    });

    it('should include today memory when present', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue('Line 1\nLine 2\nLine 3'),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockRejectedValue(new Error('Not found'));
      fs.readFile = vi.fn().mockRejectedValue(new Error('Not found'));

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({
        taskId: 'task-1',
        title: 'Test',
      });

      expect(result.combinedPrompt).toContain("Today's Activity");
    });

    it('should include current task', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockRejectedValue(new Error('Not found'));
      fs.readFile = vi.fn().mockRejectedValue(new Error('Not found'));

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({
        taskId: 'task-1',
        title: 'Implement feature X',
      });

      expect(result.combinedPrompt).toContain('## Current Task');
      expect(result.combinedPrompt).toContain('Implement feature X');
    });

    it('should truncate long memories', async () => {
      const longContent = 'A'.repeat(300);
      const memories: ContextMemoryResult[] = [{ id: '1', content: longContent, similarity: 0.8 }];
      const mockMemory = {
        search: vi.fn().mockResolvedValue(memories),
        vectorSearch: vi.fn().mockResolvedValue(memories),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockRejectedValue(new Error('Not found'));
      fs.readFile = vi.fn().mockRejectedValue(new Error('Not found'));

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({
        taskId: 'task-1',
        title: 'Test',
      });

      expect(result.combinedPrompt).toContain('...');
    });
  });

  describe('loadCuratedMemory', () => {
    it('should cache curated memory', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockResolvedValue(undefined);
      fs.readFile = vi.fn().mockResolvedValue('Cached memory content');

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      await contextBuilder.buildContext({ taskId: '1', title: 'Test' });
      await contextBuilder.buildContext({ taskId: '2', title: 'Test' });

      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it('should return empty string when file not found', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.access = vi.fn().mockRejectedValue(new Error('File not found'));

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      const result = await contextBuilder.buildContext({ taskId: '1', title: 'Test' });

      expect(result.curatedMemory).toBe('');
    });
  });

  describe('updateCuratedMemory', () => {
    it('should update curated memory file', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.mkdir = vi.fn().mockResolvedValue(undefined);
      fs.writeFile = vi.fn().mockResolvedValue(undefined);

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      await contextBuilder.updateCuratedMemory('New memory content');

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should throw error when write fails', async () => {
      const mockMemory = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn().mockResolvedValue([]),
      };
      MemoryService.mockImplementation(() => mockMemory);

      const mockDailyMemory = {
        readToday: vi.fn().mockResolvedValue(''),
      };
      DailyMemoryService.mockImplementation(() => mockDailyMemory);

      const mockInterReview = {
        getLearningsForAIContext: vi.fn().mockResolvedValue(''),
      };
      InterReviewService.mockImplementation(() => mockInterReview);

      fs.mkdir = vi.fn().mockRejectedValue(new Error('Permission denied'));

      contextBuilder = new ContextBuilder(mockDb as unknown as DatabaseClient);

      await expect(contextBuilder.updateCuratedMemory('Content')).rejects.toThrow(
        'Permission denied'
      );
    });
  });
});
