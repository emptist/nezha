import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GLM5Provider } from '../services/ai/GLM5Provider.js';

const TEST_API_KEY = 'test-zhipu-key-for-nezha-12345';
const TEST_BASE_URL = 'https://api.test.bigmodel.cn/v4';

function mockFetchResponse(data: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
    json: () => Promise.resolve(data),
  };
}

describe('GLM5Provider (Nezha)', () => {
  let provider: GLM5Provider;

  beforeEach(() => {
    provider = new GLM5Provider({
      provider: 'glm5',
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      model: 'glm-5',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should extend BaseAIProvider with glm5 provider type', () => {
      expect(provider.getProvider()).toBe('glm5');
      expect(provider.getModel()).toBe('glm-5');
    });

    it('should use default model when not specified', () => {
      const defaultProvider = new GLM5Provider({
        provider: 'glm5',
        apiKey: TEST_API_KEY,
      });
      expect(defaultProvider.getModel()).toBe('glm-5');
    });
  });

  describe('complete', () => {
    it('should send request to bigmodel.cn and return content', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{
            message: { content: 'Hello from GLM-5!' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'glm-5',
        })
      );

      const result = await provider.complete('Say hello');

      expect(result.content).toBe('Hello from GLM-5!');
      expect(result.model).toBe('glm-5');
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(5);
      expect(result.usage?.totalTokens).toBe(15);
    });

    it('should include system prompt in messages', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          model: 'glm-5',
        })
      );

      await provider.complete('Task', 'You are helpful');

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Task' });
    });

    it('should throw error when API key is missing', async () => {
      const noKeyProvider = new GLM5Provider({ provider: 'glm5' });
      await expect(noKeyProvider.complete('test')).rejects.toThrow('API key not set');
    });

    it('should handle API error responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({ error: { message: 'Rate limited' } }, 429)
      );
      await expect(provider.complete('test')).rejects.toThrow('429');
    });

    it('should handle empty choices', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({ choices: [] })
      );
      await expect(provider.complete('test')).rejects.toThrow('no choices');
    });

    it('should handle null content gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: null }, finish_reason: 'stop' }],
          model: 'glm-5',
        })
      );
      const result = await provider.complete('test');
      expect(result.content).toBe('');
    });

    it('should use config overrides when provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: 'Override response' }, finish_reason: 'stop' }],
          model: 'glm-5-plus',
        })
      );

      const result = await provider.complete('task', undefined, {
        apiKey: 'override-key',
        model: 'glm-5-plus',
        baseUrl: 'https://custom.url/v4',
      });

      expect(result.model).toBe('glm-5-plus');

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toContain('custom.url');
      expect(callArgs[1].headers.Authorization).toContain('override-key');
    });
  });

  describe('completeJSON', () => {
    it('should parse JSON from GLM-5 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: '{"result":"ok","count":42}' }, finish_reason: 'stop' }],
          model: 'glm-5',
        })
      );

      const result = await provider.completeJSON<{ result: string; count: number }>('Give me JSON');
      expect(result.result).toBe('ok');
      expect(result.count).toBe(42);
    });

    it('should throw if no JSON found in response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: 'No JSON here' }, finish_reason: 'stop' }],
          model: 'glm-5',
        })
      );
      await expect(provider.completeJSON('test')).rejects.toThrow('No JSON found');
    });
  });
});
