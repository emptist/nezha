import {
  createTransport,
  type TransportMode,
  type StreamingCallback as TransportStreamingCallback,
  HttpTransport,
  CliTransport,
} from './transports/index.js';
import { ConversationLogger } from './ConversationLogger.js';
import { logger } from '../utils/logger.js';
import {
  categorizeError,
  formatErrorMessage,
  isRetryableError,
  type CategorizedError,
  ErrorClassifier,
} from '../utils/ErrorClassifier.js';
import { RetryExecutor, DEFAULT_RETRY_POLICY, type RetryPolicy } from '../utils/RetryExecutor.js';
import {
  EnhancedCircuitBreaker,
  CircuitOpenError,
  type CircuitState,
} from '../utils/EnhancedCircuitBreaker.js';
import { ResponseCache, StaleResponseCache } from '../utils/ResponseCache.js';
import {
  createAgentMetrics,
  getMetricsRegistry,
  type TransportHealth,
  type AgentHealth,
} from '../services/MetricsService.js';

export { type StreamingCallback } from './transports/index.js';

const MAX_MESSAGE_LENGTH = 100000;
const MAX_TASK_TITLE_LENGTH = 500;
const MAX_TASK_DESCRIPTION_LENGTH = 5000;

interface AgentMetrics {
  executionTotal: ReturnType<typeof createAgentMetrics>;
  correlationId: string;
}

function sanitizeForLog(input: string, maxLength: number = 200): string {
  const sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
  if (sanitized.length <= maxLength) {
    return sanitized;
  }
  return sanitized.slice(0, maxLength) + '...';
}

