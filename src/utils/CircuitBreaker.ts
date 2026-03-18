import { logger } from '../utils/logger.js';

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenAttempts?: number;
}

export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private halfOpenAttempts: number = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenAttemptsLimit: number;

  constructor(config?: CircuitBreakerConfig) {
    this.failureThreshold = config?.failureThreshold ?? 3;
    this.resetTimeoutMs = config?.resetTimeoutMs ?? 5 * 60 * 1000; // 5 minutes
    this.halfOpenAttemptsLimit = config?.halfOpenAttempts ?? 1;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half-open';
        this.halfOpenAttempts = 0;
        logger.info('Circuit breaker: entering half-open state');
      } else {
        throw new Error('Circuit breaker is open - service unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      logger.info('Circuit breaker: closed (recovered)');
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenAttemptsLimit) {
        this.state = 'open';
        logger.warn(
          `Circuit breaker: opened after half-open failure (will retry in ${this.resetTimeoutMs / 1000}s)`
        );
      }
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      logger.warn(
        `Circuit breaker: opened after ${this.failureCount} failures (will retry in ${this.resetTimeoutMs / 1000}s)`
      );
    }
  }

  getState(): { state: string; failureCount: number; lastFailure: number | null } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailure: this.lastFailureTime > 0 ? this.lastFailureTime : null,
    };
  }

  isAvailable(): boolean {
    return this.state !== 'open' || Date.now() - this.lastFailureTime >= this.resetTimeoutMs;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = 0;
  }
}
