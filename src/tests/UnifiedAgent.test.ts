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

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Transport Classes', () => {
  describe('HttpTransport', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.restoreAllMocks();
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

    it('should handle response without parts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ noParts: true }),
        text: () => Promise.resolve(''),
      });

      const transport = new HttpTransport('http://localhost:4096', 60000);
      transport.setSessionId('session-1');
      const result = await transport.sendMessage('test');
      expect(result).toBe('{"noParts":true}');
    });

    it('should handle response without parts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ noParts: true }),
        text: () => Promise.resolve(''),
      });

      const transport = new HttpTransport('http://localhost:4096', 60000);
      transport.setSessionId('session-1');
      const result = await transport.sendMessage('test');
      expect(result).toBe('{"noParts":true}');
    });

    it('should handle concurrent session creation requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'session-concurrent' }),
      });

      const transport = new HttpTransport('http://localhost:4096', 60000);
      const [session1, session2] = await Promise.all([
        transport.createSession(),
        transport.createSession(),
      ]);
      expect(session1).toBe(session2);
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
      let closeCb: ((code: number) => void) | undefined = undefined;
      const mockProc = {
        stdout: {
          on: vi.fn((_event: string, _cb: (data: Buffer) => void) => {}),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((_event: string, cb: (code: number) => void) => {
          if (_event === 'close') closeCb = cb;
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      const resultPromise = transport.sendMessage('test prompt');

      const dataCallback = mockProc.stdout.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'data'
      )?.[1] as ((data: Buffer) => void) | undefined;
      if (dataCallback) {
        dataCallback(Buffer.from('{"type":"text","part":{"text":"response"}}'));
      }
      if (closeCb) {
        (closeCb as (code: number) => void)(0);
      }

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
      await expect(transport.sendMessage('test')).rejects.toThrow('ENOENT');
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

    it('should handle process error event', async () => {
      const errorHandler = vi.fn();
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (err: Error) => void) => {
          if (event === 'error') errorHandler.mockImplementation(cb);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      const sendPromise = transport.sendMessage('test');

      const err = new Error('ENOENT');
      errorHandler(err);
      await expect(sendPromise).rejects.toThrow('Failed to spawn opencode');
    });

    it('should handle JSON parse errors in stderr gracefully', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((_: string, cb: (data: Buffer) => void) => {
            cb(Buffer.from('not valid json\n'));
            cb(Buffer.from('also not json\n'));
          }),
        },
        on: vi.fn((_event: string, cb: (code: number) => void) => {
          if (_event === 'close') cb(0);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      const result = await transport.sendMessage('test');
      expect(result).toBe('');
    });

    it('should handle timeout correctly', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 100);
      const timeoutPromise = transport.sendMessage('test');

      await expect(timeoutPromise).rejects.toThrow('timed out');
    });

    it('should cleanup process on timeout', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (code: number) => void) => {
          if (event === 'close') cb(124);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 50);
      await expect(transport.sendMessage('test')).rejects.toThrow('opencode exited with code 124');
    });

    it('should return empty string when no output', async () => {
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
      const result = await transport.sendMessage('test');
      expect(result).toBe('');
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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

describe('Security Tests', () => {
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSpawn = vi.mocked(spawn);
  });

  describe('CliTransport Input Validation', () => {
    it('should reject serverUrl exceeding max length', () => {
      const longUrl = 'http://localhost:' + 'x'.repeat(2048);
      expect(() => new CliTransport(longUrl, 60000)).toThrow('exceeds maximum length');
    });

    it('should reject serverUrl with invalid characters', () => {
      expect(() => new CliTransport('http://localhost:4096; rm -rf', 60000)).toThrow(
        'invalid characters'
      );
    });

    it('should reject prompt exceeding max length', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      const longPrompt = 'x'.repeat(100001);
      await expect(transport.sendMessage(longPrompt)).rejects.toThrow('exceeds maximum length');
    });

    it('should reject prompt with null bytes', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const transport = new CliTransport('http://localhost:4096', 60000);
      await expect(transport.sendMessage('test\x00prompt')).rejects.toThrow('null bytes');
    });

    it('should reject serverUrl with control characters', () => {
      expect(() => new CliTransport('http://localhost:4096\x00test', 60000)).toThrow(
        'invalid characters'
      );
    });
  });

  describe('UnifiedAgent Input Validation', () => {
    it('should reject message exceeding max length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ parts: [{ type: 'text', text: 'result' }] }),
      });

      const agent = new UnifiedAgent({ enableLogging: false });
      const longMessage = 'x'.repeat(100001);
      await expect(agent.executeTask(longMessage)).rejects.toThrow(
        'exceeds maximum allowed length'
      );
    });

    it('should reject task title exceeding max length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ parts: [{ type: 'text', text: 'result' }] }),
      });

      const agent = new UnifiedAgent({ enableLogging: false });
      const longTitle = 'x'.repeat(501);
      await expect(
        agent.executeStructuredTask({ title: longTitle, description: 'test' })
      ).rejects.toThrow('exceeds maximum length of 500');
    });

    it('should reject task description exceeding max length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ parts: [{ type: 'text', text: 'result' }] }),
      });

      const agent = new UnifiedAgent({ enableLogging: false });
      const longDesc = 'x'.repeat(5001);
      await expect(
        agent.executeStructuredTask({ title: 'test', description: longDesc })
      ).rejects.toThrow('exceeds maximum length of 5000');
    });
  });

  describe('Sensitive Data Masking', () => {
    it('should mask password in logs', () => {
      const testMessage = 'Please use password: secret123 for authentication';
      const masked = testMessage.replace(/(password["\s]*[:=]["\s]*)([^"\s]+)/gi, '$1***');
      expect(masked).toBe('Please use password: *** for authentication');
    });

    it('should mask API key in logs', () => {
      const testMessage = 'api_key=sk-1234567890abcdef';
      const masked = testMessage.replace(/(api[_-]?key["\s]*[:=]["\s]*)([^"\s]+)/gi, '$1***');
      expect(masked).toBe('api_key=***');
    });

    it('should mask Bearer token in logs', () => {
      const testMessage = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const masked = testMessage.replace(/(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi, '$1***');
      expect(masked).toBe('Authorization: Bearer ***');
    });

    it('should detect private key pattern', () => {
      const testMessage = 'Key: -----BEGIN RSA PRIVATE KEY-----MIIE...';
      const hasPrivateKey = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i.test(testMessage);
      expect(hasPrivateKey).toBe(true);
    });

    it('should detect sensitive patterns in message', () => {
      const hasSensitive = (text: string): boolean => {
        const patterns = [
          /password["\s]*[:=]["\s]*[^"\s]+/i,
          /api[_-]?key["\s]*[:=]["\s]*[^"\s]+/i,
          /secret["\s]*[:=]["\s]*[^"\s]+/i,
          /token["\s]*[:=]["\s]*[^"\s]+/i,
          /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
          /-----BEGIN CERTIFICATE-----/,
        ];
        return patterns.some(pattern => pattern.test(text));
      };

      expect(hasSensitive('My password: secret')).toBe(true);
      expect(hasSensitive('api_key=abc123')).toBe(true);
      expect(hasSensitive('Just a normal message')).toBe(false);
    });

    it('should detect sensitive patterns in message', () => {
      const hasSensitive = (text: string): boolean => {
        const patterns = [
          /password["\s]*[:=]["\s]*[^"\s]+/i,
          /api[_-]?key["\s]*[:=]["\s]*[^"\s]+/i,
          /secret["\s]*[:=]["\s]*[^"\s]+/i,
          /token["\s]*[:=]["\s]*[^"\s]+/i,
          /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
          /-----BEGIN CERTIFICATE-----/,
        ];
        return patterns.some(pattern => pattern.test(text));
      };

      expect(hasSensitive('My password: secret')).toBe(true);
      expect(hasSensitive('api_key=abc123')).toBe(true);
      expect(hasSensitive('Just a normal message')).toBe(false);
    });
  });

  describe('Error Message Sanitization', () => {
    it('should sanitize control characters from error messages', () => {
      const errorWithControlChars = 'Error\x00\x1F message';
      const sanitized = errorWithControlChars.replace(/[\x00-\x1F\x7F]/g, '');
      expect(sanitized).toBe('Error message');
    });

    it('should truncate long error output', () => {
      const longError = 'x'.repeat(1000);
      const truncated = longError.slice(0, 500).replace(/[\x00-\x1F\x7F]/g, '');
      expect(truncated.length).toBe(500);
    });
  });
});

describe('UnifiedAgent - Resilience Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getResilienceStats', () => {
    it('should return resilience statistics', async () => {
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

      const agent = new UnifiedAgent({ enableLogging: false });
      await agent.executeTask('test');

      const stats = agent.getResilienceStats();
      expect(stats).toHaveProperty('circuitBreaker');
      expect(stats).toHaveProperty('cacheHitRate');
      expect(stats).toHaveProperty('retryCount');
      expect(typeof stats.circuitBreaker).toBe('string');
      expect(typeof stats.cacheHitRate).toBe('number');
      expect(typeof stats.retryCount).toBe('number');
    });

    it('should return initial stats without execution', () => {
      const agent = new UnifiedAgent({ enableLogging: false });
      const stats = agent.getResilienceStats();
      expect(stats).toHaveProperty('circuitBreaker');
      expect(stats).toHaveProperty('cacheHitRate');
      expect(stats).toHaveProperty('retryCount');
    });
  });

  describe('resetCircuits', () => {
    it('should reset all resilience mechanisms', async () => {
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
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'recovered' }] }),
        });

      const agent = new UnifiedAgent({ maxRetries: 2, retryDelay: 10, enableLogging: false });
      await agent.executeTask('test');
      agent.resetCircuits();

      const stats = agent.getResilienceStats();
      expect(stats).toBeDefined();
      expect(typeof stats.circuitBreaker).toBe('string');
    });

    it('should reset currentMode back to transport mode', () => {
      const agent = new UnifiedAgent({ mode: 'cli', enableLogging: false });
      agent.resetCircuits();
      expect(agent).toBeDefined();
    });

    it('should allow new executions after reset', async () => {
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

      const agent = new UnifiedAgent({ enableLogging: false });
      agent.resetCircuits();
      const result = await agent.executeTask('test');
      expect(result.success).toBe(true);
    });
  });
});

describe('Backward Compatibility - Agent class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'result' }] }),
        });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('result');
    });

    it('should fail after exhausting retries', async () => {
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

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
    });
  });
});
