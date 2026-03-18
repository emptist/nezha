import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import {
  UnifiedAgent,
  UnifiedAgentConfig,
  Agent,
  CliAgent,
  type AgentTask,
} from '../core/UnifiedAgent.js';
import { HttpTransport, CliTransport, createTransport } from '../core/transports/index.js';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Transport Classes', () => {
  describe('HttpTransport', () => {
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

    it('should initialize with serverUrl and timeout', () => {
      const transport = new HttpTransport('http://custom:8080', 30000);
      expect(transport).toBeDefined();
    });

    it('should return null for sessionId initially', () => {
      const transport = new HttpTransport('http://localhost:4096', 60000);
      expect(transport.getSessionId()).toBeNull();
    });

    it('should set and get sessionId', () => {
      const transport = new HttpTransport('http://localhost:4096', 60000);
      transport.setSessionId('test-session');
      expect(transport.getSessionId()).toBe('test-session');
    });

    it('should clear sessionId', () => {
      const transport = new HttpTransport('http://localhost:4096', 60000);
      transport.setSessionId('test-session');
      transport.clearSession();
      expect(transport.getSessionId()).toBeNull();
    });

    it('should create session and return ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'new-session-123' }),
      });

      const transport = new HttpTransport('http://localhost:4096', 60000);
      const sessionId = await transport.createSession();

      expect(sessionId).toBe('new-session-123');
      expect(transport.getSessionId()).toBe('new-session-123');
    });

    it('should throw error when session creation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const transport = new HttpTransport('http://localhost:4096', 60000);
      await expect(transport.createSession()).rejects.toThrow('Failed to create session');
    });

    it('should send message and return text response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Hello' }] }),
      });

      const transport = new HttpTransport('http://localhost:4096', 60000);
      transport.setSessionId('session-1');
      const result = await transport.sendMessage('test message');

      expect(result).toBe('Hello');
    });

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      const transport = new HttpTransport('http://localhost:4096', 60000);
      transport.setSessionId('session-1');

      await expect(transport.sendMessage('test')).rejects.toThrow('HTTP 400');
    });
  });

  describe('CliTransport', () => {
    let mockSpawn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockSpawn = vi.mocked(spawn);
    });

    it('should initialize correctly', () => {
      const transport = new CliTransport('http://localhost:4096', 60000);
      expect(transport).toBeDefined();
    });

    it('should always return null for getSessionId', () => {
      const transport = new CliTransport('http://localhost:4096', 60000);
      expect(transport.getSessionId()).toBeNull();
    });

    it('should spawn opencode with correct args', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((_event: string, cb: (code: number) => void) => {
          if (_event === 'close') cb(0);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      const resultPromise = transport.sendMessage('test prompt');

      mockProc.stdout.on.mock.calls.find((c: unknown[]) => c[0] === 'data')?.[1]?.(
        '{"type":"text","part":{"text":"response"}}'
      );

      const result = await resultPromise;
      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['run', '--attach', 'http://localhost:4096']),
        expect.any(Object)
      );
      expect(result).toBe('response');
    });

    it('should handle non-zero exit code', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((_: string, cb: (data: Buffer) => void) => cb(Buffer.from('error output'))),
        },
        on: vi.fn((event: string, cb: (code: number) => void) => {
          if (event === 'close') cb(1);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      await expect(transport.sendMessage('test')).rejects.toThrow('opencode exited with code 1');
    });

    it('should handle spawn error', async () => {
      const spawnError = new Error('ENOENT');
      (spawnError as NodeJS.ErrnoException).code = 'ENOENT';
      mockSpawn.mockImplementation(() => {
        throw spawnError;
      });

      const transport = new CliTransport('http://localhost:4096', 60000);
      await expect(transport.sendMessage('test')).rejects.toThrow('Failed to spawn opencode');
    });

    it('should include --thinking for streaming', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((_event: string, cb: (code: number) => void) => {
          if (_event === 'close') cb(0);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      await transport.sendMessageStreaming('test', vi.fn());

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--thinking']),
        expect.any(Object)
      );
    });

    it('should call onChunk for streaming responses', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((_event: string, cb: (code: number) => void) => {
          if (_event === 'close') cb(0);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      const onChunk = vi.fn();
      const sendPromise = transport.sendMessageStreaming('test', onChunk);

      const stderrCallback = mockProc.stderr.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'data'
      )?.[1];
      stderrCallback?.(Buffer.from('{"type":"text","part":{"text":"chunk1"}}\n'));
      stderrCallback?.(Buffer.from('{"type":"thinking","part":{"text":"thinking..."}}\n'));

      await sendPromise;

      expect(onChunk).toHaveBeenCalledWith('chunk1', 'text');
      expect(onChunk).toHaveBeenCalledWith('thinking...', 'thinking');
    });
  });

  describe('createTransport', () => {
    it('should create HttpTransport for http mode', () => {
      const transport = createTransport({
        mode: 'http',
        serverUrl: 'http://localhost:4096',
        timeout: 60000,
      });
      expect(transport).toBeInstanceOf(HttpTransport);
    });

    it('should create CliTransport for cli mode', () => {
      const transport = createTransport({
        mode: 'cli',
        serverUrl: 'http://localhost:4096',
        timeout: 60000,
      });
      expect(transport).toBeInstanceOf(CliTransport);
    });
  });
});

