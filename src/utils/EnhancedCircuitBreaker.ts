import { logger } from './logger.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenAttempts?: number;
  successThreshold?: number;
  monitoringWindowMs?: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  onFailure?: (error: Error, failureCount: number) => void;
  onSuccess?: () => void;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  totalFailures: number;
  totalSuccesses: number;
  halfOpenAttempts: number;
}

export class EnhancedCircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private halfOpenAttempts: number = 0;
  private lastStateChange: number = Date.now();

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenAttemptsLimit: number;
  private readonly successThreshold: number;
  private readonly monitoringWindowMs: number;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;
  private readonly onFailure?: (error: Error, failureCount: number) => void;
  private readonly onSuccess?: () => void;

  private totalFailures: number = 0;
  private totalSuccesses: number = 0;

  constructor(config?: CircuitBreakerConfig) {
    this.failureThreshold = config?.failureThreshold ?? 3;
    this.resetTimeoutMs = config?.resetTimeoutMs ?? 5 * 60 * 1000;
    this.halfOpenAttemptsLimit = config?.halfOpenAttempts ?? 1;
    this.successThreshold = config?.successThreshold ?? 1;
    this.monitoringWindowMs = config?.monitoringWindowMs ?? 60 * 1000;
    this.onStateChange = config?.onStateChange;
    this.onFailure = config?.onFailure;
    this.onSuccess = config?.onSuccess;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const from = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    logger.info(`Circuit breaker state: ${from} -> ${newState}`);
    this.onStateChange?.(from, newState);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.ensureOpenCircuitReady();

    if (this.state === 'open') {
      throw new CircuitOpenError(
        `Circuit breaker is open. Service unavailable. Will retry in ${this.getTimeUntilRetry()}ms.`
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private ensureOpenCircuitReady(): void {
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.transitionTo('half-open');
      this.halfOpenAttempts = 0;
      this.successCount = 0;
      logger.info('Circuit breaker: entering half-open state, allowing test requests');
    }
  }

  private recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;
    this.successCount++;

    if (this.state === 'half-open') {
      if (this.successCount >= this.successThreshold) {
        this.transitionTo('closed');
        this.failureCount = 0;
        this.successCount = 0;
        logger.info('Circuit breaker: closed (service recovered)');
      }
    } else if (this.state === 'closed') {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }

    this.onSuccess?.();
  }

  private recordFailure(error: Error): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    this.failureCount++;

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenAttemptsLimit) {
        this.transitionTo('open');
        logger.warn(
          `Circuit breaker: half-open test failed. Reopening circuit. Will retry in ${this.getTimeUntilRetry()}ms`
        );
      }
    } else if (this.state === 'closed') {
      if (this.failureCount >= this.failureThreshold) {
        this.transitionTo('open');
        logger.warn(
          `Circuit breaker: opened after ${this.failureCount} consecutive failures. Will retry in ${this.getTimeUntilRetry()}ms`
        );
      }
    } else {
      this.transitionTo('half-open');
    }

    this.onFailure?.(error, this.failureCount);
  }

  getTimeUntilRetry(): number {
    if (this.state !== 'open') return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.resetTimeoutMs - elapsed);
  }

  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailure: this.lastFailureTime > 0 ? this.lastFailureTime : null,
      lastSuccess: this.lastSuccessTime > 0 ? this.lastSuccessTime : null,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      halfOpenAttempts: this.halfOpenAttempts,
    };
  }

  isAvailable(): boolean {
    return this.state !== 'open' || Date.now() - this.lastFailureTime >= this.resetTimeoutMs;
  }

  getAvailabilityPercentage(): number {
    const total = this.totalSuccesses + this.totalFailures;
    if (total === 0) return 100;
    return Math.round((this.totalSuccesses / total) * 100);
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = 0;
    this.lastSuccessTime = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.lastStateChange = Date.now();
    logger.info('Circuit breaker: manually reset');
  }

  forceOpen(): void {
    this.transitionTo('open');
    this.lastFailureTime = Date.now();
  }

  forceClosed(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.successCount = 0;
  }
}

export class CircuitOpenError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'CircuitOpenError';
    this.retryAfterMs = retryAfterMs ?? 0;
  }
}

export class ResilientCircuitBreaker extends EnhancedCircuitBreaker {
  private readonly fallbackFn?: () => Promise<unknown>;

  constructor(config: CircuitBreakerConfig & { fallbackFn?: () => Promise<unknown> }) {
    super({
      ...config,
      onStateChange: config.onStateChange,
    });
    this.fallbackFn = config.fallbackFn;
  }

  async executeWithFallback<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const activeFallback = fallback ?? (this.fallbackFn as (() => Promise<T>) | undefined);

    try {
      return await this.execute(fn);
    } catch (error) {
      if (activeFallback && this.getState().state === 'open') {
        logger.info('Circuit breaker open, executing fallback...');
        return activeFallback();
      }
      throw error;
    }
  }
}
