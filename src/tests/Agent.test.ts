import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from '../core/Agent.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
}));

import { execSync } from 'child_process';

describe('Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const defaultAgent = new Agent();
      expect(defaultAgent).toBeDefined();
    });

    it('should use custom config when provided', () => {
      const customAgent = new Agent({
        timeout: 30000,
        maxRetries: 5,
        retryDelay: 2000,
      });
      expect(customAgent).toBeDefined();
    });

    it('should use default timeout when not provided', () => {
      const agent = new Agent({});
      expect(agent).toBeDefined();
    });
  });

  describe('AgentConfig', () => {
    it('should allow empty config', () => {
      const agent = new Agent();
      expect(agent).toBeDefined();
    });

    it('should allow partial config', () => {
      const agent = new Agent({ timeout: 5000 });
      expect(agent).toBeDefined();
    });

    it('should handle zero values gracefully', () => {
      const agent = new Agent({ timeout: 0, maxRetries: 0 });
      expect(agent).toBeDefined();
    });
  });

  describe('executeTask - Integration Tests', () => {
    it('should execute task successfully', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync.mockReturnValueOnce(JSON.stringify({
        type: 'text',
        part: { text: 'Task completed successfully' }
      }));

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('test task');

      expect(result.success).toBe(true);
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('should return success result with message', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync.mockReturnValueOnce('{"type":"text","part":{"text":"Hello World"}}');

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('hello');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Hello World');
    });

    it('should retry on failure', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync
        .mockRejectedValueOnce(new Error('Network error'))
        .mockReturnValueOnce('{"type":"text","part":{"text":"Success"}}');

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test task');

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('should fail after max retries exhausted', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'));

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test task');

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
      expect(result.message).toContain('failed after 2 attempts');
    });

    it('should handle timeout errors', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      const timeoutError = new Error('Command timed out');
      timeoutError.name = 'Error';
      mockExecSync.mockRejectedValueOnce(timeoutError);

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('long running task');

      expect(result.success).toBe(false);
      expect(result.message).toContain('timed out');
    });

    it('should parse multiple JSON lines', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      const output = [
        '{"type":"text","part":{"text":"Line 1"}}',
        '{"type":"text","part":{"text":"Line 2"}}',
        '{"type":"text","part":{"text":"Line 3"}}',
      ].join('\n');
      mockExecSync.mockReturnValueOnce(output);

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Line 1Line 2Line 3');
    });

    it('should handle non-JSON output gracefully', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync.mockReturnValueOnce('plain text output without JSON');

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('plain text output without JSON');
    });

    it('should calculate retry delay with exponential backoff', () => {
      const agent = new Agent({ retryDelay: 1000 });

      const delay1 = agent.calculateRetryDelay(1);
      const delay2 = agent.calculateRetryDelay(2);
      const delay3 = agent.calculateRetryDelay(3);

      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThan(30000);
      expect(delay3).toBeLessThan(30000);
    });

    it('should cap retry delay at maximum', () => {
      const agent = new Agent({ retryDelay: 10000 });
      const delay = agent.calculateRetryDelay(10);

      expect(delay).toBeLessThanOrEqual(30000);
    });
  });
});
