import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CheckpointService } from '../services/CheckpointService.js';

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
}));

import * as fs from 'fs/promises';

describe('CheckpointService', () => {
  let service: CheckpointService;
  const testPath = '/tmp/test-nezha-state.json';

  beforeEach(() => {
    service = new CheckpointService({ stateFilePath: testPath });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadState', () => {
    it('should return null when state file does not exist', async () => {
      (fs.access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      const result = await service.loadState();

      expect(result).toBeNull();
    });

    it('should load valid state from file', async () => {
      const validState = {
        version: '1.0.0',
        savedAt: '2024-01-01T00:00:00.000Z',
        opencodeSessionId: 'session-123',
        stats: {
          tasksExecuted: 10,
          tasksSucceeded: 8,
          tasksFailed: 2,
          reconnectAttempts: 1,
        },
        dailyMemoryPath: '/tmp/memory.json',
        isPaused: false,
        pauseUntil: undefined,
      };

      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(validState));

      const result = await service.loadState();

      expect(result).toEqual(validState);
      expect(service.getSessionId()).toBe('session-123');
      expect(service.getStats().tasksExecuted).toBe(10);
    });

    it('should handle malformed JSON in state file', async () => {
      const malformedJson = '{ "version": "1.0.0", invalid json }';

      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(malformedJson);

      const result = await service.loadState();

      expect(result).toBeNull();
    });

    it('should handle empty state file', async () => {
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('');

      const result = await service.loadState();

      expect(result).toBeNull();
    });

    it('should handle truncated JSON in state file', async () => {
      const truncatedJson = '{ "version": "1.0.0", "stats": { "tasksExecuted": 5';

      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(truncatedJson);

      const result = await service.loadState();

      expect(result).toBeNull();
    });

    it('should handle file read error', async () => {
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Read error'));

      const result = await service.loadState();

      expect(result).toBeNull();
    });
  });

  describe('saveState', () => {
    it('should save state to file', async () => {
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      service.setSessionId('session-456');
      service.updateStats({ tasksExecuted: 5 });

      await service.saveState('/tmp/memory.json');

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();

      const writtenContent = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
      if (writtenContent !== undefined) {
        const parsedContent = JSON.parse(writtenContent);
        expect(parsedContent.opencodeSessionId).toBe('session-456');
        expect(parsedContent.stats.tasksExecuted).toBe(5);
      }
    });

    it('should handle write error gracefully', async () => {
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.writeFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Write error'));

      await expect(service.saveState()).resolves.not.toThrow();
    });
  });

  describe('clearState', () => {
    it('should delete state file', async () => {
      (fs.unlink as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.clearState();

      expect(fs.unlink).toHaveBeenCalledWith(testPath);
    });

    it('should handle file not found error', async () => {
      (fs.unlink as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      await expect(service.clearState()).resolves.not.toThrow();
    });
  });

  describe('session management', () => {
    it('should set and get session ID', () => {
      service.setSessionId('test-session');
      expect(service.getSessionId()).toBe('test-session');
    });

    it('should return undefined when no session ID set', () => {
      expect(service.getSessionId()).toBeUndefined();
    });
  });

  describe('stats management', () => {
    it('should update and get stats', () => {
      service.updateStats({
        tasksExecuted: 10,
        tasksSucceeded: 8,
        tasksFailed: 2,
        reconnectAttempts: 3,
      });

      const stats = service.getStats();

      expect(stats.tasksExecuted).toBe(10);
      expect(stats.tasksSucceeded).toBe(8);
      expect(stats.tasksFailed).toBe(2);
      expect(stats.reconnectAttempts).toBe(3);
    });

    it('should merge partial stats updates', () => {
      service.updateStats({ tasksExecuted: 5 });
      service.updateStats({ tasksSucceeded: 4 });

      const stats = service.getStats();

      expect(stats.tasksExecuted).toBe(5);
      expect(stats.tasksSucceeded).toBe(4);
    });
  });

  describe('pause state', () => {
    it('should set pause state', () => {
      const pauseDate = new Date('2024-12-01T12:00:00Z');
      service.setPaused(true, pauseDate);

      const state = service['isPaused'];
      expect(state).toBe(true);
    });
  });
});
