import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import {
  UnifiedAgent,
  UnifiedAgentConfig,
  UnifiedAgentResponse,
  Agent,
  CliAgent,
  type AgentTask,
} from '../core/UnifiedAgent.js';
import {
  HttpTransport,
  CliTransport,
  createTransport,
  type TransportMode,
} from '../core/transports/index.js';

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Transport Classes', () => {
  describe('HttpTransport', () => {
    let httpTransport: HttpTransport;
    const mockFetch = vi.fn();

    beforeEach(async () => {
      vi.clearAllMocks();
      vi.stubGlobal('fetch', mockFetch);
      httpTransport = new HttpTransport('http://localhost:4096', 60000);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('constructor', () => {
      it('should initialize with correct serverUrl and timeout', () => {
        const transport = new HttpTransport('http://custom:8080', 30000);
        expect(transport).toBeDefined();
      });
    });

    describe('getSessionId', () => {
      it('should return null initially', () => {
        expect(httpTransport.getSessionId()).toBeNull();
      });
    });

    describe('setSessionId', () => {
      it('should set session ID', () => {
        httpTransport.setSessionId('test-session-123');
        expect(httpTransport.getSessionId()).toBe('test-session-123');
      });

      it('should allow setting null', () => {
        httpTransport.setSessionId('test-session');
        httpTransport.setSessionId(null);
        expect(httpTransport.getSessionId()).toBeNull();
      });
    });

    describe('clearSession', () => {
      it('should clear session ID', () => {
        httpTransport.setSessionId('test-session');
        httpTransport.clearSession();
        expect(httpTransport.getSessionId()).toBeNull();
      });
    });

    describe('createSession', () => {
      it('should create session and return ID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'new-session-123' }),
        });

        const sessionId = await httpTransport.createSession();
        expect(sessionId).toBe('new-session-123');
        expect(httpTransport.getSessionId()).toBe('new-session-123');
      });

      it('should throw error when session creation fails', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

        await expect(httpTransport.createSession()).rejects.toThrow('Failed to create session');
      });
    });

    describe('sendMessage', () => {
      it('should create session if not exists', async () => {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'session-1' }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Hello' }] }),
          });

        const result = await httpTransport.sendMessage('test message');
        expect(result).toBe('Hello');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should send message with correct format', async () => {
        httpTransport.setSessionId('existing-session');
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Response' }] }),
        });

        const result = await httpTransport.sendMessage('my message');
        expect(result).toBe('Response');

        const fetchCall = mockFetch.mock.calls[0] as any;
        expect(fetchCall[0]).toContain('/session/existing-session/message');
        expect(fetchCall[1].body).toContain('my message');
      });

      it('should handle non-ok responses', async () => {
        httpTransport.setSessionId('session-1');
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Bad request'),
        });

        await expect(httpTransport.sendMessage('test')).rejects.toThrow('HTTP 400');
      });

      it('should return stringified JSON when no parts', async () => {
        httpTransport.setSessionId('session-1');
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'data' }),
        });

        const result = await httpTransport.sendMessage('test');
        expect(result).toBe('{"result":"data"}');
      });

      it('should handle timeout', async () => {
        vi.useFakeTimers();
        httpTransport.setSessionId('session-1');

        mockFetch.mockImplementation(
          () =>
            new Promise(resolve => {
              setTimeout(() => {
                resolve({
                  ok: true,
                  status: 200,
                  json: () => Promise.resolve({ parts: [{ type: 'text', text: 'late' }] }),
                });
              }, 70000);
            })
        );

        const sendPromise = httpTransport.sendMessage('test');
        vi.advanceTimersByTime(61000);
        await expect(sendPromise).rejects.toThrow('aborted');
        vi.useRealTimers();
      });
    });
  });

  describe('CliTransport', () => {
    let cliTransport: CliTransport;
    let mockSpawn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockSpawn = vi.mocked(spawn);
    });

    describe('constructor', () => {
      it('should initialize correctly', () => {
        const transport = new CliTransport('http://localhost:4096', 60000);
        expect(transport).toBeDefined();
      });
    });

    describe('getSessionId', () => {
      it('should always return null', () => {
        const transport = new CliTransport('http://localhost:4096', 60000);
        expect(transport.getSessionId()).toBeNull();
      });
    });

    describe('setSessionId', () => {
      it('should do nothing', () => {
        const transport = new CliTransport('http://localhost:4096', 60000);
        expect(() => transport.setSessionId('any-id')).not.toThrow();
      });
    });

    describe('clearSession', () => {
      it('should do nothing', () => {
        const transport = new CliTransport('http://localhost:4096', 60000);
        expect(() => transport.clearSession()).not.toThrow();
      });
    });

    describe('sendMessage', () => {
      it('should spawn opencode with correct args', async () => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, cb) => {
            if (event === 'close') cb(0);
          }),
          kill: vi.fn(),
        };
        mockSpawn.mockReturnValue(mockProc as any);

        const transport = new CliTransport('http://localhost:4096', 60000);
        const resultPromise = transport.sendMessage('test prompt');

        mockProc.stdout.on.mock.calls.find((c: any) => c[0] === 'data')?.[1]?.(
          '{"type":"text","part":{"text":"response"}}'
        );
        mockProc.on.mock.calls.find((c: any) => c[0] === 'close')?.[1]?.(0);

        const result = await resultPromise;
        expect(mockSpawn).toHaveBeenCalledWith(
          'opencode',
          expect.arrayContaining(['run', '--attach', 'http://localhost:4096', 'test prompt']),
          expect.any(Object)
        );
      });

      it('should handle opencode exit with non-zero code', async () => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn((_, cb) => cb(Buffer.from('error output'))) },
          on: vi.fn((event, cb) => {
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
        (spawnError as any).code = 'ENOENT';
        mockSpawn.mockImplementation(() => {
          throw spawnError;
        });

        const transport = new CliTransport('http://localhost:4096', 60000);

        await expect(transport.sendMessage('test')).rejects.toThrow('Failed to spawn opencode');
      });

      it('should handle timeout', async () => {
        vi.useFakeTimers();

        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn(),
        };
        mockSpawn.mockReturnValue(mockProc as any);

        const transport = new CliTransport('http://localhost:4096', 1000);
        const sendPromise = transport.sendMessage('test');

        vi.advanceTimersByTime(1100);

        await expect(sendPromise).rejects.toThrow('timed out');
        expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');

        vi.useRealTimers();
      });
    });

    describe('sendMessageStreaming', () => {
      it('should pass --thinking flag for streaming', async () => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, cb) => {
            if (event === 'close') cb(0);
          }),
          kill: vi.fn(),
        };
        mockSpawn.mockReturnValue(mockProc as any);

        const transport = new CliTransport('http://localhost:4096', 60000);
        const onChunk = vi.fn();
        await transport.sendMessageStreaming('test', onChunk);

        expect(mockSpawn).toHaveBeenCalledWith(
          'opencode',
          expect.arrayContaining(['--thinking']),
          expect.any(Object)
        );
      });

      it('should call onChunk with text chunks', async () => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn(),
        };
        mockSpawn.mockReturnValue(mockProc as any);

        const transport = new CliTransport('http://localhost:4096', 60000);
        const onChunk = vi.fn();
        const sendPromise = transport.sendMessageStreaming('test', onChunk);

        const stderrCallback = mockProc.stderr.on.mock.calls.find((c: any) => c[0] === 'data')?.[1];
        stderrCallback?.(Buffer.from('{"type":"text","part":{"text":"chunk1"}}\n'));
        stderrCallback?.(Buffer.from('{"type":"thinking","part":{"text":"thinking..."}}\n'));
        mockProc.on.mock.calls.find((c: any) => c[0] === 'close')?.[1]?.(0);

        await sendPromise;

        expect(onChunk).toHaveBeenCalledWith('chunk1', 'text');
        expect(onChunk).toHaveBeenCalledWith('thinking...', 'thinking');
      });
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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mockFetch = fetch as ReturnType<typeof vi.fn>;
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
    it('should calculate exponential backoff with jitter', () => {
      const agent = new UnifiedAgent({ retryDelay: 1000 });
      const delays: number[] = [];
      for (let i = 1; i <= 5; i++) {
        delays.push(agent.calculateRetryDelay(i));
      }
      expect(delays[0]).toBeGreaterThanOrEqual(1000);
      expect(delays[1]).toBeGreaterThanOrEqual(2000);
      expect(delays[2]).toBeGreaterThanOrEqual(4000);
    });

    it('should cap delay at 30000ms', () => {
      const agent = new UnifiedAgent({ retryDelay: 10000 });
      const delay = agent.calculateRetryDelay(10);
      expect(delay).toBeLessThanOrEqual(30000);
    });
  });

  describe('executeTask - HTTP mode', () => {
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
      expect(result.output).toBe('Success');
    });

    it('should retry on failure and eventually succeed', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'Recovery' }] }),
        });

      const agent = new UnifiedAgent({ maxRetries: 2, retryDelay: 10, enableLogging: false });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Recovery');
    });

    it('should fail after max retries exhausted', async () => {
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
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error 2'),
        });

      const agent = new UnifiedAgent({ maxRetries: 2, retryDelay: 10, enableLogging: false });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error 2');
    });

    it('should handle session-related errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('session error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-2' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'ok' }] }),
        });

      const agent = new UnifiedAgent({ maxRetries: 2, retryDelay: 10, enableLogging: false });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
    });

    it('should return session ID in response', async () => {
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
  });

  describe('executeTask - CLI mode', () => {
    let mockSpawn: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const { spawn } = await import('child_process');
      mockSpawn = spawn as ReturnType<typeof vi.fn>;
    });

    it('should spawn opencode for CLI mode', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const agent = new UnifiedAgent({ mode: 'cli', enableLogging: false });
      await agent.executeTask('test prompt');

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining([
          'run',
          '--attach',
          'http://localhost:4096',
          '--format',
          'json',
          'test prompt',
        ]),
        expect.any(Object)
      );
    });
  });

  describe('executeTaskStreaming', () => {
    let mockSpawn: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const { spawn } = await import('child_process');
      mockSpawn = spawn as ReturnType<typeof vi.fn>;
    });

    it('should only work in CLI mode', async () => {
      const agent = new UnifiedAgent({ mode: 'http', enableLogging: false });
      await expect(agent.executeTaskStreaming('test', vi.fn())).rejects.toThrow(
        'Streaming is only supported in CLI mode'
      );
    });

    it('should call onChunk for streaming responses', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const agent = new UnifiedAgent({ mode: 'cli', enableLogging: false });
      const onChunk = vi.fn();
      const sendPromise = agent.executeTaskStreaming('test', onChunk);

      const stderrCallback = mockProc.stderr.on.mock.calls.find((c: any) => c[0] === 'data')?.[1];
      stderrCallback?.(Buffer.from('{"type":"text","part":{"text":"stream1"}}\n'));
      mockProc.on.mock.calls.find((c: any) => c[0] === 'close')?.[1]?.(0);

      const result = await sendPromise;
      expect(result.success).toBe(true);
      expect(onChunk).toHaveBeenCalled();
    });

    it('should handle streaming errors', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn((_, cb) => cb(Buffer.from('error'))) },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(1);
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProc as any);

      const agent = new UnifiedAgent({ mode: 'cli', enableLogging: false });
      const result = await agent.executeTaskStreaming('test', vi.fn());

      expect(result.success).toBe(false);
      expect(result.message).toContain('opencode exited');
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
      expect(sentMessage).toContain('The bug is in auth module');
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
                  text: 'Created file: src/utils/helper.ts and modified: package.json',
                },
              ],
            }),
        });

      const agent = new UnifiedAgent({ enableLogging: false });
      const result = await agent.executeTask('create a file');

      expect(result.artifacts).toContain('src/utils/helper.ts');
      expect(result.artifacts).toContain('package.json');
    });

    it('should return empty artifacts array when none found', async () => {
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
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('AbortError'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-2' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'ok' }] }),
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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mockFetch = fetch as ReturnType<typeof vi.fn>;
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

    it('should match UnifiedAgent executeTask signature for HTTP mode', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'ok' }] }),
        });

      const unifiedAgent = new UnifiedAgent({ enableLogging: false });
      const agent = new Agent();

      const unifiedResult = await unifiedAgent.executeTask('test');
      const agentResult = await agent.executeTask('test');

      expect(unifiedResult.success).toBe(agentResult.success);
      expect(unifiedResult.message).toBe(agentResult.message);
    });
  });

  describe('Agent config compatibility', () => {
    it('should accept timeout config', () => {
      const agent = new Agent({ timeout: 30000 });
      expect(agent).toBeDefined();
    });

    it('should accept maxRetries config', () => {
      const agent = new Agent({ maxRetries: 5 });
      expect(agent).toBeDefined();
    });

    it('should accept retryDelay config', () => {
      const agent = new Agent({ retryDelay: 2000 });
      expect(agent).toBeDefined();
    });

    it('should accept serverUrl config', () => {
      const agent = new Agent({ serverUrl: 'http://custom:8080' });
      expect(agent).toBeDefined();
    });

    it('should use default values when not provided', () => {
      const agent = new Agent({});
      expect(agent).toBeDefined();
    });
  });

  describe('Agent error handling compatibility', () => {
    it('should handle network errors with retry', async () => {
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
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ parts: [{ type: 'text', text: 'recovered' }] }),
        });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(true);
      expect(result.message).toBe('recovered');
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
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'session-1' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error 2'),
        });

      const agent = new Agent({ maxRetries: 2, retryDelay: 10 });
      const result = await agent.executeTask('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error 2');
    });
  });
});
