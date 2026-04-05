import { describe, it, expect, beforeEach } from 'vitest';

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true;
  }

  getRemaining(key: string): number {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validCount = timestamps.filter(t => now - t < this.windowMs).length;
    return Math.max(0, this.maxRequests - validCount);
  }
}

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(60000, 5);
  });

  describe('isAllowed', () => {
    it('should allow requests within limit', () => {
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed('client-1')).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('client-1');
      }

      expect(limiter.isAllowed('client-1')).toBe(false);
    });

    it('should handle multiple clients independently', () => {
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('client-1');
      }

      expect(limiter.isAllowed('client-1')).toBe(false);
      expect(limiter.isAllowed('client-2')).toBe(true);
    });

    it('should allow requests after window expires', async () => {
      const shortWindow = new RateLimiter(50, 2);

      expect(shortWindow.isAllowed('client')).toBe(true);
      expect(shortWindow.isAllowed('client')).toBe(true);
      expect(shortWindow.isAllowed('client')).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(shortWindow.isAllowed('client')).toBe(true);
    }, 100);
  });

  describe('getRemaining', () => {
    it('should return full capacity initially', () => {
      expect(limiter.getRemaining('client-1')).toBe(5);
    });

    it('should decrease remaining after each request', () => {
      limiter.isAllowed('client-1');
      expect(limiter.getRemaining('client-1')).toBe(4);

      limiter.isAllowed('client-1');
      expect(limiter.getRemaining('client-1')).toBe(3);
    });

    it('should return zero when limit reached', () => {
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('client-1');
      }
      expect(limiter.getRemaining('client-1')).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty key', () => {
      expect(limiter.isAllowed('')).toBe(true);
    });

    it('should handle special characters in key', () => {
      expect(limiter.isAllowed('192.168.1.1:8080')).toBe(true);
      expect(limiter.isAllowed('::1')).toBe(true);
    });

    it('should work with limit of 1', () => {
      const strictLimiter = new RateLimiter(60000, 1);

      expect(strictLimiter.isAllowed('strict-client')).toBe(true);
      expect(strictLimiter.isAllowed('strict-client')).toBe(false);
    });
  });
});