function containsSensitivePattern(text: string): boolean {
  const sensitivePatterns = [
    /password["\s]*[:=]["\s]*[^"\s]+/i,
    /api[_-]?key["\s]*[:=]["\s]*[^"\s]+/i,
    /secret["\s]*[:=]["\s]*[^"\s]+/i,
    /token["\s]*[:=]["\s]*[^"\s]+/i,
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
    /-----BEGIN CERTIFICATE-----/,
  ];
  return sensitivePatterns.some(pattern => pattern.test(text));
}

function maskSensitiveData(input: string): string {
  const patterns = [
    { regex: /(password["\s]*[:=]["\s]*)([^"\s]+)/gi, replacement: '$1***' },
    { regex: /(api[_-]?key["\s]*[:=]["\s]*)([^"\s]+)/gi, replacement: '$1***' },
    { regex: /(secret["\s]*[:=]["\s]*)([^"\s]+)/gi, replacement: '$1***' },
    { regex: /(token["\s]*[:=]["\s]*)([^"\s]+)/gi, replacement: '$1***' },
    { regex: /(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi, replacement: '$1***' },
  ];

  let result = input;
  for (const { regex, replacement } of patterns) {
    result = result.replace(regex, replacement);
  }
  return result;
}

function validateInputLength(message: string, maxLength: number): void {
  if (message.length > maxLength) {
    throw new Error(`Input exceeds maximum allowed length of ${maxLength} characters`);
  }
}

function generateCorrelationId(): string {
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export interface UnifiedAgentConfig {
  mode?: TransportMode;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  serverUrl?: string;
  logDir?: string;
  enableLogging?: boolean;
  correlationId?: string;
  fallbackMode?: TransportMode;
  enableFallback?: boolean;
  enableCache?: boolean;
  enableObservability?: boolean;
  cacheTtlMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  retryPolicy?: Partial<RetryPolicy>;
}

export interface AgentTask {
  id?: string;
  title: string;
  description: string;
  context?: string;
}

export interface UnifiedAgentResponse {
  success: boolean;
  message?: string;
  output?: string;
  artifacts?: string[];
  sessionId?: string;
  correlationId?: string;
  durationMs?: number;
  errorCategory?: string;
  fallbackUsed?: boolean;
  fromCache?: boolean;
}

export interface TaskMetrics {
  success: boolean;
  durationMs: number;
  attemptCount: number;
  transportMode: TransportMode;
  correlationId: string;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
}

export interface ResilienceStats {
  circuitBreaker: CircuitState;
  cacheHitRate: number;
  retryCount: number;
  lastError?: CategorizedError;
}

export class UnifiedAgent {
  protected readonly timeout: number;
  protected readonly maxRetries: number;
  protected readonly retryDelay: number;
  protected readonly serverUrl: string;
  protected readonly transportMode: TransportMode;
  private readonly conversationLogger: ConversationLogger | null;
  protected readonly enableLogging: boolean;
  protected transport: HttpTransport | CliTransport;
  protected fallbackTransport: HttpTransport | CliTransport | null = null;
  protected currentMode: TransportMode;

  protected circuitBreaker: EnhancedCircuitBreaker;
  protected retryExecutor: RetryExecutor;
  protected responseCache: ResponseCache<string>;
  protected staleCache: StaleResponseCache<string>;
  protected errorClassifier: ErrorClassifier;

  protected readonly enableFallback: boolean;
  protected readonly enableCache: boolean;
  protected readonly cacheTtlMs: number;

  protected readonly agentMetrics: AgentMetrics;
  protected readonly instanceId: string;
  protected readonly enableObservability: boolean;

  private static readonly healthChecks = new Map<string, () => Promise<boolean>>();

  constructor(config?: UnifiedAgentConfig) {
    this.timeout = config?.timeout ?? 600000;
    this.maxRetries = config?.maxRetries ?? 3;
    this.retryDelay = config?.retryDelay ?? 1000;
    this.serverUrl = config?.serverUrl ?? 'http://localhost:4096';
    this.transportMode = config?.mode ?? 'http';
    this.currentMode = this.transportMode;
    this.enableLogging = config?.enableLogging ?? true;
    this.enableFallback = config?.enableFallback ?? true;
    this.enableCache = config?.enableCache ?? true;
    this.cacheTtlMs = config?.cacheTtlMs ?? 5 * 60 * 1000;
    this.enableObservability = config?.enableObservability ?? true;
    this.instanceId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    if (this.enableLogging) {
      this.conversationLogger = new ConversationLogger(config?.logDir ?? 'conversations');
    } else {
      this.conversationLogger = null;
    }

    this.agentMetrics = {
      executionTotal: createAgentMetrics('nezha_unified_agent'),
      correlationId: config?.correlationId ?? generateCorrelationId(),
    };

    if (this.enableObservability) {
      this.registerHealthCheck();
      this.logStructured('agent_initialized', {
        mode: this.transportMode,
        serverUrl: this.serverUrl,
        timeout: this.timeout,
        enableObservability: this.enableObservability,
        instanceId: this.instanceId,
      });
    }

    this.transport = createTransport({
      mode: this.transportMode,
      serverUrl: this.serverUrl,
      timeout: this.timeout,
    }) as HttpTransport | CliTransport;

    if (this.enableFallback && config?.fallbackMode) {
      this.fallbackTransport = createTransport({
        mode: config.fallbackMode,
        serverUrl: this.serverUrl,
        timeout: this.timeout,
      }) as HttpTransport | CliTransport;
    }

    const circuitBreakerConfig = {
      failureThreshold: config?.circuitBreakerThreshold ?? 3,
      resetTimeoutMs: config?.circuitBreakerResetMs ?? 5 * 60 * 1000,
      halfOpenAttempts: 1,
      onStateChange: (from: CircuitState, to: CircuitState) => {
        logger.info(`Circuit breaker: ${from} -> ${to}`);
        if (to === 'open' && this.enableFallback && this.fallbackTransport) {
          logger.info('Switching to fallback transport due to circuit breaker open');
          this.switchMode(config?.fallbackMode ?? (this.transportMode === 'http' ? 'cli' : 'http'));
        }
      },
      onFailure: (error: Error, count: number) => {
        const categorized = categorizeError(error);
        logger.warn(`Circuit breaker failure ${count} [${categorized.category}]: ${error.message}`);
      },
    };

    this.circuitBreaker = new EnhancedCircuitBreaker(circuitBreakerConfig);

    const retryPolicy: RetryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      maxAttempts: this.maxRetries,
      initialDelayMs: this.retryDelay,
      ...config?.retryPolicy,
    };
    this.retryExecutor = new RetryExecutor(retryPolicy);

    this.responseCache = new ResponseCache<string>({ ttlMs: this.cacheTtlMs });
    this.staleCache = new StaleResponseCache<string>(this.cacheTtlMs, 50);
    this.errorClassifier = new ErrorClassifier();
  }

  private logStructured(event: string, data: Record<string, unknown>): void {
    if (this.enableObservability) {
      logger.info(event, {
        component: 'UnifiedAgent',
        instanceId: this.instanceId,
        transportMode: this.transportMode,
        ...data,
      });
    }
  }

  private registerHealthCheck(): void {
    const checkName = `unified_agent_${this.instanceId}`;
    UnifiedAgent.healthChecks.set(checkName, () => this.checkHealth());
  }

  private async checkHealth(): Promise<boolean> {
    try {
      if (this.transportMode === 'http') {
        const start = Date.now();
        await fetch(`${this.serverUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return Date.now() - start < 5000;
      }
      return true;
    } catch {
      return false;
    }
  }

  async getHealth(): Promise<AgentHealth> {
    const transports: TransportHealth[] = [];
    let serverConnectivity = false;

    try {
      if (this.transportMode === 'http') {
        const start = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(`${this.serverUrl}/health`, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          serverConnectivity = response.ok;
          transports.push({
            mode: 'http',
            healthy: response.ok,
            lastCheck: new Date(),
            latencyMs: Date.now() - start,
          });
        } catch (error) {
          clearTimeout(timeoutId);
          transports.push({
            mode: 'http',
            healthy: false,
            lastCheck: new Date(),
            error: error instanceof Error ? error.message : 'Connection failed',
          });
        }
      } else {
        transports.push({
          mode: 'cli',
          healthy: true,
          lastCheck: new Date(),
        });
      }
    } catch {
      serverConnectivity = false;
    }

    return {
      healthy: serverConnectivity || this.transportMode === 'cli',
      timestamp: new Date(),
      serverConnectivity,
      transports,
    };
  }

  getMetrics(): {
    totalExecutions: number;
    avgDurationMs: number;
    activeConnections: number;
    tokenUsageTotal: number;
  } {
    const execMetrics = this.agentMetrics.executionTotal;
    return {
      totalExecutions: execMetrics.executionTotal.value,
      avgDurationMs:
        execMetrics.executionDurationSeconds.count > 0
          ? (execMetrics.executionDurationSeconds.sum /
              execMetrics.executionDurationSeconds.count) *
            1000
          : 0,
      activeConnections: execMetrics.activeConnections.value,
      tokenUsageTotal: execMetrics.tokenUsage.value,
    };
  }

  exportMetrics(): string {
    return getMetricsRegistry().export();
  }

  getCorrelationId(): string {
    return this.agentMetrics.correlationId;
  }

  private recordTokenUsage(response: string): void {
    if (!this.enableObservability) return;
    const tokenPattern = /token[_\s]?usage[:\s]+(\d+)/gi;
    let match;
    let totalTokens = 0;

    while ((match = tokenPattern.exec(response)) !== null) {
      totalTokens += parseInt(match[1], 10);
    }

    if (totalTokens > 0) {
      this.agentMetrics.executionTotal.tokenUsage.inc(totalTokens);
    }
  }

  private recordDuration(durationMs: number): void {
    if (!this.enableObservability) return;
    this.agentMetrics.executionTotal.executionDurationSeconds.observe(durationMs / 1000);
  }

  private recordExecution(): void {
    if (!this.enableObservability) return;
    this.agentMetrics.executionTotal.executionTotal.inc();
  }

  private switchMode(mode: TransportMode): void {
    if (this.currentMode === mode) return;
    logger.info(`Switching transport mode: ${this.currentMode} -> ${mode}`);
    this.currentMode = mode;
  }

  private getCurrentTransport(): HttpTransport | CliTransport {
    return this.currentMode === this.transportMode
      ? this.transport
      : (this.fallbackTransport ?? this.transport);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  private getCacheKey(message: string): string {
    return `msg_${Buffer.from(message).toString('base64').slice(0, 64)}`;
  }

  async executeTask(message: string): Promise<UnifiedAgentResponse> {
    validateInputLength(message, MAX_MESSAGE_LENGTH);
    return this.executeWithRetry(message);
  }

  async executeStructuredTask(
    task: AgentTask,
    systemPrompt?: string
  ): Promise<UnifiedAgentResponse> {
    if (task.title.length > MAX_TASK_TITLE_LENGTH) {
      throw new Error(`Task title exceeds maximum length of ${MAX_TASK_TITLE_LENGTH}`);
    }
    if (task.description.length > MAX_TASK_DESCRIPTION_LENGTH) {
      throw new Error(`Task description exceeds maximum length of ${MAX_TASK_DESCRIPTION_LENGTH}`);
    }
    const fullPrompt = this.buildStructuredPrompt(task, systemPrompt);
    return this.executeWithRetry(fullPrompt, task);
  }

  async executeTaskStreaming(
    message: string,
    onChunk: TransportStreamingCallback
  ): Promise<UnifiedAgentResponse> {
    if (this.transportMode !== 'cli') {
      throw new Error('Streaming is only supported in CLI mode');
    }

    const cliTransport = this.transport as CliTransport;
    const sessionId = this.conversationLogger?.startConversation(
      { id: crypto.randomUUID(), title: message, description: message },
      'task_execution'
    );

    try {
      this.conversationLogger?.addMessage('user', message);
      const response = await cliTransport.sendMessageStreaming(message, onChunk);
      const artifacts = this.extractArtifacts(response);

      this.conversationLogger?.addMessage('assistant', response);
      await this.conversationLogger?.endConversation({
        success: true,
        output: response,
        artifacts,
      });

      return {
        success: true,
        message: response,
        output: response,
        artifacts,
        sessionId: sessionId || undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const artifacts = this.extractArtifacts(errorMessage);

      await this.conversationLogger?.endConversation({
        success: false,
        output: errorMessage,
        artifacts: [],
      });

      return {
        success: false,
        message: errorMessage,
        output: errorMessage,
        artifacts,
        sessionId: sessionId || undefined,
      };
    }
  }

  protected async executeWithRetry(
    message: string,
    task?: AgentTask
  ): Promise<UnifiedAgentResponse> {
    const startTime = Date.now();
    const sessionId = this.conversationLogger?.startConversation(
      {
        id: task?.id || crypto.randomUUID(),
        title: task?.title || message,
        description: task?.description || message,
      },
      'task_execution'
    );

    try {
      this.conversationLogger?.addMessage('user', message);
    } catch (error) {
      logger.debug('ConversationLogger unavailable:', error);
    }

    const cacheKey = this.getCacheKey(message);
    let fallbackUsed = false;
    let fromCache = false;

    if (this.enableCache) {
      const cached = this.responseCache.get([message]);
      if (cached) {
        logger.info('Returning cached response');
        fromCache = true;
        return {
          success: true,
          message: cached.data,
          output: cached.data,
          artifacts: this.extractArtifacts(cached.data),
          sessionId: this.getCurrentTransport().getSessionId() || sessionId || undefined,
          durationMs: Date.now() - startTime,
          fromCache,
        };
      }
    }

    const sendWithCircuitBreaker = async (): Promise<string> => {
      return this.circuitBreaker.execute(async () => {
        return this.getCurrentTransport().sendMessage(message);
      });
    };

    let lastError: Error | null = null;
    let lastCategorizedError: CategorizedError | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const logMessage = containsSensitivePattern(message)
          ? '[Contains sensitive data]'
          : sanitizeForLog(message, 100);
        logger.info(
          `Executing task (attempt ${attempt}/${this.maxRetries}, mode: ${this.currentMode}): ${logMessage}`
        );

        const result = await sendWithCircuitBreaker();
        const artifacts = this.extractArtifacts(result);

        if (this.enableCache) {
          this.responseCache.set([message], result);
          this.staleCache.set(cacheKey, result);
        }

        try {
          this.conversationLogger?.addMessage('assistant', result);
          await this.conversationLogger?.endConversation({
            success: true,
            output: result,
            artifacts,
          });
        } catch (error) {
          logger.debug('Failed to log conversation:', error);
        }

        logger.info(`Task completed successfully`);

        return {
          success: true,
          message: result,
          output: result,
          artifacts,
          sessionId: this.getCurrentTransport().getSessionId() || sessionId || undefined,
          durationMs: Date.now() - startTime,
          fromCache,
          fallbackUsed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        lastCategorizedError = categorizeError(lastError);
        const sanitizedError = maskSensitiveData(lastError.message);

        if (lastError instanceof CircuitOpenError) {
          logger.warn(`Circuit breaker open: ${lastError.message}`);
        } else {
          logger.error(
            `Task execution error [${lastCategorizedError.category}]: ${sanitizedError}`
          );
        }

        if (lastCategorizedError.category === 'AUTH') {
          logger.error('Authentication error - will not retry');
          break;
        }

        if (lastError.name === 'AbortError') {
          this.getCurrentTransport().clearSession();
        }

        if (lastError.message.includes('session')) {
          this.getCurrentTransport().clearSession();
        }

        if (this.enableFallback && !fallbackUsed && this.fallbackTransport && attempt === 1) {
          const staleResponse = this.staleCache.getStale(cacheKey);
          if (staleResponse) {
            logger.warn('Using stale cached response due to errors');
            fallbackUsed = true;
            return {
              success: true,
              message: staleResponse.data,
              output: staleResponse.data,
              artifacts: this.extractArtifacts(staleResponse.data),
              sessionId: this.getCurrentTransport().getSessionId() || sessionId || undefined,
              durationMs: Date.now() - startTime,
              fromCache: false,
              fallbackUsed: true,
            };
          }

          logger.info('Primary transport failed, attempting fallback');
          this.switchMode(this.transportMode === 'http' ? 'cli' : 'http');
          fallbackUsed = true;
        }

        if (attempt < this.maxRetries && isRetryableError(lastError)) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info(`Retrying after ${Math.round(delay)}ms...`);
          await this.sleep(delay);
        }
      }
    }

    const errorMessage = lastCategorizedError
      ? formatErrorMessage(lastCategorizedError)
      : `Task failed after ${this.maxRetries} attempts: ${lastError ? maskSensitiveData(lastError.message) : 'Unknown error'}`;

    try {
      await this.conversationLogger?.endConversation({
        success: false,
        output: errorMessage,
        artifacts: [],
      });
    } catch (error) {
      logger.debug('Failed to log failed conversation:', error);
    }

    return {
      success: false,
      message: errorMessage,
      output: errorMessage,
      artifacts: [],
      sessionId: this.getCurrentTransport().getSessionId() || sessionId || undefined,
      durationMs: Date.now() - startTime,
      errorCategory: lastCategorizedError?.category,
      fallbackUsed,
    };
  }

  protected buildStructuredPrompt(task: AgentTask, systemPrompt?: string): string {
    const defaultSystem = `You are an AI assistant helping with software development tasks.
You have access to the Nezha system which provides:
- Memory system for storing and retrieving knowledge
- Semantic search for finding relevant past experiences
- Task scheduling and execution
- Conversation logging for learning`;

    const combinedSystem = systemPrompt ? `${defaultSystem}\n\n${systemPrompt}` : defaultSystem;

    return `System: ${combinedSystem}

Task: ${task.title}
Description: ${task.description}
${task.context ? `Context: ${task.context}` : ''}

Please analyze the task and provide a detailed solution.`;
  }

  protected static extractArtifactsStatic(content: string): string[] {
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

  protected extractArtifacts(content: string): string[] {
    return UnifiedAgent.extractArtifactsStatic(content);
  }

  clearSession(): void {
    this.transport.clearSession();
    this.fallbackTransport?.clearSession();
  }

  getSessionId(): string | null {
    return this.getCurrentTransport().getSessionId();
  }

  getResilienceStats(): ResilienceStats {
    return {
      circuitBreaker: this.circuitBreaker.getState().state,
      cacheHitRate: this.responseCache.getStats().hitRate,
      retryCount: this.retryExecutor.getAttemptHistory().length,
      lastError: undefined,
    };
  }

  resetCircuits(): void {
    this.circuitBreaker.reset();
    this.retryExecutor.reset();
    this.responseCache.clear();
    this.staleCache.clear();
    this.currentMode = this.transportMode;
  }
}

export class Agent extends UnifiedAgent {
  constructor(config?: Omit<UnifiedAgentConfig, 'mode'>) {
    super({ ...config, mode: 'http' });
  }

  async executeTask(
    message: string
  ): Promise<{ success: boolean; message?: string; sessionId?: string }> {
    const result = await this.executeWithRetry(message);
    return {
      success: result.success,
      message: result.message,
      sessionId: result.sessionId,
    };
  }
}

export class CliAgent extends UnifiedAgent {
  constructor(config?: Omit<UnifiedAgentConfig, 'mode'>) {
    super({ ...config, mode: 'cli', enableLogging: true });
  }
}
