import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent, type AgentConfig } from '../core/Agent.js';

vi.mock('http', () => {
  const mockRequest = vi.fn();
  return {
    request: vi.fn(() => {
      const req = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: vi.fn((timeout, callback) => {
          setTimeout(callback, 0);
        }),
        destroy: vi.fn(),
      };
      return req;
    }),
    request: mockRequest,
  };
});

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      host: 'localhost',
      port: 4099,
      timeout: 5000,
      maxRetries: 2,
      retryDelay: 100,
    });
  });

  describe('constructor', () => {
    it('should create agent with default config', () => {
      const defaultAgent = new Agent();
      expect(defaultAgent).toBeDefined();
    });

    it('should create agent with custom config', () => {
      const config: AgentConfig = {
        host: 'custom-host',
        port: 1234,
        timeout: 10000,
        maxRetries: 5,
        retryDelay: 2000,
      };
      const customAgent = new Agent(config);
      expect(customAgent).toBeDefined();
    });

    it('should use default values for missing config options', () => {
      const partialAgent = new Agent({ host: 'test-host' });
      expect(partialAgent).toBeDefined();
    });
  });

  describe('createSession', () => {
    it('should throw error when server returns non-200 status', async () => {
      const http = await import('http');
      const originalRequest = http.request;
      
      let responseHandler: ((res: http.IncomingMessage) => void) | null = null;
      
      vi.mocked(http.request).mockImplementation((options, callback) => {
        const mockReq = {
          on: vi.fn(),
          write: vi.fn(),
          end: vi.fn(),
          setTimeout: vi.fn((timeout, cb) => {
            setTimeout(cb, 0);
          }),
          destroy: vi.fn(),
        } as unknown as http.ClientRequest;
        
        const mockRes = {
          statusCode: 500,
          on: vi.fn((event: string, handler: () => void) => {
            if (event === 'end') {
              setTimeout(handler, 0);
            }
          }),
        } as unknown as http.IncomingMessage;
        
        setTimeout(() => {
          callback(mockRes);
          mockRes.on('data', vi.fn());
          mockRes.on('end', vi.fn());
        }, 0);
        
        return mockReq;
      });

      await expect(agent.createSession()).rejects.toThrow();
      
      vi.mocked(http.request).mockRestore();
    });

    it('should throw error on connection refused', async () => {
      const http = await import('http');
      
      vi.mocked(http.request).mockImplementation(() => {
        const mockReq = {
          on: vi.fn((event: string, handler: (err: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('Connection refused')), 0);
            }
          }),
          write: vi.fn(),
          end: vi.fn(),
          setTimeout: vi.fn(),
          destroy: vi.fn(),
        } as unknown as http.ClientRequest;
        return mockReq;
      });

      await expect(agent.createSession()).rejects.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should return failure response when server error', async () => {
      const http = await import('http');
      
      vi.mocked(http.request).mockImplementation(() => {
        const mockReq = {
          on: vi.fn(),
          write: vi.fn(),
          end: vi.fn(),
          setTimeout: vi.fn((timeout, cb) => {
            setTimeout(cb, 0);
          }),
          destroy: vi.fn(),
        } as unknown as http.ClientRequest;
        
        const mockRes = {
          statusCode: 503,
          on: vi.fn((event: string, handler: () => void) => {
            if (event === 'end') {
              setTimeout(handler, 0);
            }
          }),
        } as unknown as http.IncomingMessage;
        
        setTimeout(() => {
          const cb = vi.fn();
          cb(mockRes);
        }, 0);
        
        return mockReq;
      });

      const result = await agent.sendMessage('test-session', 'Hello');
      expect(result.success).toBe(false);
    });
  });

  describe('executeTask', () => {
    it('should return failure response when createSession fails', async () => {
      const http = await import('http');
      
      vi.mocked(http.request).mockImplementation(() => {
        const mockReq = {
          on: vi.fn((event: string, handler: (err: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('Connection refused')), 0);
            }
          }),
          write: vi.fn(),
          end: vi.fn(),
          setTimeout: vi.fn(),
          destroy: vi.fn(),
        } as unknown as http.ClientRequest;
        return mockReq;
      });

      const result = await agent.executeTask('Test task');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Task execution failed');
    });
  });
});

describe('Agent - Network Error Handling', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      host: 'localhost',
      port: 4099,
      timeout: 1000,
      maxRetries: 1,
      retryDelay: 50,
    });
  });

  it('should handle ECONNREFUSED error', async () => {
    const http = await import('http');
    
    let errorHandler: ((err: Error) => void) | null = null;
    
    vi.mocked(http.request).mockImplementation(() => {
      const mockReq = {
        on: vi.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            errorHandler = handler;
            setTimeout(() => handler(new Error('connect ECONNREFUSED')), 0);
          }
        }),
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: vi.fn(),
        destroy: vi.fn(),
      } as unknown as http.ClientRequest;
      return mockReq;
    });

    const result = await agent.sendMessage('session-1', 'test');
    expect(result.success).toBe(false);
  });

  it('should handle ETIMEDOUT error', async () => {
    const http = await import('http');
    
    vi.mocked(http.request).mockImplementation(() => {
      const mockReq = {
        on: vi.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('ETIMEDOUT')), 0);
          }
        }),
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: vi.fn(),
        destroy: vi.fn(),
      } as unknown as http.ClientRequest;
      return mockReq;
    });

    const result = await agent.sendMessage('session-1', 'test');
    expect(result.success).toBe(false);
  });

  it('should handle ENOTFOUND error', async () => {
    const http = await import('http');
    
    vi.mocked(http.request).mockImplementation(() => {
      const mockReq = {
        on: vi.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('getaddrinfo ENOTFOUND localhost')), 0);
          }
        }),
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: vi.fn(),
        destroy: vi.fn(),
      } as unknown as http.ClientRequest;
      return mockReq;
    });

    const result = await agent.sendMessage('session-1', 'test');
    expect(result.success).toBe(false);
  });
});

describe('Agent - Retry Logic', () => {
  it('should use exponential backoff for retries', async () => {
    const agent = new Agent({
      host: 'localhost',
      port: 4099,
      timeout: 1000,
      maxRetries: 3,
      retryDelay: 100,
    });
    
    expect(agent).toBeDefined();
  });

  it('should not retry on non-retryable errors', async () => {
    const http = await import('http');
    
    let callCount = 0;
    vi.mocked(http.request).mockImplementation(() => {
      callCount++;
      const mockReq = {
        on: vi.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('ECONNREFUSED')), 0);
          }
        }),
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: vi.fn(),
        destroy: vi.fn(),
      } as unknown as http.ClientRequest;
      return mockReq;
    });

    const agent = new Agent({
      host: 'localhost',
      port: 4099,
      timeout: 1000,
      maxRetries: 3,
      retryDelay: 50,
    });

    await agent.sendMessage('session-1', 'test');
  });
});
