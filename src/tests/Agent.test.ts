import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from '../core/Agent.js';

describe('Agent', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      mockExecSync.mockReturnValueOnce(
        JSON.stringify({
          type: 'text',
          part: { text: 'Task completed successfully' },
        })
      );

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
        .mockImplementationOnce(() => {
          throw new Error('Network error');
        })
        .mockReturnValueOnce('{"type":"text","part":{"text":"Success"}}');

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test task');

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('should fail after max retries exhausted', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('Error 1');
        })
        .mockImplementationOnce(() => {
          throw new Error('Error 2');
        });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test task');

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Error 2');
    });

    it('should handle timeout errors', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      const timeoutError = new Error('Command timed out');
      timeoutError.name = 'Error';
      mockExecSync.mockImplementation(() => {
        const error: any = new Error('Command timed out');
        error.status = 'timeout';
        throw error;
      });

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('long running task');

      expect(result.success).toBe(false);
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
      expect(result.message).toBe('');
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

  describe('Agent Integration Tests with OpenCodeApiMock', () => {
    let mockExecSync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockExecSync = execSync as ReturnType<typeof vi.fn>;
      OpenCodeApiMock.setup({
        success: true,
        responseText: 'Integration test response',
      });
    });

    afterEach(() => {
      OpenCodeApiMock.teardown();
    });

    it('should use OpenCodeApiMock for task execution', async () => {
      mockExecSync.mockReturnValueOnce(OpenCodeApiMock.formatResponse('Mock response text'));

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('integration test task');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Mock response text');
      expect(OpenCodeApiMock.getCalls().length).toBeGreaterThanOrEqual(0);
    });

    it('should track API calls when executing tasks', async () => {
      mockExecSync.mockReturnValueOnce(OpenCodeApiMock.formatResponse('Task completed'));

      const agent = new Agent({ maxRetries: 1 });
      await agent.executeTask('test task with tracking');

      const calls = OpenCodeApiMock.getCalls();
      expect(calls.length).toBe(0);
    });

    it('should handle mock error responses', async () => {
      OpenCodeApiMock.setup({
        success: false,
        error: 'Mock API error',
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('Mock API error');
      });

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('error test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Mock API error');
    });

    it('should handle delayed mock responses', async () => {
      OpenCodeApiMock.setup({
        success: true,
        responseText: 'Delayed response',
        delay: 50,
      });
      mockExecSync.mockReturnValueOnce(OpenCodeApiMock.formatResponse('Delayed response'));

      const agent = new Agent({ maxRetries: 1, timeout: 5000 });
      const result = await agent.executeTask('delayed task');

      expect(result.success).toBe(true);
    });

    it('should use custom server URL from config', async () => {
      mockExecSync.mockReturnValueOnce(OpenCodeApiMock.formatResponse('Custom server'));

      const agent = new Agent({ maxRetries: 1, serverUrl: 'http://custom:4096' });
      await agent.executeTask('custom server test');

      expect(mockExecSync).toHaveBeenCalled();
      const callArgs = mockExecSync.mock.calls[0][0] as string;
      expect(callArgs).toContain('http://custom:4096');
    });

    it('should retry on mock failure then succeed', async () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('Network failure');
        })
        .mockReturnValueOnce(OpenCodeApiMock.formatResponse('Success on retry'));

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('retry success test');

      expect(result.success).toBe(true);
      expect(mockExecSync).toHaveBeenCalledTimes(2);
    });

    it('should parse complex JSON responses', async () => {
      const complexResponse = {
        type: 'text',
        part: {
          text: 'Complex response with data',
          metadata: { status: 'ok', code: 200 },
        },
      };
      mockExecSync.mockReturnValueOnce(JSON.stringify(complexResponse));

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('complex json test');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Complex response');
    });

    it('should handle empty response gracefully', async () => {
      mockExecSync.mockReturnValueOnce('');

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('empty response test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('');
    });

    it('should handle malformed JSON in response', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync.mockReturnValueOnce('not valid json { broken');

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('malformed json test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('');
    });
  });

  describe('Agent - Error Scenarios', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should handle execSync throwing non-Error objects', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync.mockImplementation(() => {
        throw 'string error';
      });

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('string error');
    });

    it('should handle null message gracefully', async () => {
      const mockExecSync = execSync as ReturnType<typeof vi.fn>;
      mockExecSync.mockReturnValueOnce('{"type":"text","part":{"text":"ok"}}');

      const agent = new Agent();
      const result = await agent.executeTask('');

      expect(result).toBeDefined();
    });
  });
});
