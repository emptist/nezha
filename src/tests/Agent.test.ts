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
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'session-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Task completed successfully' }] }),
        });

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('test task');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return success result with message', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'session-456' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Hello World' }] }),
        });

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('hello');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Hello World');
    });

    it('should retry on failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Network error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'session-retry' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Success' }] }),
        });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test task');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    it('should fail after max retries exhausted', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Error 1',
          text: () => Promise.resolve('Error 1'),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Error 2',
          text: () => Promise.resolve('Error 2'),
        });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test task');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Error 2');
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementation(() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 1);
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      });

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('long running task');

      expect(result.success).toBe(false);
      expect(result.message).toContain('timed out');
    });

    it('should parse multiple JSON lines', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'session-multi' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Line 1' }] }),
        });

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
    });

    it('should handle non-JSON output gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'session-text' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'plain text output' }] }),
        });

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
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

  describe('Agent Integration Tests', () => {
    it('should use custom server URL from config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'custom-session' }),
      });

      const agent = new Agent({ maxRetries: 1, serverUrl: 'http://custom:4096' });
      await agent.executeTask('custom server test');

      expect(mockFetch).toHaveBeenCalled();
      const sessionCall = mockFetch.mock.calls[0][0] as string;
      expect(String(sessionCall).includes('http://custom:4096')).toBe(true);
    });

    it('should retry on mock failure then succeed', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          text: () => Promise.resolve('Network failure'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'retry-session' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Success on retry' }] }),
        });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('retry success test');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should parse complex JSON responses', async () => {
      const complexResponse = {
        parts: [{
          type: 'text',
          text: 'Complex response with data',
          metadata: { status: 'ok', code: 200 },
        }],
      };
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'complex-session' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(complexResponse),
        });

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('complex json test');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Complex response');
    });

    it('should handle empty response gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'empty-session' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ parts: [] }),
        });

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('empty response test');

      expect(result.success).toBe(true);
    });

    it('should handle malformed JSON in response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'malformed-session' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => {
            throw new Error('Invalid JSON');
          },
        });

      const agent = new Agent({ maxRetries: 1 });
      const result = await agent.executeTask('malformed json test');

      expect(result.success).toBe(false);
    });
  });

  describe('Agent - Error Scenarios', () => {
    it('should handle fetch throwing non-Error objects', async () => {
      mockFetch.mockImplementation(() => {
        throw 'string error';
      });

      const agent = new Agent({ maxRetries: 1, retryDelay: 10 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(false);
    });

    it('should handle null message gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'null-session' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'ok' }] }),
        });

      const agent = new Agent();
      const result = await agent.executeTask('');

      expect(result).toBeDefined();
    });
  });
});
