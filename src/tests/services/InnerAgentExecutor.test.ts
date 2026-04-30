import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InnerAgentExecutor } from '../../services/InnerAgentExecutor.js';
import type { AIProvider } from '../../services/ai/index.js';

const mockProvider: Partial<AIProvider> = {
  complete: vi.fn(),
};

describe('InnerAgentExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create executor with provided provider', () => {
      const executor = new InnerAgentExecutor(mockProvider as AIProvider);
      expect(executor).toBeDefined();
    });
  });

  describe('executeTask', () => {
    it('should return successful result when AI completes', async () => {
      mockProvider.complete = vi.fn().mockResolvedValue({ content: 'Task completed' });
      const executor = new InnerAgentExecutor(mockProvider as AIProvider);

      const result = await executor.executeTask('Test prompt');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Task completed');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failed result on error', async () => {
      mockProvider.complete = vi.fn().mockRejectedValue(new Error('API error'));
      const executor = new InnerAgentExecutor(mockProvider as AIProvider);

      const result = await executor.executeTask('Test prompt');

      expect(result.success).toBe(false);
      expect(result.message).toBe('API error');
    });

    it('should respect custom timeout', async () => {
      mockProvider.complete = vi
        .fn()
        .mockImplementation(() => new Promise(r => setTimeout(r, 100)));
      const executor = new InnerAgentExecutor(mockProvider as AIProvider);

      const result = await executor.executeTask('Test prompt', 50);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Task timeout');
    });
  });

  describe('runReflection', () => {
    it('should return successful result', async () => {
      mockProvider.complete = vi.fn().mockResolvedValue({ content: 'Reflection result' });
      const executor = new InnerAgentExecutor(mockProvider as AIProvider);

      const result = await executor.runReflection('Reflect on this');

      expect(result.success).toBe(true);
      expect(result.output).toBe('Reflection result');
    });

    it('should return failed result on error', async () => {
      mockProvider.complete = vi.fn().mockRejectedValue(new Error('Reflection failed'));
      const executor = new InnerAgentExecutor(mockProvider as AIProvider);

      const result = await executor.runReflection('Reflect on this');

      expect(result.success).toBe(false);
      expect(result.output).toBe('Reflection failed');
    });
  });
});
