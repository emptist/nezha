import { CacheService } from '../services/CacheService.js';

export interface ResponseCacheConfig {
  ttlMs?: number;
  maxSize?: number;
  enableCompression?: boolean;
  keyGenerator?: (messages: unknown[], options?: unknown) => string;
}

export interface CachedResponse<T> {
  data: T;
  timestamp: number;
  hitCount: number;
  key: string;
}

export class ResponseCache<T> {
  private cache: CacheService<CachedResponse<T>>;
  private keyGenerator: (messages: unknown[], options?: unknown) => string;
  private enableCompression: boolean;

  constructor(config?: ResponseCacheConfig) {
    this.cache = new CacheService<CachedResponse<T>>({
      ttlMs: config?.ttlMs ?? 5 * 60 * 1000,
      maxSize: config?.maxSize ?? 100,
    });
    this.enableCompression = config?.enableCompression ?? false;
    this.keyGenerator =
      config?.keyGenerator ??
      ((messages: unknown[], options?: unknown) => {
        const msgStr = JSON.stringify(messages);
        const optStr = options ? JSON.stringify(options) : '';
        return `response_${this.hashString(msgStr + optStr)}`;
      });
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  generateKey(messages: unknown[], options?: unknown): string {
    return this.keyGenerator(messages, options);
  }

  get(messages: unknown[], options?: unknown): CachedResponse<T> | undefined {
    const key = this.generateKey(messages, options);
    const cached = this.cache.get(key);

    if (cached) {
      cached.hitCount++;
      return cached;
    }

    return undefined;
  }

  set(messages: unknown[], response: T, options?: unknown): void {
    const key = this.generateKey(messages, options);
    this.cache.set(
      key,
      {
        data: response,
        timestamp: Date.now(),
        hitCount: 0,
        key,
      },
      options && typeof options === 'object' && 'ttlMs' in options
        ? (options as { ttlMs: number }).ttlMs
        : undefined
    );
  }

  has(messages: unknown[], options?: unknown): boolean {
    const key = this.generateKey(messages, options);
    return this.cache.has(key);
  }

  invalidate(messages: unknown[], options?: unknown): boolean {
    const key = this.generateKey(messages, options);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    return this.cache.stats();
  }
}

export class StaleResponseCache<T> {
  private cache: Map<string, CachedResponse<T>> = new Map();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(ttlMs = 5 * 60 * 1000, maxSize = 100) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  set(key: string, response: T): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.findOldestKey();
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data: response,
      timestamp: Date.now(),
      hitCount: 0,
      key,
    });
  }

  get(key: string): CachedResponse<T> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    entry.hitCount++;
    return entry;
  }

  getStale(key: string): CachedResponse<T> | undefined {
    return this.cache.get(key);
  }

  hasFresh(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return Date.now() - entry.timestamp <= this.ttlMs;
  }

  clear(): void {
    this.cache.clear();
  }

  private findOldestKey(): string | undefined {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  size(): number {
    return this.cache.size;
  }
}
