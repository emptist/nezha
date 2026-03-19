import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DailyMemoryService, type MemorySaveInput } from '../services/DailyMemory.js';
import { logger } from '../utils/logger.js';

vi.mock('fs/promises');
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('DailyMemoryService', () => {
  let service: DailyMemoryService;
  const testDir = '/tmp/nezha-memory-test';
  const mockFs = fs as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T10:00:00Z'));
    service = new DailyMemoryService({ memoryDir: testDir });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with custom memory dir', () => {
      const customService = new DailyMemoryService({ memoryDir: '/custom/path' });
      expect(customService).toBeDefined();
    });

    it('should create with default memory dir', () => {
      const defaultService = new DailyMemoryService();
      expect(defaultService).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should ensure directory and file exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Not found'));
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      await service.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testDir, { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('ensureDirectory', () => {
    it('should create directory recursively', async () => {
      mockFs.mkdir.mockResolvedValueOnce(undefined);

      await service.ensureDirectory();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testDir, { recursive: true });
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should throw error on directory creation failure', async () => {
      const error = new Error('Permission denied');
      mockFs.mkdir.mockRejectedValueOnce(error);

      await expect(service.ensureDirectory()).rejects.toThrow('Permission denied');
      expect(logger.error).toHaveBeenCalledWith('Failed to create memory directory:', error);
    });
  });

  describe('save', () => {
    it('should create new file with header if not exists', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      const input: MemorySaveInput = {
        task: 'Test task',
        result: 'Completed successfully',
      };

      await service.save(input);

      const callArgs = mockFs.writeFile.mock.calls[0];
      expect(callArgs[0]).toContain('2026-03-20');
      expect(callArgs[1]).toContain('Test task');
    });

    it('should append to existing file', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      const input: MemorySaveInput = {
        task: 'Appended task',
        result: 'Result here',
      };

      await service.save(input);

      const callArgs = mockFs.appendFile.mock.calls[0];
      expect(callArgs[0]).toContain('2026-03-20');
      expect(callArgs[1]).toContain('Appended task');
    });

    it('should truncate long results', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      const longResult = 'A'.repeat(300);
      const input: MemorySaveInput = {
        task: 'Long result task',
        result: longResult,
      };

      await service.save(input);

      const appendedContent = mockFs.appendFile.mock.calls[0][1] as string;
      expect(appendedContent).toContain('...');
      expect(appendedContent.length).toBeLessThan(220);
    });

    it('should include errors when provided', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      const input: MemorySaveInput = {
        task: 'Task with errors',
        result: 'Failed',
        errors: ['Error 1', 'Error 2'],
      };

      await service.save(input);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Errors: Error 1; Error 2')
      );
    });

    it('should include solution when provided', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      const input: MemorySaveInput = {
        task: 'Fixed bug',
        result: 'Success',
        solution: 'Added null check',
      };

      await service.save(input);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Solution: Added null check')
      );
    });

    it('should throw error on write failure', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockRejectedValueOnce(new Error('Write failed'));

      const input: MemorySaveInput = {
        task: 'Fail task',
        result: 'Result',
      };

      await expect(service.save(input)).rejects.toThrow('Write failed');
    });
  });

  describe('addLearning', () => {
    it('should add learning to new file', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      await service.addLearning('Always use type assertions');

      const callArgs = mockFs.writeFile.mock.calls[0];
      expect(callArgs[0]).toContain('2026');
      expect(callArgs[1]).toContain('Always use type assertions');
    });

    it('should append learning to existing file without learnings section', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValueOnce('# Daily Memory\n\n## Tasks\n');
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      await service.addLearning('New learning');

      const callArgs = mockFs.appendFile.mock.calls[0];
      expect(callArgs[1]).toContain('## Learnings');
    });

    it('should insert learning in existing learnings section', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValueOnce('# Daily Memory\n\n## Learnings\n- Old learning\n');
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      await service.addLearning('New learning');

      const callArgs = mockFs.writeFile.mock.calls[0];
      expect(callArgs[1]).toContain('New learning');
    });
  });

  describe('addReflection', () => {
    it('should add reflection to new file', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);

      await service.addReflection('Reflection on task execution');

      const callArgs = mockFs.writeFile.mock.calls[0];
      expect(callArgs[0]).toContain('2026');
      expect(callArgs[1]).toContain('Reflection on task execution');
    });

    it('should append reflection to existing file', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValueOnce('# Daily Memory\n\n');
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.appendFile.mockResolvedValueOnce(undefined);

      await service.addReflection('Today I learned something');

      const callArgs = mockFs.appendFile.mock.calls[0];
      expect(callArgs[1]).toContain('## Reflections');
    });
  });

  describe('readToday', () => {
    it('should return empty string when file does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Not found'));

      const result = await service.readToday();
      expect(result).toBe('');
    });

    it('should return file content when exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValueOnce('# Daily Memory content');

      const result = await service.readToday();
      expect(result).toBe('# Daily Memory content');
    });

    it('should return empty string on read error', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readFile.mockRejectedValueOnce(new Error('Read error'));

      const result = await service.readToday();
      expect(result).toBe('');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('readRecentDays', () => {
    it('should return memories from last N days', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('Memory content');

      const result = await service.readRecentDays(3);

      expect(result).toHaveLength(3);
      expect(mockFs.access).toHaveBeenCalledTimes(3);
      expect(mockFs.readFile).toHaveBeenCalledTimes(3);
    });

    it('should skip missing days', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      mockFs.readFile.mockResolvedValue('Content');

      const result = await service.readRecentDays(3);

      expect(result).toHaveLength(2);
    });

    it('should use default of 7 days', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('Content');

      await service.readRecentDays();

      expect(mockFs.access).toHaveBeenCalledTimes(7);
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await (service as unknown as { fileExists: (path: string) => Promise<boolean> }).fileExists('/test/path');

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Not found'));

      const result = await (service as unknown as { fileExists: (path: string) => Promise<boolean> }).fileExists('/test/path');

      expect(result).toBe(false);
    });
  });

  describe('getTodayFilename', () => {
    it('should return correct filename format', () => {
      const filename = (service as unknown as { getTodayFilename: () => string }).getTodayFilename();
      expect(filename).toBe('2026-03-20.md');
    });
  });

  describe('getTodayDate', () => {
    it('should return correct date format', () => {
      const date = (service as unknown as { getTodayDate: () => string }).getTodayDate();
      expect(date).toBe('2026-03-20');
    });
  });
});
