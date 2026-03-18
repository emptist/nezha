import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseCache, StaleResponseCache } from '../../src/utils/ResponseCache.js';

describe('ResponseCache', () => {
  let cache: ResponseCache<string>;

  beforeEach(() => {
    cache = new ResponseCache<string>({ ttlMs: 1000, maxSize: 10 });
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set(['hello'], 'world');
      const result = cache.get(['hello']);
      expect(result?.data).toBe('world');
    });

    it('should return undefined for non-existent keys', () => {
      const result = cache.get(['nonexistent']);
      expect(result).toBeUndefined();
    });

    it('should track hit count', () => {
      cache.set(['key'], 'value');
      cache.get(['key']);
      cache.get(['key']);
      const result = cache.get(['key']);
      expect(result?.hitCount).toBe(3);
    });
  });

  describe('expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortCache = new ResponseCache<string>({ ttlMs: 50 });
      shortCache.set(['key'], 'value');

      await new Promise(resolve => setTimeout(resolve, 100));
      const result = shortCache.get(['key']);
      expect(result).toBeUndefined();
    });
  });

  describe('invalidation', () => {
    it('should invalidate specific entries', () => {
      cache.set(['key1'], 'value1');
      cache.set(['key2'], 'value2');
      cache.invalidate(['key1']);

      expect(cache.get(['key1'])).toBeUndefined();
      expect(cache.get(['key2'])?.data).toBe('value2');
    });

    it('should clear all entries', () => {
      cache.set(['key1'], 'value1');
      cache.set(['key2'], 'value2');
      cache.clear();

      expect(cache.get(['key1'])).toBeUndefined();
      expect(cache.get(['key2'])).toBeUndefined();
    });
  });

  describe('stats', () => {
    it('should track cache statistics', () => {
      cache.set(['key1'], 'value1');
      cache.get(['key1']);
      cache.get(['missing']);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('key generation', () => {
    it('should generate consistent keys', () => {
      const key1 = cache.generateKey(['message1']);
      const key2 = cache.generateKey(['message1']);
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = cache.generateKey(['message1']);
      const key2 = cache.generateKey(['message2']);
      expect(key1).not.toBe(key2);
    });

    it('should support custom key generator', () => {
      const customCache = new ResponseCache<string>({
        keyGenerator: messages => `custom-${String(messages[0])}`,
      });
      const key = customCache.generateKey(['test']);
      expect(key).toBe('custom-test');
    });
  });
});

describe('StaleResponseCache', () => {
  let cache: StaleResponseCache<string>;

  beforeEach(() => {
    cache = new StaleResponseCache<string>(1000, 10);
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      const result = cache.get('key1');
      expect(result?.data).toBe('value1');
    });

    it('should return undefined for expired entries with get', async () => {
      const shortCache = new StaleResponseCache<string>(50, 10);
      shortCache.set('key', 'value');

      await new Promise(resolve => setTimeout(resolve, 100));
      const result = shortCache.get('key');
      expect(result).toBeUndefined();
    });

    it('should return stale entries with getStale', async () => {
      const shortCache = new StaleResponseCache<string>(50, 10);
      shortCache.set('key', 'value');

      await new Promise(resolve => setTimeout(resolve, 100));
      const result = shortCache.getStale('key');
      expect(result?.data).toBe('value');
    });
  });

  describe('hasFresh', () => {
    it('should return true for fresh entries', () => {
      cache.set('key', 'value');
      expect(cache.hasFresh('key')).toBe(true);
    });

    it('should return false for expired entries', async () => {
      const shortCache = new StaleResponseCache<string>(50, 10);
      shortCache.set('key', 'value');

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(shortCache.hasFresh('key')).toBe(false);
    });
  });

  describe('eviction', () => {
    it('should evict oldest entries when full', () => {
      const smallCache = new StaleResponseCache<string>(1000, 3);
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBeUndefined();
      expect(smallCache.get('key4')?.data).toBe('value4');
    });
  });
});
