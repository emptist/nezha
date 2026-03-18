// Simple in-memory cache for Nezha

export interface CacheOptions {
  ttlMs?: number;
  maxSize?: number;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheService<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: CacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 60000; // 1 minute default
    this.maxSize = options.maxSize ?? 1000;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (ttlMs !== undefined && (typeof ttlMs !== 'number' || ttlMs <= 0)) {
      throw new Error(`Invalid TTL value: ${ttlMs}. TTL must be a positive number.`);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.ttlMs),
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// Global cache instances
const caches: Map<string, CacheService<unknown>> = new Map();

export function getCache<T>(name: string, options?: CacheOptions): CacheService<T> {
  if (!caches.has(name)) {
    caches.set(name, new CacheService<T>(options));
  }
  return caches.get(name) as CacheService<T>;
}

export function clearAllCaches(): void {
  for (const cache of caches.values()) {
    cache.clear();
  }
}
