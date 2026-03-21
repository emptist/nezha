import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheService, getCache, clearAllCaches } from '../../src/services/CacheService.js';

describe('CacheService', () => {
  let cache: CacheService<string>;

  describe('constructor', () => {
    it('should use default options', () => {
      const cache = new CacheService<string>();
      expect(cache).toBeDefined();
    });

    it('should accept custom TTL', () => {
      const cache = new CacheService<string>({ ttlMs: 5000 });
      cache.set('key', 'value', 5000);
      expect(cache.get('key')).toBe('value');
    });

    it('should accept custom max size', () => {
      const cache = new CacheService<string>({ maxSize: 5 });
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      expect(cache.stats().size).toBe(5);
    });
  });

  describe('set', () => {
    it('should store a value', () => {
      cache = new CacheService<string>();
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('should overwrite existing value', () => {
      cache = new CacheService<string>();
      cache.set('key', 'value1');
      cache.set('key', 'value2');
      expect(cache.get('key')).toBe('value2');
    });

    it('should throw on invalid TTL', () => {
      cache = new CacheService<string>();
      expect(() => cache.set('key', 'value', -1)).toThrow('Invalid TTL value');
      expect(() => cache.set('key', 'value', 0)).toThrow('Invalid TTL value');
    });

    it('should not throw on NaN TTL (treated as undefined)', () => {
      cache = new CacheService<string>();
      expect(() => cache.set('key', 'value', NaN)).not.toThrow();
      expect(cache.get('key')).toBe('value');
    });

    it('should not throw on undefined TTL', () => {
      cache = new CacheService<string>();
      expect(() => cache.set('key', 'value', undefined)).not.toThrow();
    });

    it('should not throw on valid custom TTL', () => {
      cache = new CacheService<string>();
      expect(() => cache.set('key', 'value', 1000)).not.toThrow();
    });
  });

  describe('get', () => {
    beforeEach(() => {
      cache = new CacheService<string>({ ttlMs: 100 });
    });

    it('should return stored value', () => {
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('should return undefined for missing key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should return undefined for expired entry', async () => {
      cache.set('key', 'value', 10);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(cache.get('key')).toBeUndefined();
    });

    it('should track misses', () => {
      cache.get('nonexistent');
      expect(cache.stats().misses).toBe(1);
    });

    it('should track hits', () => {
      cache.set('key', 'value');
      cache.get('key');
      expect(cache.stats().hits).toBe(1);
    });
  });

  describe('has', () => {
    beforeEach(() => {
      cache = new CacheService<string>({ ttlMs: 100 });
    });

    it('should return true for existing key', () => {
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired key', async () => {
      cache.set('key', 'value', 10);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(cache.has('key')).toBe(false);
    });

    it('should clean up expired entry on has()', async () => {
      cache.set('key', 'value', 10);
      await new Promise(resolve => setTimeout(resolve, 20));
      cache.has('key');
      expect(cache.get('key')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete existing key', () => {
      cache = new CacheService<string>();
      cache.set('key', 'value');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeUndefined();
    });

    it('should return false for missing key', () => {
      cache = new CacheService<string>();
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache = new CacheService<string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should reset hit/miss counters', () => {
      cache = new CacheService<string>();
      cache.set('key', 'value');
      cache.get('key');
      cache.get('nonexistent');
      cache.clear();
      const stats = cache.stats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      cache = new CacheService<string>({ ttlMs: 100 });
      cache.set('key1', 'value1', 10);
      cache.set('key2', 'value2', 10000);
      await new Promise(resolve => setTimeout(resolve, 20));
      const cleaned = cache.cleanup();
      expect(cleaned).toBe(1);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should return 0 when no expired entries', () => {
      cache = new CacheService<string>({ ttlMs: 10000 });
      cache.set('key', 'value');
      expect(cache.cleanup()).toBe(0);
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      cache = new CacheService<string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1');
      cache.get('key1');
      cache.get('nonexistent');

      const stats = cache.stats();
      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(2 / 3);
    });

    it('should return 0 hit rate when no requests', () => {
      cache = new CacheService<string>();
      expect(cache.stats().hitRate).toBe(0);
    });
  });

  describe('max size eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      cache = new CacheService<string>({ maxSize: 3 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key4')).toBe('value4');
      expect(cache.stats().size).toBe(3);
    });

    it('should evict first entry when cache is at capacity with new key', () => {
      cache = new CacheService<string>({ maxSize: 2 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.stats().size).toBe(2);
    });

    it('should not evict when updating existing key', () => {
      cache = new CacheService<string>({ maxSize: 2 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key1', 'value1-updated');

      expect(cache.get('key1')).toBe('value1-updated');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.stats().size).toBe(2);
    });
  });

  describe('custom TTL per entry', () => {
    it('should use custom TTL for specific entry', async () => {
      cache = new CacheService<string>({ ttlMs: 5000 });
      cache.set('short', 'value', 10);
      cache.set('long', 'value', 10000);

      await new Promise(resolve => setTimeout(resolve, 20));
      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value');
    });
  });

  describe('type safety', () => {
    it('should work with different types', () => {
      const numberCache = new CacheService<number>();
      numberCache.set('count', 42);
      expect(numberCache.get('count')).toBe(42);

      const objectCache = new CacheService<{ name: string }>();
      objectCache.set('obj', { name: 'test' });
      expect(objectCache.get('obj')).toEqual({ name: 'test' });

      const arrayCache = new CacheService<string[]>();
      arrayCache.set('arr', ['a', 'b', 'c']);
      expect(arrayCache.get('arr')).toEqual(['a', 'b', 'c']);
    });
  });
});

describe('Global cache functions', () => {
  afterEach(() => {
    clearAllCaches();
  });

  describe('getCache', () => {
    it('should return same cache for same name', () => {
      const cache1 = getCache<string>('test');
      const cache2 = getCache<string>('test');
      expect(cache1).toBe(cache2);
    });

    it('should return different caches for different names', () => {
      const cache1 = getCache<string>('cache1');
      const cache2 = getCache<string>('cache2');
      expect(cache1).not.toBe(cache2);
    });

    it('should accept cache options', () => {
      const cache = getCache<string>('custom', { ttlMs: 5000, maxSize: 100 });
      cache.set('key', 'value', 5000);
      expect(cache.get('key')).toBe('value');
    });

    it('should use provided options on first creation only', () => {
      const cache1 = getCache<string>('singleton', { ttlMs: 5000 });
      const cache2 = getCache<string>('singleton', { ttlMs: 1000 });
      expect(cache1).toBe(cache2);
    });
  });

  describe('clearAllCaches', () => {
    it('should clear all named caches', () => {
      getCache('cache1').set('key', 'value1');
      getCache('cache2').set('key', 'value2');
      getCache('cache3').set('key', 'value3');

      clearAllCaches();

      expect(getCache('cache1').get('key')).toBeUndefined();
      expect(getCache('cache2').get('key')).toBeUndefined();
      expect(getCache('cache3').get('key')).toBeUndefined();
    });
  });
});
