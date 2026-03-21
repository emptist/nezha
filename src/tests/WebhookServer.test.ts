import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WebhookServer,
  getWebhookServer,
  type WebhookServerConfig,
  type WebhookMapping,
} from '../services/WebhookServer.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../core/PluginManager.js', () => ({
  getPluginManager: vi.fn().mockReturnValue({
    executeOnWebhook: vi.fn().mockResolvedValue(undefined),
    executeOnWake: vi.fn().mockResolvedValue(undefined),
    executeOnWebhookTask: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('WebhookServer', () => {
  let server: WebhookServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new WebhookServer();
  });

  describe('constructor', () => {
    it('should create with defaults', () => {
      expect(server).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: Partial<WebhookServerConfig> = { port: 9090, path: '/custom' };
      const svc = new WebhookServer(config);
      expect(svc).toBeDefined();
    });

    it('should accept custom mappings', () => {
      const mappings: WebhookMapping[] = [{ path: 'custom', action: 'wake' }];
      const svc = new WebhookServer({}, mappings);
      expect(svc).toBeDefined();
    });
  });

  describe('setCreateTaskCallback', () => {
    it('should set callback', () => {
      const callback = vi.fn().mockResolvedValue({ id: 'task-1' });
      server.setCreateTaskCallback(callback);
      expect(server).toBeDefined();
    });
  });

  describe('authenticate', () => {
    it('should allow access without token', () => {
      const serverAny = server as unknown as { authenticate: (req: any) => boolean };
      expect(serverAny.authenticate({ headers: {} })).toBe(true);
    });

    it('should allow access with correct token', () => {
      const svc = new WebhookServer({ token: 'secret-token' });
      const serverAny = svc as unknown as { authenticate: (req: any) => boolean };
      expect(serverAny.authenticate({ headers: { authorization: 'Bearer secret-token' } })).toBe(
        true
      );
    });

    it('should deny access with wrong token', () => {
      const svc = new WebhookServer({ token: 'secret-token' });
      const serverAny = svc as unknown as { authenticate: (req: any) => boolean };
      expect(serverAny.authenticate({ headers: { authorization: 'Bearer wrong-token' } })).toBe(
        false
      );
    });

    it('should deny access without Bearer prefix', () => {
      const svc = new WebhookServer({ token: 'secret-token' });
      const serverAny = svc as unknown as { authenticate: (req: any) => boolean };
      expect(serverAny.authenticate({ headers: { authorization: 'secret-token' } })).toBe(false);
    });
  });

  describe('parseBody', () => {
    it('should parse JSON body', async () => {
      const serverAny = server as unknown as { parseBody: (req: any) => Promise<any> };
      const req = {
        on: (event: string, handler: (chunk: Buffer) => void) => {
          if (event === 'data') handler(Buffer.from('{"key":"value"}'));
          if (event === 'end') handler(Buffer.from(''));
        },
      };

      const body = await serverAny.parseBody(req);
      expect(body).toEqual({ key: 'value' });
    });

    it('should return empty object for empty body', async () => {
      const serverAny = server as unknown as { parseBody: (req: any) => Promise<any> };
      const req = {
        on: (event: string, handler: () => void) => {
          if (event === 'end') handler();
        },
      };

      const body = await serverAny.parseBody(req);
      expect(body).toEqual({});
    });

    it('should return empty object for invalid JSON', async () => {
      const serverAny = server as unknown as { parseBody: (req: any) => Promise<any> };
      const req = {
        on: (event: string, handler: (chunk: Buffer) => void) => {
          if (event === 'data') handler(Buffer.from('not json'));
          if (event === 'end') handler(Buffer.from(''));
        },
      };

      const body = await serverAny.parseBody(req);
      expect(body).toEqual({});
    });
  });

  describe('renderTemplate', () => {
    it('should render simple placeholders', () => {
      const serverAny = server as unknown as {
        renderTemplate: (template: string, ctx: any) => string;
      };
      const result = serverAny.renderTemplate('Hello {{name}}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should render nested placeholders', () => {
      const serverAny = server as unknown as {
        renderTemplate: (template: string, ctx: any) => string;
      };
      const result = serverAny.renderTemplate('User: {{user.name}}', { user: { name: 'Alice' } });
      expect(result).toBe('User: Alice');
    });

    it('should handle missing placeholders', () => {
      const serverAny = server as unknown as {
        renderTemplate: (template: string, ctx: any) => string;
      };
      const result = serverAny.renderTemplate('Hello {{name}}!', {});
      expect(result).toBe('Hello !');
    });

    it('should render multiple placeholders', () => {
      const serverAny = server as unknown as {
        renderTemplate: (template: string, ctx: any) => string;
      };
      const result = serverAny.renderTemplate('{{a}} + {{b}} = {{c}}', { a: 1, b: 2, c: 3 });
      expect(result).toBe('1 + 2 = 3');
    });
  });

  describe('start', () => {
    it('should not start when disabled', async () => {
      const svc = new WebhookServer({ enabled: false });
      await svc.start();
      // No error means it skipped starting
    });
  });

  describe('stop', () => {
    it('should be callable without start', () => {
      expect(() => server.stop()).not.toThrow();
    });
  });

  describe('exported getWebhookServer', () => {
    it('should return singleton instance', () => {
      const instance1 = getWebhookServer();
      const instance2 = getWebhookServer();
      expect(instance1).toBe(instance2);
    });
  });
});