describe('UnifiedAgent', () => {
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
    it('should use default config', () => {
      const agent = new UnifiedAgent();
      expect(agent).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: UnifiedAgentConfig = {
        mode: 'http',
        timeout: 30000,
        maxRetries: 5,
        retryDelay: 2000,
        serverUrl: 'http://custom:8080',
        enableLogging: false,
      };
      const agent = new UnifiedAgent(config);
      expect(agent).toBeDefined();
    });

    it('should default to http mode', () => {
      const agent = new UnifiedAgent();
      expect(agent).toBeDefined();
    });

    it('should accept cli mode', () => {
      const agent = new UnifiedAgent({ mode: 'cli', enableLogging: false });
      expect(agent).toBeDefined();
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff', () => {
      const agent = new UnifiedAgent({ retryDelay: 1000 });
      const delays: number[] = [];
      for (let i = 1; i <= 5; i++) {
        delays.push(agent.calculateRetryDelay(i));
      }
      expect(delays[0]).toBeGreaterThanOrEqual(1000);
      expect(delays[1]).toBeGreaterThanOrEqual(2000);
    });

    it('should cap delay at 30000ms', () => {
      const agent = new UnifiedAgent({ retryDelay: 10000 });
      const delay = agent.calculateRetryDelay(10);
      expect(delay).toBeLessThanOrEqual(30000);
    });
  });

  describe('executeTask', () => {
    it('should execute task successfully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Success' }] }),
        });

      const agent = new UnifiedAgent({ maxRetries: 3, enableLogging: false });
      const result = await agent.executeTask('test task');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Success');
    });

    it('should retry on failure and succeed', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Recovered' }] }),
        });

      const agent = new UnifiedAgent({ maxRetries: 2, retryDelay: 10, enableLogging: false });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Recovered');
    });

    it('should fail after max retries', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error 1'),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error 2'),
        });

      const agent = new UnifiedAgent({ maxRetries: 2, retryDelay: 10, enableLogging: false });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
    });

    it('should return session ID', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'my-session' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'result' }] }),
        });

      const agent = new UnifiedAgent({ enableLogging: false });
      const result = await agent.executeTask('test');

      expect(result.sessionId).toBe('my-session');
    });

    it('should clear session on abort', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'session-1' }),
          });
        }
        if (callCount === 2) {
          return Promise.reject(new Error('AbortError'));
        }
        if (callCount === 3) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'session-2' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'ok' }] }),
        });
      });

      const agent = new UnifiedAgent({ maxRetries: 2, retryDelay: 10, enableLogging: false });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
    });
  });

  describe('executeTaskStreaming', () => {
    let mockSpawn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSpawn = vi.mocked(spawn);
    });

    it('should only work in CLI mode', async () => {
      const agent = new UnifiedAgent({ mode: 'http', enableLogging: false });
      await expect(agent.executeTaskStreaming('test', vi.fn())).rejects.toThrow(
        'Streaming is only supported in CLI mode'
      );
    });

    it('should stream chunks in CLI mode', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((_event: string, cb: (code: number) => void) => {
          if (_event === 'close') cb(0);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const agent = new UnifiedAgent({ mode: 'cli', enableLogging: false });
      const onChunk = vi.fn();
      const sendPromise = agent.executeTaskStreaming('test', onChunk);

      const stderrCallback = mockProc.stderr.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'data'
      )?.[1];
      stderrCallback?.(Buffer.from('{"type":"text","part":{"text":"chunk1"}}\n'));

      const result = await sendPromise;
      expect(result.success).toBe(true);
      expect(onChunk).toHaveBeenCalled();
    });
  });

  describe('executeStructuredTask', () => {
    it('should build structured prompt with task details', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'done' }] }),
        });

      const agent = new UnifiedAgent({ enableLogging: false });
      const task: AgentTask = {
        id: 'task-1',
        title: 'Fix bug',
        description: 'Fix the login bug',
        context: 'The bug is in auth module',
      };

      const result = await agent.executeStructuredTask(task);
      expect(result.success).toBe(true);

      const messageCall = mockFetch.mock.calls[1];
      const sentMessage = JSON.parse(messageCall[1].body).parts[0].text;
      expect(sentMessage).toContain('Fix bug');
      expect(sentMessage).toContain('Fix the login bug');
    });

    it('should include custom system prompt', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'done' }] }),
        });

      const agent = new UnifiedAgent({ enableLogging: false });
      const task: AgentTask = {
        title: 'Task',
        description: 'Desc',
      };

      await agent.executeStructuredTask(task, 'Custom instructions here');
      const messageCall = mockFetch.mock.calls[1];
      const sentMessage = messageCall[1].body;
      expect(sentMessage).toContain('Custom instructions here');
    });
  });

  describe('artifact extraction', () => {
    it('should extract file artifacts from response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              parts: [
                {
                  type: 'text',
                  text: 'Created file: src/utils/helper.ts',
                },
              ],
            }),
        });

      const agent = new UnifiedAgent({ enableLogging: false });
      const result = await agent.executeTask('create a file');

      expect(result.artifacts).toContain('src/utils/helper.ts');
    });

    it('should return empty artifacts when none found', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'No files created' }] }),
        });

      const agent = new UnifiedAgent({ enableLogging: false });
      const result = await agent.executeTask('test');

      expect(result.artifacts).toEqual([]);
    });
  });

  describe('session management', () => {
    it('should clear session', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'session-1' }),
          });
        }
        if (callCount === 2) {
          return Promise.reject(new Error('AbortError'));
        }
        if (callCount === 3) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'session-2' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'ok' }] }),
        });
      });

      const agent = new UnifiedAgent({ maxRetries: 2, retryDelay: 10, enableLogging: false });
      agent.clearSession();
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
    });

    it('should get session ID', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'my-session' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'ok' }] }),
        });

      const agent = new UnifiedAgent({ enableLogging: false });
      await agent.executeTask('test');

      expect(agent.getSessionId()).toBe('my-session');
    });
  });
});

