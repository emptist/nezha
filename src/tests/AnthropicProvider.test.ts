import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from '../services/ai/AnthropicProvider.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AnthropicProvider', () => {
  describe('create instance', () => {
    it('should create provider with config', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-api-key',
        model: 'claude-sonnet-4-20250514',
      });
      expect(provider).toBeDefined();
      expect(provider.getProvider()).toBe('anthropic');
    });
  });
});
