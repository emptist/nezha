import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingHandler, type DiscussionTask, type Opinion } from '../services/MeetingHandler.js';

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

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MeetingHandler', () => {
  let handler: MeetingHandler;
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      query: vi.fn(),
    };
    handler = new MeetingHandler(mockDb as unknown as any, {} as any);
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
      expect(task.title).toContain('Discussion');
    });
  });

  describe('Opinion interface', () => {
    it('should define opinion structure', () => {
      const opinion: Opinion = {
        author: 'agent-1',
        perspective: 'Use TypeScript',
        keyPoints: ['Type safety', 'Better tooling'],
        reasoning: 'Provides better code quality',
        concerns: ['Learning curve'],
        suggestions: ['Provide training'],
      };

      expect(opinion.author).toBe('agent-1');
      expect(opinion.perspective).toContain('TypeScript');
      expect(opinion.keyPoints.length).toBe(2);
    });
  });

  describe('parseOpinionContent', () => {
    it('should parse opinion from content', () => {
      const content = `## Opinion from agent-1

**Perspective**: We should use TypeScript

**Key Points**:
1. Type safety
2. Better tooling

**Reasoning**: TypeScript provides better code quality

**Concerns**: - Learning curve

**Suggestions**: - Training`;

      const handlerAny = handler as unknown as {
        parseOpinionContent: (content: string) => Opinion;
      };
      const opinion = handlerAny.parseOpinionContent(content);

      expect(opinion.author).toBe('agent-1');
      expect(opinion.perspective).toContain('TypeScript');
    });

    it('should handle missing fields', () => {
      const content = '## Opinion from unknown';

      const handlerAny = handler as unknown as {
        parseOpinionContent: (content: string) => Opinion;
      };
      const opinion = handlerAny.parseOpinionContent(content);

      expect(opinion.author).toBe('unknown');
      expect(opinion.perspective).toBe('');
    });
  });

  describe('buildDiscussionPrompt', () => {
    it('should include existing opinions', () => {
      const task: DiscussionTask = {
        id: 'task-1',
        title: 'Discussion: Test',
        description: 'Discuss this',
        status: 'PENDING',
        priority: 5,
      };

      const existingOpinions: Opinion[] = [
        {
          author: 'agent-1',
          perspective: 'Option A',
          keyPoints: ['Point 1'],
          reasoning: 'Reason',
          concerns: [],
          suggestions: [],
        },
      ];

      const handlerAny = handler as unknown as {
        buildDiscussionPrompt: (task: DiscussionTask, opinions: Opinion[]) => string;
      };
      const prompt = handlerAny.buildDiscussionPrompt(task, existingOpinions);

      expect(prompt).toContain('agent-1');
      expect(prompt).toContain('Option A');
    });

    it('should indicate no opinions yet', () => {
      const task: DiscussionTask = {
        id: 'task-1',
        title: 'Discussion: Test',
        description: 'Discuss this',
        status: 'PENDING',
        priority: 5,
      };

      const handlerAny = handler as unknown as {
        buildDiscussionPrompt: (task: DiscussionTask, opinions: Opinion[]) => string;
      };
      const prompt = handlerAny.buildDiscussionPrompt(task, []);

      expect(prompt).toContain('No opinions recorded yet');
    });
  });

  describe('detectConsensus', () => {
    it('should return null with no opinions', () => {
      const handlerAny = handler as unknown as {
        detectConsensus: (existing: Opinion[], newOpinions: Opinion[]) => string | null;
      };
      const result = handlerAny.detectConsensus([], []);

      expect(result).toBeNull();
    });

    it('should return null with single opinion', () => {
      const opinions: Opinion[] = [
        {
          author: 'agent-1',
          perspective: 'Option A',
          keyPoints: [],
          reasoning: '',
          concerns: [],
          suggestions: [],
        },
      ];

      const handlerAny = handler as unknown as {
        detectConsensus: (existing: Opinion[], newOpinions: Opinion[]) => string | null;
      };
      const result = handlerAny.detectConsensus([], opinions);

      expect(result).toBeNull();
    });

    it('should detect consensus on same perspective', () => {
      const opinions: Opinion[] = [
        {
          author: 'agent-1',
          perspective: 'Option A',
          keyPoints: [],
          reasoning: '',
          concerns: [],
          suggestions: [],
        },
        {
          author: 'agent-2',
          perspective: 'Option A',
          keyPoints: [],
          reasoning: '',
          concerns: [],
          suggestions: [],
        },
      ];

      const handlerAny = handler as unknown as {
        detectConsensus: (existing: Opinion[], newOpinions: Opinion[]) => string | null;
      };
      const result = handlerAny.detectConsensus([], opinions);

      expect(result).toBe('Option A');
    });

    it('should detect consensus on suggestions', () => {
      const opinions: Opinion[] = [
        {
          author: 'agent-1',
          perspective: 'Option A',
          keyPoints: [],
          reasoning: '',
          concerns: [],
          suggestions: ['Use TypeScript'],
        },
        {
          author: 'agent-2',
          perspective: 'Option B',
          keyPoints: [],
          reasoning: '',
          concerns: [],
          suggestions: ['Use TypeScript'],
        },
        {
          author: 'agent-3',
          perspective: 'Option C',
          keyPoints: [],
          reasoning: '',
          concerns: [],
          suggestions: ['Use Python'],
        },
      ];

      const handlerAny = handler as unknown as {
        detectConsensus: (existing: Opinion[], newOpinions: Opinion[]) => string | null;
      };
      const result = handlerAny.detectConsensus([], opinions);

      expect(result).toBe('use typescript'); // lowercase
    });

    it('should not count "none" suggestions', () => {
      const opinions: Opinion[] = [
        {
          author: 'agent-1',
          perspective: 'Option A',
          keyPoints: [],
          reasoning: '',
          concerns: [],
          suggestions: ['none'],
        },
        {
          author: 'agent-2',
          perspective: 'Option B',
          keyPoints: [],
          reasoning: '',
          concerns: [],
          suggestions: ['none'],
        },
      ];

      const handlerAny = handler as unknown as {
        detectConsensus: (existing: Opinion[], newOpinions: Opinion[]) => string | null;
      };
      const result = handlerAny.detectConsensus([], opinions);

      expect(result).toBeNull();
    });
  });

  describe('parseOpinionsFromOutput', () => {
    it('should parse multiple opinions from output', () => {
      const output = `## Opinion from agent-1

**Perspective**: Option A

**Key Points**:
1. Point 1
2. Point 2

**Reasoning**: Because it works

**Concerns**: - Concern 1

**Suggestions**: - Suggestion 1

---

## Opinion from agent-2

**Perspective**: Option B

**Key Points**:
1. Point X

**Reasoning**: Because reasons

**Concerns**: - Concern Y

**Suggestions**: - Suggestion Y`;

      const handlerAny = handler as unknown as {
        parseOpinionsFromOutput: (output: string) => Opinion[];
      };
      const opinions = handlerAny.parseOpinionsFromOutput(output);

      expect(opinions).toHaveLength(2);
      expect(opinions[0].author).toBe('agent-1');
      expect(opinions[1].author).toBe('agent-2');
    });

    it('should handle empty output', () => {
      const handlerAny = handler as unknown as {
        parseOpinionsFromOutput: (output: string) => Opinion[];
      };
      const opinions = handlerAny.parseOpinionsFromOutput('');

      expect(opinions).toHaveLength(0);
    });
  });

  describe('getExistingOpinions', () => {
    it('should return empty array when no opinions exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const handlerAny = handler as unknown as {
        getExistingOpinions: (discussionId: string) => Promise<Opinion[]>;
      };
      const opinions = await handlerAny.getExistingOpinions('task-123');

      expect(opinions).toHaveLength(0);
    });

    it('should parse existing opinions from database', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            content: '## Opinion from agent-1\n\n**Perspective**: Option A',
            metadata: { type: 'opinion', discussionId: 'task-123' },
          },
        ],
      });

      const handlerAny = handler as unknown as {
        getExistingOpinions: (discussionId: string) => Promise<Opinion[]>;
      };
      const opinions = await handlerAny.getExistingOpinions('task-123');

      expect(opinions).toHaveLength(1);
      expect(opinions[0].author).toBe('agent-1');
    });
  });

  describe('createMeetingFromTask', () => {
    it('should create meeting and return meeting ID', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const task: DiscussionTask = {
        id: 'task-1',
        title: 'Discussion: Architecture Decision',
        description: 'We need to decide',
        status: 'PENDING',
        priority: 5,
      };

      const meetingId = await handler.createMeetingFromTask(task);

      expect(meetingId).toBeDefined();
      expect(meetingId).toHaveLength(36); // UUID format
      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  describe('recordOpinion', () => {
    it('should save opinion to database', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const opinion: Opinion = {
        author: 'agent-1',
        perspective: 'Option A',
        keyPoints: ['Point 1'],
        reasoning: 'Because it works',
        concerns: ['Concern 1'],
        suggestions: ['Suggestion 1'],
      };

      const handlerAny = handler as unknown as {
        recordOpinion: (discussionId: string, opinion: Opinion) => Promise<void>;
      };
      await handlerAny.recordOpinion('task-123', opinion);

      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  describe('createConsensusTask', () => {
    it('should create consensus task in database', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const task: DiscussionTask = {
        id: 'task-1',
        title: 'Discussion: Architecture Decision',
        description: 'We need to decide',
        status: 'PENDING',
        priority: 5,
      };

      const handlerAny = handler as unknown as {
        createConsensusTask: (originalTask: DiscussionTask, consensus: string) => Promise<void>;
      };
      await handlerAny.createConsensusTask(task, 'Use Option A');

      expect(mockDb.query).toHaveBeenCalled();
    });
  });
});
