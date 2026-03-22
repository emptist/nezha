import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SelfImprovementService,
  type LearnInput,
  type RememberInput,
} from '../services/SelfImprovementService.js';
import { DatabaseClient } from '../db/DatabaseClient.js';

vi.mock('../db/DatabaseClient.js');
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockQuery = vi.fn();
const mockDb = {
  query: mockQuery,
} as unknown as DatabaseClient;

describe('SelfImprovementService', () => {
  let service: SelfImprovementService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SelfImprovementService(mockDb);
  });

  describe('learn', () => {
    it('should learn and save insight', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input: LearnInput = {
        insight: 'Test insight',
        context: 'Test context',
        tags: ['test'],
        importance: 8,
      };

      const result = await service.learn(input);

      expect(result).toContain('Test insight');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('INSERT INTO memory');
      expect(callArgs[1]).toContain(8); // importance
    });

    it('should use default importance when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input: LearnInput = {
        insight: 'Simple insight',
      };

      await service.learn(input);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          expect.arrayContaining(['learning', 'insight']),
        ])
      );
    });

    it('should handle insight without context', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input: LearnInput = {
        insight: 'Insight without context',
      };

      const result = await service.learn(input);

      expect(result).toContain('Insight without context');
    });
  });

  describe('remember', () => {
    it('should remember lesson from task', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input: RememberInput = {
        lesson: 'Remember this lesson',
        fromTask: 'Test Task',
        tags: ['important'],
      };

      const result = await service.remember(input);

      expect(result).toContain('Remember this lesson');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.stringContaining('Remember this lesson'),
          expect.stringContaining('From task: Test Task'),
        ])
      );
    });
  });

  describe('suggestPromptUpdate', () => {
    it('should create prompt suggestion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.suggestPromptUpdate(
        'Current prompt',
        'Suggested changes',
        'Because it helps'
      );

      expect(result).toContain('Prompt suggestion created');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO prompt_suggestions'),
        expect.arrayContaining([
          'Current prompt',
          'Suggested changes',
          'Because it helps',
          'pending',
        ])
      );
    });
  });

  describe('getPendingSuggestions', () => {
    it('should return pending suggestions', async () => {
      const mockSuggestions = [
        {
          id: 'suggestion-1',
          currentPrompt: 'Current 1',
          suggestedPrompt: 'Suggested 1',
          reason: 'Reason 1',
          status: 'pending',
          createdAt: new Date(),
        },
        {
          id: 'suggestion-2',
          currentPrompt: 'Current 2',
          suggestedPrompt: 'Suggested 2',
          reason: 'Reason 2',
          status: 'pending',
          createdAt: new Date(),
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockSuggestions });

      const result = await service.getPendingSuggestions();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('suggestion-1');
    });

    it('should return empty array when no pending suggestions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getPendingSuggestions();

      expect(result).toHaveLength(0);
    });
  });

  describe('approveSuggestion', () => {
    it('should approve suggestion', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ suggested_prompt: 'New prompt' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.approveSuggestion('suggestion-123');

      expect(result).toBe('New prompt');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('rejectSuggestion', () => {
    it('should reject suggestion', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.rejectSuggestion('suggestion-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE prompt_suggestions'),
        expect.arrayContaining(['suggestion-123'])
      );
    });
  });

  describe('getReflectionTemplate', () => {
    it('should return default template', () => {
      const template = service.getReflectionTemplate();

      expect(template.name).toBe('default');
      expect(template.scenario).toBeDefined();
    });

    it('should return template for bug fix', () => {
      const template = service.getReflectionTemplate('Fix bug', 'bugfix');

      expect(template.name).toBe('bug-fix');
    });

    it('should return template for feature', () => {
      const template = service.getReflectionTemplate('New feature', 'implementation');

      expect(template.name).toBe('feature');
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return all templates', () => {
      const templates = service.getAvailableTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.name === 'default')).toBe(true);
      expect(templates.some(t => t.name === 'bug-fix')).toBe(true);
      expect(templates.some(t => t.name === 'feature')).toBe(true);
    });
  });

  describe('getReflectionTemplate', () => {
    it('should return research template', () => {
      const template = service.getReflectionTemplate('Research findings', 'research');
      expect(template.name).toBe('research');
    });

    it('should return refactoring template', () => {
      const template = service.getReflectionTemplate('Refactor code', 'refactoring');
      expect(template.name).toBe('refactoring');
    });

    it('should return review template', () => {
      const template = service.getReflectionTemplate('Review changes');
      expect(template.name).toBe('review');
    });

    it('should return debugging template', () => {
      const template = service.getReflectionTemplate('Debug the issue', 'debugging');
      expect(template.name).toBe('debugging');
    });

    it('should return default for unknown type', () => {
      const template = service.getReflectionTemplate('Some random task', 'unknown');
      expect(template.name).toBe('default');
    });
  });

  describe('getReflectionPrompt', () => {
    it('should return formatted prompt with task info', async () => {
      const prompt = await service.getReflectionPrompt(
        'Fix bug in parser',
        'Successfully fixed the parsing issue',
        'bug-fix'
      );

      expect(prompt).toContain('Fix bug in parser');
      expect(prompt).toContain('Successfully fixed the parsing issue');
    });

    it('should truncate long task results', async () => {
      const longResult = 'x'.repeat(1000);
      const prompt = await service.getReflectionPrompt('Task', longResult);

      expect(prompt.length).toBeLessThan(1500);
    });

    it('should use correct template based on task title', async () => {
      const prompt = await service.getReflectionPrompt(
        'Implement new feature',
        'Feature implemented'
      );

      expect(prompt).toContain('Feature Development Reflection');
    });
  });

  describe('approveSuggestion', () => {
    it('should throw error when suggestion not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(service.approveSuggestion('non-existent')).rejects.toThrow(
        'Suggestion not found'
      );
    });
  });

  describe('learn with embedding', () => {
    it('should handle embedding generation failure gracefully', async () => {
      const mockEmbedding = vi.fn().mockRejectedValue(new Error('Embedding failed'));

      const embeddingConfig = {
        provider: 'ollama',
        model: 'nomic-embed-text',
        apiUrl: 'http://localhost:11434',
      };
      const serviceWithEmbedding = new SelfImprovementService(mockDb, embeddingConfig);

      vi.spyOn(serviceWithEmbedding as any, 'embedding', 'get').mockReturnValue({
        embed: mockEmbedding,
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input: LearnInput = {
        insight: 'Test insight',
        tags: ['test'],
      };

      const result = await (serviceWithEmbedding as any).learn(input);

      expect(result).toContain('Test insight');
    });
  });
});
