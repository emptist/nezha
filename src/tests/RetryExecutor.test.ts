import { describe, it, expect, beforeEach } from 'vitest';
import {
  RetryExecutor,
  DEFAULT_RETRY_POLICY,
  createRetryExecutor,
  PRESET_POLICIES,
} from '../../src/utils/RetryExecutor.js';

describe('RetryExecutor', () => {
  describe('constructor', () => {
    it('should use default policy when no config provided', () => {
      const executor = new RetryExecutor();
      const policy = executor.getPolicy();
      expect(policy.maxAttempts).toBe(DEFAULT_RETRY_POLICY.maxAttempts);
      expect(policy.initialDelayMs).toBe(DEFAULT_RETRY_POLICY.initialDelayMs);
    });

    it('should accept custom retry policy', () => {
      const executor = new RetryExecutor({
        maxAttempts: 5,
        initialDelayMs: 500,
      });
      const policy = executor.getPolicy();
      expect(policy.maxAttempts).toBe(5);
      expect(policy.initialDelayMs).toBe(500);
    });
  });

  describe('calculateDelay', () => {
    it('should calculate exponential backoff', () => {
      const executor = new RetryExecutor({
        initialDelayMs: 100,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      const delay1 = executor.calculateDelay(1);
      const delay2 = executor.calculateDelay(2);
      const delay3 = executor.calculateDelay(3);

      expect(delay1).toBe(100);
      expect(delay2).toBe(200);
      expect(delay3).toBe(400);
    });

    it('should respect max delay', () => {
      const executor = new RetryExecutor({
        initialDelayMs: 1000,
        backoffMultiplier: 10,
        maxDelayMs: 5000,
        jitterFactor: 0,
      });

      const delay = executor.calculateDelay(10);
      expect(delay).toBe(5000);
    });
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const executor = new RetryExecutor({ maxAttempts: 3 });
      const result = await executor.execute(() => Promise.resolve('success'));

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts.length).toBe(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const executor = new RetryExecutor({ maxAttempts: 3 });

      const result = await executor.execute(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should fail after max attempts', async () => {
      let attempts = 0;
      const executor = new RetryExecutor({
        maxAttempts: 3,
        retryableErrors: () => true,
      });

      const result = await executor.execute(async () => {
        attempts++;
        throw new Error('Persistent failure');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(attempts).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      let attempts = 0;
      const executor = new RetryExecutor({
        maxAttempts: 3,
        retryableErrors: () => false,
      });

      const result = await executor.execute(async () => {
        attempts++;
        throw new Error('Non-retryable');
      });

      expect(result.success).toBe(false);
      expect(attempts).toBe(1);
    });

    it('should include attempt history in result', async () => {
      let attempts = 0;
      const executor = new RetryExecutor({ maxAttempts: 3 });

      await executor.execute(async () => {
        attempts++;
        if (attempts < 2) throw new Error('Fail');
        return 'success';
      });

      const history = executor.getAttemptHistory();
      expect(history.length).toBe(2);
      expect(history[0].attempt).toBe(1);
      expect(history[1].attempt).toBe(2);
    });
  });

  describe('presets', () => {
    it('should create fast executor', () => {
      const executor = createRetryExecutor('fast');
      expect(executor.getPolicy().maxAttempts).toBe(2);
    });

    it('should create aggressive executor', () => {
      const executor = createRetryExecutor('aggressive');
      expect(executor.getPolicy().maxAttempts).toBe(5);
    });

    it('should create persistent executor', () => {
      const executor = createRetryExecutor('persistent');
      expect(executor.getPolicy().maxAttempts).toBe(10);
    });
  });

  describe('reset', () => {
    it('should clear attempt history', async () => {
      let attempts = 0;
      const executor = new RetryExecutor({ maxAttempts: 3 });

      await executor.execute(async () => {
        attempts++;
        if (attempts < 2) throw new Error('Fail');
        return 'success';
      });

      executor.reset();
      expect(executor.getAttemptHistory().length).toBe(0);
    });
  });
});
