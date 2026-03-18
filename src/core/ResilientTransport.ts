import {
  HttpTransport,
  CliTransport,
  type TransportMode,
  type StreamingCallback,
  createTransport,
  type TransportConfig,
} from './transports/index.js';
import {
  EnhancedCircuitBreaker,
  type CircuitBreakerConfig,
} from '../utils/EnhancedCircuitBreaker.js';
import { RetryExecutor, type RetryPolicy } from '../utils/RetryExecutor.js';
import {
  categorizeError,
  formatErrorMessage,
  type CategorizedError,
} from '../utils/ErrorClassifier.js';
import { ResponseCache, StaleResponseCache } from '../utils/ResponseCache.js';
import { logger } from '../utils/logger.js';

export interface ResilientTransportConfig {
  primaryMode: TransportMode;
  fallbackMode: TransportMode;
  serverUrl: string;
  timeout: number;
  enableFallback: boolean;
  enableCache: boolean;
  cacheTtlMs: number;
  circuitBreaker?: CircuitBreakerConfig;
  retryPolicy?: Partial<RetryPolicy>;
}

export interface ResilientTransportResponse {
  content: string;
  artifacts: string[];
  fromCache: boolean;
  fallbackUsed: boolean;
  mode: TransportMode;
}

const DEFAULT_CONFIG: Omit<ResilientTransportConfig, 'primaryMode' | 'fallbackMode' | 'serverUrl'> =
  {
    timeout: 600000,
    enableFallback: true,
    enableCache: true,
    cacheTtlMs: 5 * 60 * 1000,
  };

export class ResilientTransport {
  private primaryTransport: HttpTransport | CliTransport;
  private fallbackTransport: HttpTransport | CliTransport;
  private currentMode: TransportMode;
  private circuitBreaker: EnhancedCircuitBreaker;
  private retryExecutor: RetryExecutor;
  private responseCache: ResponseCache<string>;
  private staleCache: StaleResponseCache<string>;
  private config: ResilientTransportConfig;

