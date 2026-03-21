import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BaseAIProvider,
  AIProvider,
  AICompletionResponse,
  AIProviderConfig,
} from '../services/ai/AIProvider.js';

class MockAIProvider extends BaseAIProvider {
  async complete(
    prompt: string,
    systemPrompt?: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AICompletionResponse> {
    return {
      content: `Response to: ${prompt}`,
      model: config?.model || this.config.model || 'mock-model',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }
}

describe('AIProvider', () => {
  describe('BaseAIProvider', () => {
    let provider: MockAIProvider;

    beforeEach(() => {
      provider = new MockAIProvider({ provider: 'openai', model: 'gpt-4' });
    });

    describe('constructor', () => {
      it('should create provider with config', () => {
        expect(provider).toBeDefined();
      });

      it('should accept custom config', () => {
        const custom = new MockAIProvider({
          provider: 'anthropic',
          model: 'claude-3',
          apiKey: 'secret',
          baseUrl: 'https://api.example.com',
        });
        expect(custom).toBeDefined();
      });
    });

    describe('complete', () => {
      it('should complete prompt', async () => {
        const response = await provider.complete('Hello world');

        expect(response.content).toContain('Hello world');
        expect(response.model).toBe('gpt-4');
      });

      it('should include system prompt', async () => {
        const response = await provider.complete('Hello', 'You are a helpful assistant');

        expect(response.content).toContain('Hello');
      });

      it('should use config model if provided', async () => {
        const response = await provider.complete('Hello', undefined, { model: 'custom-model' });

        expect(response.model).toBe('custom-model');
      });
    });

    describe('completeJSON', () => {
      it('should parse JSON from response', async () => {
        const mockProvider = new MockAIProvider({ provider: 'openai' });
        mockProvider.complete = vi.fn().mockResolvedValue({
          content: 'Here is the JSON: {"name":"test","value":42}',
          model: 'gpt-4',
        });

        const result = await mockProvider.completeJSON<{ name: string; value: number }>('Get JSON');

        expect(result.name).toBe('test');
        expect(result.value).toBe(42);
      });

      it('should throw when no JSON in response', async () => {
        const mockProvider = new MockAIProvider({ provider: 'openai' });
        mockProvider.complete = vi.fn().mockResolvedValue({
          content: 'No JSON here',
          model: 'gpt-4',
        });

        await expect(mockProvider.completeJSON('Get JSON')).rejects.toThrow('No JSON found');
      });
    });

    describe('getModel', () => {
      it('should return configured model', () => {
        expect(provider.getModel()).toBe('gpt-4');
      });

      it('should return unknown when no model', () => {
        const custom = new MockAIProvider({ provider: 'openai' });
        expect(custom.getModel()).toBe('unknown');
      });
    });

    describe('getProvider', () => {
      it('should return provider name', () => {
        expect(provider.getProvider()).toBe('openai');
      });

      it('should return configured provider', () => {
        const custom = new MockAIProvider({ provider: 'anthropic' });
        expect(custom.getProvider()).toBe('anthropic');
      });
    });
  });

  describe('interfaces', () => {
    it('should define AIProviderConfig interface', () => {
      const config: AIProviderConfig = {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'secret',
        baseUrl: 'https://api.example.com',
      };

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4');
    });

    it('should define AICompletionResponse interface', () => {
      const response: AICompletionResponse = {
        content: 'Hello',
        model: 'gpt-4',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };

      expect(response.content).toBe('Hello');
      expect(response.usage?.totalTokens).toBe(30);
    });

    it('should define AIProvider interface', () => {
      const provider: AIProvider = {
        complete: vi.fn(),
        completeJSON: vi.fn(),
        getModel: vi.fn().mockReturnValue('model'),
        getProvider: vi.fn().mockReturnValue('provider'),
      };

      expect(typeof provider.complete).toBe('function');
      expect(typeof provider.completeJSON).toBe('function');
      expect(typeof provider.getModel).toBe('function');
      expect(typeof provider.getProvider).toBe('function');
    });
  });
});