describe('CliAgent', () => {
  it('should create UnifiedAgent in CLI mode', () => {
    const cliAgent = new CliAgent({ enableLogging: false });
    expect(cliAgent).toBeInstanceOf(UnifiedAgent);
  });

  it('should default to CLI mode', () => {
    const cliAgent = new CliAgent({ enableLogging: false });
    expect(cliAgent).toBeDefined();
  });
});

describe('Backward Compatibility - Agent class', () => {
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

  describe('Agent interface compatibility', () => {
    it('should have executeTask method', () => {
      const agent = new Agent();
      expect(typeof agent.executeTask).toBe('function');
    });

    it('should have calculateRetryDelay method', () => {
      const agent = new Agent();
      expect(typeof agent.calculateRetryDelay).toBe('function');
    });

    it('should execute task and return success response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'result' }] }),
        });

      const agent = new Agent();
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('result');
      expect(result.sessionId).toBe('session-1');
    });

    it('should handle config options', () => {
      const agent = new Agent({ timeout: 30000, maxRetries: 5, retryDelay: 2000 });
      expect(agent).toBeDefined();
    });
  });

  describe('Agent error handling', () => {
    it('should retry on network error', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1 || callCount === 3) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'session-1' }),
          });
        }
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Error') });
      });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('result');
    });

    it('should fail after exhausting retries', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1 || callCount === 3) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'session-1' }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error ' + callCount),
        });
      });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
    });
  });
});
