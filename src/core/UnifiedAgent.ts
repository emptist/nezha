import {
  createTransport,
  type TransportMode,
  type StreamingCallback,
  HttpTransport,
  CliTransport,
} from './transports/index.js';
import { ConversationLogger } from './ConversationLogger.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration options for UnifiedAgent.
 */
export interface UnifiedAgentConfig {
  /** Transport mode: 'http' (default) or 'cli' */
  mode?: TransportMode;
  /** Request timeout in milliseconds (default: 600000 = 10 minutes) */
  timeout?: number;
  /** Maximum retry attempts on failure (default: 3) */
  maxRetries?: number;
  /** Initial delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** OpenCode server URL (default: 'http://localhost:4096') */
  serverUrl?: string;
  /** Directory for conversation logs (default: 'conversations') */
  logDir?: string;
  /** Enable conversation logging (default: true) */
  enableLogging?: boolean;
}

/**
 * Structured task representation for detailed task execution.
 */
export interface AgentTask {
  /** Optional unique task identifier */
  id?: string;
  /** Task title/summary */
  title: string;
  /** Detailed task description */
  description: string;
  /** Additional context information */
  context?: string;
}

/**
 * Response from UnifiedAgent task execution.
 */
export interface UnifiedAgentResponse {
  /** Whether the task completed successfully */
  success: boolean;
  /** Response message or error description */
  message?: string;
  /** Full output content */
  output?: string;
  /** List of file artifacts mentioned in the response */
  artifacts?: string[];
  /** Session identifier for the conversation */
  sessionId?: string;
}

/**
 * UnifiedAgent provides transport-agnostic task execution with retry logic,
 * conversation logging, and support for both HTTP and CLI modes.
 *
 * @example
 * ```typescript
 * // HTTP mode (default)
 * const agent = new Agent();
 * const result = await agent.executeTask('Fix the bug');
 *
 * // CLI mode with streaming
 * const cliAgent = new CliAgent();
 * await cliAgent.executeTaskStreaming('Deploy', (chunk, type) => {
 *   console.log(`[${type}]`, chunk);
 * });
 * ```
 */
export class UnifiedAgent {
  protected readonly timeout: number;
  protected readonly maxRetries: number;
  protected readonly retryDelay: number;
  protected readonly serverUrl: string;
  protected readonly transportMode: TransportMode;
  private readonly conversationLogger: ConversationLogger | null;
  protected readonly enableLogging: boolean;
  protected transport: HttpTransport | CliTransport;

  /**
   * Creates a new UnifiedAgent instance.
   * @param config - Optional configuration object
   */
  constructor(config?: UnifiedAgentConfig) {
    this.timeout = config?.timeout ?? 600000;
    this.maxRetries = config?.maxRetries ?? 3;
    this.retryDelay = config?.retryDelay ?? 1000;
    this.serverUrl = config?.serverUrl ?? 'http://localhost:4096';
    this.transportMode = config?.mode ?? 'http';
    this.enableLogging = config?.enableLogging ?? true;

    if (this.enableLogging) {
      this.conversationLogger = new ConversationLogger(config?.logDir ?? 'conversations');
    } else {
      this.conversationLogger = null;
    }

    this.transport = createTransport({
      mode: this.transportMode,
      serverUrl: this.serverUrl,
      timeout: this.timeout,
    }) as HttpTransport | CliTransport;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculates retry delay with exponential backoff and jitter.
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  public calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  /**
   * Executes a simple task with automatic retry and logging.
   * @param message - The task prompt/message
   * @returns UnifiedAgentResponse with success status and output
   */
  async executeTask(message: string): Promise<UnifiedAgentResponse> {
    return this.executeWithRetry(message);
  }

  /**
   * Executes a structured task with metadata and optional custom system prompt.
   * @param task - The structured task definition
   * @param systemPrompt - Optional custom system prompt to prepend
   * @returns UnifiedAgentResponse with success status and output
   */
  async executeStructuredTask(
    task: AgentTask,
    systemPrompt?: string
  ): Promise<UnifiedAgentResponse> {
    const fullPrompt = this.buildStructuredPrompt(task, systemPrompt);
    return this.executeWithRetry(fullPrompt, task);
  }

  /**
   * Executes a task with streaming response callback.
   * Only available in CLI mode. Throws error if used with HTTP transport.
   * @param message - The task prompt/message
   * @param onChunk - Callback for each streaming chunk (text, thinking, or error)
   * @returns UnifiedAgentResponse with success status and complete output
   * @throws Error if transport mode is not 'cli'
   */
  async executeTaskStreaming(
    message: string,
    onChunk: StreamingCallback
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

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(
          `Executing task (attempt ${attempt}/${this.maxRetries}): ${message.substring(0, 100)}...`
        );

        const result = await this.transport.sendMessage(message);
        const artifacts = this.extractArtifacts(result);

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
          sessionId: this.transport.getSessionId() || sessionId || undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`Task execution error: ${lastError.message}`);

        if (lastError.name === 'AbortError') {
          this.transport.clearSession();
        }

        if (lastError.message.includes('session')) {
          this.transport.clearSession();
        }

        if (attempt < this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info(`Retrying after ${Math.round(delay)}ms...`);
          await this.sleep(delay);
        }
      }
    }

    const errorMessage = `Task failed after ${this.maxRetries} attempts: ${lastError?.message ?? 'Unknown error'}`;

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
      sessionId: this.transport.getSessionId() || sessionId || undefined,
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
  }

  getSessionId(): string | null {
    return this.transport.getSessionId();
  }
}

export class Agent extends UnifiedAgent {
  constructor(config?: {
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    serverUrl?: string;
  }) {
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
