import { describe, it, expect } from 'vitest';
import { waitForever } from '../utils/wait.js';

describe('wait', () => {
  describe('waitForever', () => {
    it('should return a Promise', () => {
      const result = waitForever();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should never resolve', async () => {
      const promise = waitForever();
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100));
      await expect(Promise.race([promise, timeout])).rejects.toThrow('Timeout');
    });
  });
});
