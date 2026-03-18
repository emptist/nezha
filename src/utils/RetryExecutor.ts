import { logger } from './logger.js';
import { isRetryableError, type CategorizedError } from './ErrorClassifier.js';

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableErrors?: (error: Error) => boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  retryableErrors: isRetryableError,
};

export interface RetryAttempt {
  attempt: number;
  delay: number;
  error?: Error;
  timestamp: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: RetryAttempt[];
  totalDurationMs: number;
  finalError?: CategorizedError;
}

export class RetryExecutor {
  private policy: RetryPolicy;
  private attemptHistory: RetryAttempt[] = [];

  constructor(policy: Partial<RetryPolicy> = {}) {
    this.policy = {
      maxAttempts: policy.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
      initialDelayMs: policy.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
      maxDelayMs: policy.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
      backoffMultiplier: policy.backoffMultiplier ?? DEFAULT_RETRY_POLICY.backoffMultiplier,
      jitterFactor: policy.jitterFactor ?? DEFAULT_RETRY_POLICY.jitterFactor,
      retryableErrors: policy.retryableErrors ?? DEFAULT_RETRY_POLICY.retryableErrors,
    };
  }

  getPolicy(): Readonly<RetryPolicy> {
    return { ...this.policy };
  }

  updatePolicy(updates: Partial<RetryPolicy>): void {
    this.policy = { ...this.policy, ...updates };
  }

  calculateDelay(attempt: number): number {
    const exponentialDelay =
      this.policy.initialDelayMs * Math.pow(this.policy.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.policy.maxDelayMs);
    const jitter = cappedDelay * this.policy.jitterFactor * Math.random();
    return Math.round(cappedDelay + jitter);
  }

  shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.policy.maxAttempts) {
      return false;
    }
    if (this.policy.retryableErrors) {
      return this.policy.retryableErrors(error);
    }
    return isRetryableError(error);
  }

  async execute<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: RetryAttempt) => void
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    this.attemptHistory = [];

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt++) {
      const attemptStart = Date.now();

      try {
        const result = await fn();
        const duration = Date.now() - attemptStart;

        this.attemptHistory.push({
          attempt,
          delay: duration,
          timestamp: attemptStart,
        });

        return {
          success: true,
          result,
          attempts: [...this.attemptHistory],
          totalDurationMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const duration = Date.now() - attemptStart;

        const attemptRecord: RetryAttempt = {
          attempt,
          delay: duration,
          error: lastError,
          timestamp: attemptStart,
        };
        this.attemptHistory.push(attemptRecord);

        if (!this.shouldRetry(lastError, attempt)) {
          logger.warn(`Non-retryable error on attempt ${attempt}: ${lastError.message}`);
          break;
        }

        if (attempt < this.policy.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          logger.info(`Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`);

          onRetry?.(attemptRecord);

          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: [...this.attemptHistory],
      totalDurationMs: Date.now() - startTime,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAttemptHistory(): ReadonlyArray<RetryAttempt> {
    return [...this.attemptHistory];
  }

  reset(): void {
    this.attemptHistory = [];
  }
}

export const PRESET_POLICIES = {
  fast: {
    maxAttempts: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  } as Partial<RetryPolicy>,

  normal: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
  } as Partial<RetryPolicy>,

  aggressive: {
    maxAttempts: 5,
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 2.5,
    jitterFactor: 0.4,
  } as Partial<RetryPolicy>,

  persistent: {
    maxAttempts: 10,
    initialDelayMs: 5000,
    maxDelayMs: 120000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.2,
  } as Partial<RetryPolicy>,
};

export function createRetryExecutor(preset?: keyof typeof PRESET_POLICIES): RetryExecutor {
  if (preset && PRESET_POLICIES[preset]) {
    return new RetryExecutor(PRESET_POLICIES[preset]);
  }
  return new RetryExecutor();
}
