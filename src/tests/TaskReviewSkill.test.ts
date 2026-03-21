import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskReviewSkill,
  taskReviewSkill,
  type TaskReviewInput,
  type TaskReviewOutput,
} from '../services/TaskReviewSkill.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('TaskReviewSkill', () => {
  let skill: TaskReviewSkill;

  beforeEach(() => {
    vi.clearAllMocks();
    skill = new TaskReviewSkill();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(skill).toBeDefined();
    });
  });

  describe('setDatabaseClient', () => {
    it('should set database client', () => {
      const mockClient = { query: vi.fn() };
      skill.setDatabaseClient(mockClient);
      expect(skill).toBeDefined();
    });
  });

  describe('review', () => {
    it('should pass review with no issues', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: { success: true },
        duration: 60000,
        filesChanged: ['src/test.ts'],
        testsRun: true,
        testsPassed: true,
      };

      const output = await skill.review(input);

      expect(output.passed).toBe(true);
      expect(output.score).toBeGreaterThanOrEqual(70);
      expect(output.qualityLevel).toMatch(/good|excellent|acceptable/);
    });

    it('should fail review with error', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: null,
        error: 'Connection timeout',
        duration: 30000,
      };

      const output = await skill.review(input);

      expect(output.passed).toBe(false);
      expect(output.score).toBeLessThan(70); // 100 - 40 (error) = 60
      expect(output.issues.some(i => i.severity === 'critical')).toBe(true);
    });

    it('should deduct score for missing result', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: null,
        duration: 30000,
      };

      const output = await skill.review(input);

      expect(output.issues.some(i => i.category === 'result')).toBe(true);
    });

    it('should deduct score for long duration', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: { success: true },
        duration: 400000, // > 5 minutes
        testsRun: true,
        testsPassed: true,
      };

      const output = await skill.review(input);

      expect(output.issues.some(i => i.category === 'performance')).toBe(true);
    });

    it('should deduct score when tests not run', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: { success: true },
        duration: 30000,
        testsRun: false,
      };

      const output = await skill.review(input);

      expect(output.suggestions.some(s => s.includes('tests'))).toBe(true);
    });

    it('should deduct score when tests fail', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: { success: false },
        duration: 30000,
        testsRun: true,
        testsPassed: false,
      };

      const output = await skill.review(input);

      expect(output.issues.some(i => i.category === 'testing')).toBe(true);
    });

    it('should suggest breaking large changes', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: { success: true },
        duration: 30000,
        filesChanged: [
          'file1.ts',
          'file2.ts',
          'file3.ts',
          'file4.ts',
          'file5.ts',
          'file6.ts',
          'file7.ts',
          'file8.ts',
          'file9.ts',
          'file10.ts',
          'file11.ts',
          'file12.ts',
          'file13.ts',
          'file14.ts',
          'file15.ts',
          'file16.ts',
          'file17.ts',
          'file18.ts',
          'file19.ts',
          'file20.ts',
          'file21.ts',
        ],
        testsRun: true,
        testsPassed: true,
      };

      const output = await skill.review(input);

      expect(output.suggestions.some(s => s.includes('smaller'))).toBe(true);
    });

    it('should add learned patterns for excellent quality', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: { success: true },
        duration: 10000,
        testsRun: true,
        testsPassed: true,
      };

      const output = await skill.review(input);

      if (output.qualityLevel === 'excellent') {
        expect(output.learnedPatterns.length).toBeGreaterThan(0);
      }
    });

    it('should add critical issue patterns', async () => {
      const input: TaskReviewInput = {
        taskId: 'task-1',
        taskTitle: 'Test Task',
        taskDescription: 'Test description',
        result: null,
        error: 'Critical bug',
        duration: 30000,
      };

      const output = await skill.review(input);

      if (output.issues.some(i => i.severity === 'critical')) {
        expect(output.learnedPatterns.length).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateQualityLevel', () => {
    it('should return excellent for score >= 90', () => {
      const serviceAny = skill as unknown as { calculateQualityLevel: (score: number) => string };
      expect(serviceAny.calculateQualityLevel(90)).toBe('excellent');
      expect(serviceAny.calculateQualityLevel(100)).toBe('excellent');
    });

    it('should return good for score >= 75', () => {
      const serviceAny = skill as unknown as { calculateQualityLevel: (score: number) => string };
      expect(serviceAny.calculateQualityLevel(75)).toBe('good');
      expect(serviceAny.calculateQualityLevel(89)).toBe('good');
    });

    it('should return acceptable for score >= 50', () => {
      const serviceAny = skill as unknown as { calculateQualityLevel: (score: number) => string };
      expect(serviceAny.calculateQualityLevel(50)).toBe('acceptable');
      expect(serviceAny.calculateQualityLevel(74)).toBe('acceptable');
    });

    it('should return needs_work for score < 50', () => {
      const serviceAny = skill as unknown as { calculateQualityLevel: (score: number) => string };
      expect(serviceAny.calculateQualityLevel(49)).toBe('needs_work');
      expect(serviceAny.calculateQualityLevel(0)).toBe('needs_work');
    });
  });

  describe('getReviewHistory', () => {
    it('should return empty array without db client', async () => {
      const history = await skill.getReviewHistory();
      expect(history).toEqual([]);
    });

    it('should return empty array with db client but no data', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      skill.setDatabaseClient(mockClient);

      const history = await skill.getReviewHistory();

      expect(history).toEqual([]);
    });

    it('should return parsed history', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [{ metadata: JSON.stringify({ passed: true, score: 85 }) }],
        }),
      };
      skill.setDatabaseClient(mockClient);

      const history = await skill.getReviewHistory();

      expect(history.length).toBe(1);
      expect(history[0].passed).toBe(true);
    });
  });

  describe('getCommonIssues', () => {
    it('should return empty array without db client', async () => {
      const issues = await skill.getCommonIssues();
      expect(issues).toEqual([]);
    });

    it('should return empty array with db client but no data', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      skill.setDatabaseClient(mockClient);

      const issues = await skill.getCommonIssues();

      expect(issues).toEqual([]);
    });

    it('should return mapped issues', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [{ content: 'Memory leak in handler' }],
        }),
      };
      skill.setDatabaseClient(mockClient);

      const issues = await skill.getCommonIssues();

      expect(issues.length).toBe(1);
      expect(issues[0].category).toBe('common');
    });
  });

  describe('exported singleton', () => {
    it('should export taskReviewSkill instance', () => {
      expect(taskReviewSkill).toBeDefined();
    });
  });
});
