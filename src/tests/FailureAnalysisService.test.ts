import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FailureAnalysisService, type FailurePattern } from '../services/FailureAnalysisService.js';
import { DatabaseClient } from '../db/DatabaseClient.js';

describe('FailureAnalysisService', () => {
  let service: FailureAnalysisService;
  let mockDb: any;

  const createMockFailurePattern = (overrides: Partial<FailurePattern> = {}): FailurePattern => ({
    id: 'pattern-1',
    taskType: 'coding',
    taskCategory: 'testing',
    errorPattern: 'connection refused',
    occurrenceCount: 5,
    successRate: 0.8,
    avgRetryAttempts: 2,
    commonFix: 'Check network connectivity',
    lastSeen: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new FailureAnalysisService(mockDb as unknown as DatabaseClient);
  });

  describe('categorizeError', () => {
    it('should categorize timeout errors', () => {
      expect(service.categorizeError('Request timed out')).toBe('timeout');
      expect(service.categorizeError('Operation timeout after 30s')).toBe('timeout');
      expect(service.categorizeError('Connection timed out')).toBe('timeout');
    });

    it('should categorize network errors', () => {
      expect(service.categorizeError('Connection refused')).toBe('network');
      expect(service.categorizeError('Failed to fetch')).toBe('network');
      expect(service.categorizeError('Network error')).toBe('network');
      expect(service.categorizeError('ENOTFOUND network')).toBe('network');
    });

    it('should categorize permission errors', () => {
      expect(service.categorizeError('Permission denied')).toBe('permission');
      expect(service.categorizeError('Access denied for user')).toBe('permission');
      expect(service.categorizeError('Unauthorized access')).toBe('permission');
    });

    it('should categorize not found errors', () => {
      expect(service.categorizeError('File not found')).toBe('not_found');
      expect(service.categorizeError('Table does not exist')).toBe('not_found');
      expect(service.categorizeError('ENOENT: no such file')).toBe('not_found');
    });

    it('should categorize validation errors', () => {
      expect(service.categorizeError('Syntax error')).toBe('validation');
      expect(service.categorizeError('Failed to parse JSON')).toBe('validation');
      expect(service.categorizeError('Invalid input')).toBe('validation');
    });

    it('should categorize resource errors', () => {
      expect(service.categorizeError('Out of memory')).toBe('resource');
      expect(service.categorizeError('Heap memory exceeded')).toBe('resource');
      expect(service.categorizeError('Memory allocation failed')).toBe('resource');
    });

    it('should categorize conflict errors', () => {
      expect(service.categorizeError('Resource conflict')).toBe('conflict');
      expect(service.categorizeError('Duplicate entry')).toBe('conflict');
      expect(service.categorizeError('Unique constraint violation')).toBe('conflict');
    });

    it('should return unknown for unrecognized errors', () => {
      expect(service.categorizeError('Something went wrong')).toBe('unknown');
      expect(service.categorizeError('Unexpected error')).toBe('unknown');
      expect(service.categorizeError('')).toBe('unknown');
    });

    it('should be case insensitive', () => {
      expect(service.categorizeError('TIMEOUT ERROR')).toBe('timeout');
      expect(service.categorizeError('Connection Refused')).toBe('network');
      expect(service.categorizeError('PERMISSION DENIED')).toBe('permission');
    });
  });

  describe('findMatchingPatterns', () => {
    it('should find patterns matching task type and error category', async () => {
      const patterns = [createMockFailurePattern()];
      mockDb.query.mockResolvedValue({ rows: patterns });

      const result = await service.findMatchingPatterns('coding', 'testing', 'timeout error');

      expect(result).toEqual(patterns);
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('FROM failure_patterns'), [
        'coding',
        'testing',
        'timeout',
      ]);
    });

    it('should handle null task type and category', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.findMatchingPatterns(undefined, undefined, 'connection refused');

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [null, null, 'network']);
    });

    it('should limit results to 10', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.findMatchingPatterns('coding', 'testing', 'error');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10'),
        expect.any(Array)
      );
    });

    it('should order by occurrence count', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.findMatchingPatterns('coding', 'testing', 'error');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY occurrence_count DESC'),
        expect.any(Array)
      );
    });
  });

  describe('identifyRootCauses', () => {
    it('should return root causes with frequency', async () => {
      const rows = [
        { root_cause: 'Network issue', frequency: '5' },
        { root_cause: 'Config error', frequency: '3' },
      ];
      mockDb.query.mockResolvedValue({ rows });

      const result = await service.identifyRootCauses('coding', 'testing', 'network');

      expect(result).toEqual(['Network issue (5x)', 'Config error (3x)']);
    });

    it('should return unknown root cause when none found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await service.identifyRootCauses('coding', 'testing', 'unknown');

      expect(result).toContain('Unknown root cause - manual investigation required');
    });

    it('should limit to 5 root causes', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.identifyRootCauses('coding', 'testing', 'error');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 5'),
        expect.any(Array)
      );
    });
  });

  describe('generateFixes', () => {
    it('should generate fixes for timeout errors', () => {
      const patterns: FailurePattern[] = [];
      const result = service.generateFixes('timeout', patterns, []);

      expect(result).toContain('Increase timeout in task configuration');
      expect(result).toContain('Break task into smaller subtasks');
    });

    it('should generate fixes for network errors', () => {
      const result = service.generateFixes('network', [], []);

      expect(result).toContain('Check network connectivity');
      expect(result).toContain('Retry with exponential backoff and jitter');
    });

    it('should generate fixes for permission errors', () => {
      const result = service.generateFixes('permission', [], []);

      expect(result).toContain('Check file/directory permissions');
      expect(result).toContain('Verify API key access');
    });

    it('should generate fixes for not_found errors', () => {
      const result = service.generateFixes('not_found', [], []);

      expect(result).toContain('Verify resource exists before running task');
    });

    it('should include historical fixes from patterns', () => {
      const patterns = [
        createMockFailurePattern({ commonFix: 'Restart the service' }),
        createMockFailurePattern({ commonFix: 'Clear cache' }),
      ];

      const result = service.generateFixes('validation', patterns, []);

      expect(result).toContain('Historical fix: Restart the service');
      expect(result).toContain('Historical fix: Clear cache');
    });

    it('should limit to top 2 pattern fixes', () => {
      const patterns = [
        createMockFailurePattern({ commonFix: 'Fix 1' }),
        createMockFailurePattern({ commonFix: 'Fix 2' }),
        createMockFailurePattern({ commonFix: 'Fix 3' }),
      ];

      const result = service.generateFixes('timeout', patterns, []);

      const historicalFixes = result.filter(f => f.startsWith('Historical fix:'));
      expect(historicalFixes.length).toBeLessThanOrEqual(2);
    });

    it('should return default fix for unknown errors', () => {
      const result = service.generateFixes('unknown', [], []);

      expect(result).toContain('Review error message for specific guidance');
    });

    it('should deduplicate fixes', () => {
      const patterns = [
        createMockFailurePattern({ commonFix: 'Restart' }),
        createMockFailurePattern({ commonFix: 'Restart' }),
      ];

      const result = service.generateFixes('timeout', patterns, []);

      const restartCount = result.filter(f => f.includes('Restart')).length;
      expect(restartCount).toBe(1);
    });

    it('should limit total fixes to 5', () => {
      const patterns = [
        createMockFailurePattern({ commonFix: 'Fix 1' }),
        createMockFailurePattern({ commonFix: 'Fix 2' }),
        createMockFailurePattern({ commonFix: 'Fix 3' }),
      ];

      const result = service.generateFixes('timeout', patterns, []);

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getRetryStrategy', () => {
    it('should return retry strategy from database', async () => {
      const strategy = {
        taskType: 'coding',
        recommendedRetries: 3,
        recommendedBackoff: 2.0,
        recommendedTimeout: 300,
        successRate: 0.7,
      };
      mockDb.query.mockResolvedValue({ rows: [strategy] });

      const result = await service.getRetryStrategy('coding', 'testing');

      expect(result).toEqual({
        maxRetries: 3,
        backoffMultiplier: 2.0,
        timeoutSeconds: 300,
      });
    });

    it('should return undefined when no strategy found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await service.getRetryStrategy('unknown', 'unknown');

      expect(result).toBeUndefined();
    });

    it('should pass task type and category to query', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.getRetryStrategy('coding', 'testing');

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['coding', 'testing']);
    });
  });

  describe('analyzeFailure', () => {
    it('should return null for non-existent task', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await service.analyzeFailure('nonexistent');

      expect(result).toBeNull();
    });

    it('should return complete analysis for failed task', async () => {
      const task = {
        id: 'task-1',
        title: 'Test Task',
        error: 'Connection timeout',
        task_type: 'coding',
        category: 'testing',
        retry_count: 2,
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.analyzeFailure('task-1');

      expect(result).toBeDefined();
      expect(result?.taskId).toBe('task-1');
      expect(result?.taskTitle).toBe('Test Task');
      expect(result?.error).toBe('Connection timeout');
      expect(result?.errorCategory).toBe('timeout');
      expect(result?.isMissionImpossible).toBe(false);
    });

    it('should include root causes in analysis', async () => {
      const task = {
        id: 'task-1',
        title: 'Test',
        error: 'timeout',
        task_type: 'coding',
        category: 'testing',
        retry_count: 2,
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ root_cause: 'Slow network', frequency: '3' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.analyzeFailure('task-1');

      expect(result?.rootCauses).toContain('Slow network (3x)');
    });

    it('should include suggested fixes in analysis', async () => {
      const task = {
        id: 'task-1',
        title: 'Test',
        error: 'timeout',
        task_type: 'coding',
        category: 'testing',
        retry_count: 2,
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.analyzeFailure('task-1');

      expect(result?.suggestedFixes.length).toBeGreaterThan(0);
    });

    it('should include retry strategy in analysis', async () => {
      const task = {
        id: 'task-1',
        title: 'Test',
        error: 'timeout',
        task_type: 'coding',
        category: 'testing',
        retry_count: 2,
      };
      const strategy = {
        taskType: 'coding',
        recommendedRetries: 3,
        recommendedBackoff: 2.0,
        recommendedTimeout: 300,
        successRate: 0.7,
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [strategy] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.analyzeFailure('task-1');

      expect(result?.retryStrategy).toBeDefined();
      expect(result?.retryStrategy?.maxRetries).toBe(3);
    });
  });

  describe('checkMissionImpossible', () => {
    it('should return true when task has many failures and error mentions impossible', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ failure_count: '15' }],
      });

      const result = await service.checkMissionImpossible('coding', 'This task is impossible');

      expect(result).toBe(true);
    });

    it('should return false when error does not mention impossible', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ failure_count: '15' }],
      });

      const result = await service.checkMissionImpossible('coding', 'Timeout error');

      expect(result).toBe(false);
    });

    it('should return false when no failures found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await service.checkMissionImpossible('coding', 'impossible task');

      expect(result).toBe(false);
    });
  });

  describe('learnFromRetry', () => {
    it('should record retry learning on success', async () => {
      const task = {
        task_type: 'coding',
        category: 'testing',
        error: 'timeout',
        retry_count: 2,
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [task] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.learnFromRetry('task-1', true);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO retry_learning'),
        ['coding', 'testing', 'timeout', 2, true]
      );
    });

    it('should record retry learning on failure', async () => {
      const task = {
        task_type: 'coding',
        category: 'testing',
        error: 'timeout',
        retry_count: 2,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [task] });

      await service.learnFromRetry('task-1', false);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO retry_learning'),
        ['coding', 'testing', 'timeout', 2, false]
      );
    });

    it('should do nothing for non-existent task', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.learnFromRetry('nonexistent', true);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFailureStats', () => {
    it('should return complete failure statistics', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({
          rows: [
            { category: 'timeout', count: '30' },
            { category: 'network', count: '25' },
          ],
        })
        .mockResolvedValueOnce({ rows: [createMockFailurePattern()] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const result = await service.getFailureStats();

      expect(result.totalFailures).toBe(100);
      expect(result.byCategory.timeout).toBe(30);
      expect(result.byCategory.network).toBe(25);
      expect(result.topPatterns.length).toBe(1);
      expect(result.missionImpossibleTasks).toBe(10);
    });

    it('should handle empty results gracefully', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await service.getFailureStats();

      expect(result.totalFailures).toBe(0);
      expect(result.byCategory).toEqual({});
      expect(result.topPatterns).toEqual([]);
      expect(result.missionImpossibleTasks).toBe(0);
    });

    it('should categorize unknown tasks as unknown', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ category: null, count: '5' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.getFailureStats();

      expect(result.byCategory.unknown).toBe(5);
    });
  });
});
