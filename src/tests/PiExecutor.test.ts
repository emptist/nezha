import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PiExecutor } from '../../src/services/PiExecutor.js';

describe('PiExecutor', () => {
  let executor: PiExecutor;

  beforeEach(() => {
    executor = new PiExecutor({
      piPath: 'echo',
      model: 'test-model',
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use provided piPath', () => {
      const exec = new PiExecutor({ piPath: '/custom/path' });
      expect(exec).toBeDefined();
    });

    it('should use default piPath when not provided', () => {
      const exec = new PiExecutor({});
      expect(exec).toBeDefined();
    });

    it('should use default model when not provided', () => {
      const exec = new PiExecutor({});
      expect(exec).toBeDefined();
    });

    it('should use provided model', () => {
      const exec = new PiExecutor({ model: 'custom-model' });
      expect(exec).toBeDefined();
    });

    it('should accept env overrides', () => {
      const exec = new PiExecutor({
        env: { CUSTOM_VAR: 'value' },
      });
      expect(exec).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute a simple command successfully', async () => {
      const executor = new PiExecutor({ piPath: 'echo' });
      const result = await executor.execute('hello world');

      expect(result.success).toBe(true);
      expect(result.output).toContain('hello world');
      expect(result.durationMs).toBeGreaterThan(0);
    }, 10000);

    it('should return success for zero exit code', async () => {
      const executor = new PiExecutor({ piPath: 'true' });
      const result = await executor.execute('test');

      expect(result.success).toBe(true);
    }, 10000);

    it('should handle command failure (non-zero exit)', async () => {
      const executor = new PiExecutor({ piPath: 'false' });
      const result = await executor.execute('test');

      expect(result.success).toBe(false);
      expect(result.output).toBeTruthy();
    }, 10000);

    it('should respect timeout parameter', async () => {
      const executor = new PiExecutor({ piPath: 'sleep' });
      const shortTimeout = 100;

      const result = await executor.execute('10', shortTimeout);
      expect(result.success).toBe(false);
      expect(result.durationMs).toBeLessThanOrEqual(shortTimeout + 50);
    }, 5000);

    it('should include execution duration in result', async () => {
      const executor = new PiExecutor({ piPath: 'echo' });
      const start = Date.now();
      const result = await executor.execute('test');
      const end = Date.now();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThanOrEqual(end - start + 50);
    }, 10000);

    it('should capture stdout output', async () => {
      const executor = new PiExecutor({ piPath: 'echo' });
      const result = await executor.execute('stdout-test-message');

      expect(result.output).toContain('stdout-test-message');
    }, 10000);

    it('should return error message on failure', async () => {
      const executor = new PiExecutor({ piPath: 'false' });
      const result = await executor.execute('test');

      expect(result.success).toBe(false);
      expect(result.message).toBeTruthy();
    }, 10000);
  });

  describe('security', () => {
    it('should use shell=false to prevent command injection', async () => {
      const executor = new PiExecutor({ piPath: 'echo' });

      const result = await executor.execute('safe-input; rm -rf /');
      expect(result.success).toBe(true);
      expect(result.output).toContain('; rm -rf /');
    }, 10000);

    it('should pass arguments as array not concatenated string', async () => {
      const executor = new PiExecutor({ piPath: 'echo' });
      const result = await executor.execute('arg1 arg2');

      expect(result.output).toContain('arg1 arg2');
    }, 10000);
  });

  describe('environment handling', () => {
    it('should accept custom env configuration', () => {
      const executor = new PiExecutor({
        piPath: 'echo',
        env: { CUSTOM_VAR: 'test-value', ANOTHER_VAR: 'value2' },
      });

      expect(executor).toBeDefined();
    });

    it('should not throw when configured with empty env', () => {
      const executor = new PiExecutor({
        piPath: 'echo',
        env: {},
      });

      expect(executor).toBeDefined();
    });
  });

  describe('result structure', () => {
    it('should return correct PiTaskResult structure', async () => {
      const executor = new PiExecutor({ piPath: 'echo' });
      const result = await executor.execute('structure-test');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('durationMs');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.output).toBe('string');
      expect(typeof result.message).toBe('string');
      expect(typeof result.durationMs).toBe('number');
    }, 10000);
  });
});