  constructor(config: ResilientTransportConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.currentMode = this.config.primaryMode;

    this.primaryTransport = createTransport({
      mode: this.config.primaryMode,
      serverUrl: this.config.serverUrl,
      timeout: this.config.timeout,
    });

    this.fallbackTransport = createTransport({
      mode: this.config.fallbackMode,
      serverUrl: this.config.serverUrl,
      timeout: this.config.timeout,
    });

    this.circuitBreaker = new EnhancedCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5 * 60 * 1000,
      halfOpenAttempts: 1,
      ...this.config.circuitBreaker,
      onStateChange: (from, to) => {
        logger.info(`Circuit breaker: ${from} -> ${to}`);
        if (to === 'open' && this.config.enableFallback) {
          logger.info('Switching to fallback transport');
          this.switchMode(this.config.fallbackMode);
        }
      },
      onFailure: (error, count) => {
        logger.warn(`Circuit breaker failure ${count}: ${error.message}`);
      },
    });

    this.retryExecutor = new RetryExecutor(this.config.retryPolicy);
    this.responseCache = new ResponseCache<string>({ ttlMs: this.config.cacheTtlMs });
    this.staleCache = new StaleResponseCache<string>(this.config.cacheTtlMs, 50);
  }

  private switchMode(mode: TransportMode): void {
    if (this.currentMode === mode) return;
    logger.info(`Switching transport mode: ${this.currentMode} -> ${mode}`);
    this.currentMode = mode;
  }

  private getCurrentTransport(): HttpTransport | CliTransport {
    return this.currentMode === this.config.primaryMode
      ? this.primaryTransport
      : this.fallbackTransport;
  }

  private extractArtifacts(content: string): string[] {
    const artifacts: string[] = [];
    const filePattern =
      /(?:file|created|modified|updated):\s*([^\s]+\.(ts|js|json|md|txt|tsx|jsx|yaml|yml))/gi;
    let match;

    while ((match = filePattern.exec(content)) !== null) {
      if (!artifacts.includes(match[1])) {
        artifacts.push(match[1]);
      }
    }

    return artifacts;
  }

  private getCacheKey(message: string): string {
    return `msg_${Buffer.from(message).toString('base64').slice(0, 64)}`;
  }

  async sendMessage(message: string): Promise<ResilientTransportResponse> {
    const cacheKey = this.getCacheKey(message);

    if (this.config.enableCache) {
      const cached = this.responseCache.get([message]);
      if (cached) {
        logger.debug('Returning cached response');
        return {
          content: cached.data,
          artifacts: this.extractArtifacts(cached.data),
          fromCache: true,
          fallbackUsed: false,
          mode: this.currentMode,
        };
      }
    }

    try {
      const result = await this.circuitBreaker.execute(() =>
        this.retryExecutor.execute(() => this.getCurrentTransport().sendMessage(message))
      );

      if (result.success && result.result) {
        const content = result.result;

        if (this.config.enableCache) {
          this.responseCache.set([message], content);
        }
        this.staleCache.set(cacheKey, content);

        return {
          content,
          artifacts: this.extractArtifacts(content),
          fromCache: false,
          fallbackUsed: this.currentMode !== this.config.primaryMode,
          mode: this.currentMode,
        };
      }

      throw result.error ?? new Error('Unknown error');
    } catch (error) {
      const categorized = categorizeError(
        error instanceof Error ? error : new Error(String(error))
      );

      if (this.config.enableFallback && categorized.category !== 'AUTH') {
        const staleResponse = this.staleCache.getStale(cacheKey);
        if (staleResponse) {
          logger.warn('Using stale cached response due to error');
          return {
            content: staleResponse.data,
            artifacts: this.extractArtifacts(staleResponse.data),
            fromCache: false,
            fallbackUsed: true,
            mode: this.currentMode,
          };
        }

        if (this.currentMode !== this.config.fallbackMode) {
          logger.info('Attempting fallback transport');
          this.switchMode(this.config.fallbackMode);

          try {
            const fallbackResult = await this.retryExecutor.execute(() =>
              this.getCurrentTransport().sendMessage(message)
            );

            if (fallbackResult.success && fallbackResult.result) {
              logger.info('Fallback transport succeeded');
              return {
                content: fallbackResult.result,
                artifacts: this.extractArtifacts(fallbackResult.result),
                fromCache: false,
                fallbackUsed: true,
                mode: this.currentMode,
              };
            }
          } catch (fallbackError) {
            logger.error(`Fallback transport also failed: ${fallbackError}`);
            this.switchMode(this.config.primaryMode);
          }
        }
      }

      throw this.createError(error, categorized);
    }
  }

  async sendMessageStreaming(
    message: string,
    onChunk: StreamingCallback
  ): Promise<ResilientTransportResponse> {
    if (this.currentMode !== 'cli') {
      throw new Error('Streaming is only supported in CLI mode');
    }

    try {
      const cliTransport = this.getCurrentTransport() as CliTransport;
      const content = await cliTransport.sendMessageStreaming(message, onChunk);

      return {
        content,
        artifacts: this.extractArtifacts(content),
        fromCache: false,
        fallbackUsed: false,
        mode: this.currentMode,
      };
    } catch (error) {
      const categorized = categorizeError(
        error instanceof Error ? error : new Error(String(error))
      );
      throw this.createError(error, categorized);
    }
  }

  private createError(error: unknown, categorized: CategorizedError): Error {
    const formattedMessage = formatErrorMessage(categorized);
    const enhancedError = new Error(formattedMessage);
    enhancedError.name = `ResilientTransportError:${categorized.category}`;
    return enhancedError;
  }

  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }

  getRetryStats() {
    return {
      policy: this.retryExecutor.getPolicy(),
      history: this.retryExecutor.getAttemptHistory(),
    };
  }

  getCacheStats() {
    return {
      responseCache: this.responseCache.getStats(),
      staleCacheSize: this.staleCache.size(),
    };
  }

  reset(): void {
    this.circuitBreaker.reset();
    this.retryExecutor.reset();
    this.responseCache.clear();
    this.staleCache.clear();
    this.currentMode = this.config.primaryMode;
  }

  clearSession(): void {
    this.primaryTransport.clearSession();
    this.fallbackTransport.clearSession();
  }

  getSessionId(): string | null {
    return this.getCurrentTransport().getSessionId();
  }
}
