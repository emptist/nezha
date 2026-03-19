import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setVerboseMode, isVerboseMode, verboseLogger } from '../utils/verboseLogger.js';

vi.mock('../utils/cli.js', () => ({
  colors: {
    gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
    magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
    reset: '\x1b[0m',
  },
}));

describe('verboseLogger', () => {
  beforeEach(() => {
    setVerboseMode(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setVerboseMode / isVerboseMode', () => {
    it('should default to false', () => {
      expect(isVerboseMode()).toBe(false);
    });

    it('should enable verbose mode', () => {
      setVerboseMode(true);
      expect(isVerboseMode()).toBe(true);
    });

    it('should disable verbose mode', () => {
      setVerboseMode(true);
      setVerboseMode(false);
      expect(isVerboseMode()).toBe(false);
    });
  });

  describe('verboseLogger.logDbQuery', () => {
    it('should not log when verbose mode is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logDbQuery('SELECT', ['param1'], { rowCount: 1 });
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log successful query when verbose mode is enabled', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logDbQuery('SELECT', ['param1'], { rowCount: 5 }, undefined, Date.now() - 100);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('[DB]');
    });

    it('should log failed query', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      const error = new Error('Query failed');
      verboseLogger.logDbQuery('SELECT', undefined, undefined, error);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('✗');
      expect(consoleSpy.mock.calls[0][0]).toContain('Query failed');
    });

    it('should include params in log when provided', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logDbQuery('INSERT', ['value1', 'value2'], { rowCount: 1 });
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('value1');
    });

    it('should include rowCount in log', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logDbQuery('SELECT', undefined, { rowCount: 10 });
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('10');
    });
  });

  describe('verboseLogger.logApiRequest', () => {
    it('should not log when verbose mode is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logApiRequest('fetch', 'GET', '/api/test', undefined, 200);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log successful API request', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logApiRequest('fetch', 'GET', '/api/test', undefined, 200, '{}', undefined, Date.now() - 50);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('[API]');
      expect(consoleSpy.mock.calls[0][0]).toContain('✓');
    });

    it('should log failed API request with error', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      const error = new Error('Network error');
      verboseLogger.logApiRequest('fetch', 'GET', '/api/test', undefined, undefined, undefined, error);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('✗');
      expect(consoleSpy.mock.calls[0][0]).toContain('Network error');
    });

    it('should log 4xx response as failure', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logApiRequest('fetch', 'POST', '/api/test', {}, 404);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('✗');
    });

    it('should log 5xx response as failure', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logApiRequest('fetch', 'GET', '/api/test', undefined, 500);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('✗');
    });

    it('should include request body in log', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logApiRequest('fetch', 'POST', '/api/test', { key: 'value' }, 201);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('key');
    });

    it('should include response length for string body', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logApiRequest('fetch', 'GET', '/api/test', undefined, 200, 'body content');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('responseLength');
      expect(output).toContain('12');
    });
  });

  describe('verboseLogger.logError', () => {
    it('should not log when verbose mode is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      verboseLogger.logError('test', new Error('error'));
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log error when verbose mode is enabled', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      const error = new Error('Something went wrong');
      verboseLogger.logError('operation', error);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('[ERROR]');
      expect(consoleSpy.mock.calls[0][0]).toContain('operation');
    });

    it('should include extra context if provided', () => {
      setVerboseMode(true);
      const consoleSpy = vi.spyOn(console, 'log');
      const error = new Error('Error');
      verboseLogger.logError('context', error, { userId: '123', action: 'test' });
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('userId');
    });
  });
});
