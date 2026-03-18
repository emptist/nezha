import {
  createTransport,
  type TransportMode,
  type TransportResponse,
  type StreamingCallback,
  type SessionManager,
  HttpTransport,
  CliTransport,
} from './transports/index.js';
import { ConversationLogger } from './ConversationLogger.js';
import { logger } from '../utils/logger.js';

export interface UnifiedAgentConfig {
  mode?: TransportMode;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  serverUrl?: string;
  logDir?: string;
  enableLogging?: boolean;
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
}

export class UnifiedAgent {
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly serverUrl: string;
  private readonly transportMode: TransportMode;
  private readonly conversationLogger: ConversationLogger | null;
  private readonly enableLogging: boolean;
  private transport: ReturnType<typeof createTransport>;
  private sessionManager: SessionManager;

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
    });

    this.sessionManager = this.transport as unknown as SessionManager;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  async executeTask(message: string): Promise<UnifiedAgentResponse> {
    return this.executeWithRetry(message);
  }

  async executeStructuredTask(
    task: AgentTask,
    systemPrompt?: string
  ): Promise<UnifiedAgentResponse> {
    const fullPrompt = this.buildStructuredPrompt(task, systemPrompt);
    return this.executeWithRetry(fullPrompt, task);
  }

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
      this.conversationLogger?.endConversation({
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

      this.conversationLogger?.endConversation({
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

  private async executeWithRetry(message: string, task?: AgentTask): Promise<UnifiedAgentResponse> {
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
    } catch {
      // ConversationLogger not initialized
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
          this.conversationLogger?.endConversation({
            success: true,
            output: result,
            artifacts,
          });
        } catch {
          // ConversationLogger not initialized
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
          this.sessionManager.clearSession();
        }

        if (lastError.message.includes('session')) {
          this.sessionManager.clearSession();
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
      this.conversationLogger?.endConversation({
        success: false,
        output: errorMessage,
        artifacts: [],
      });
    } catch {
      // ConversationLogger not initialized
    }

    return {
      success: false,
      message: errorMessage,
      output: errorMessage,
      artifacts: [],
      sessionId: this.transport.getSessionId() || sessionId || undefined,
    };
  }

  private buildStructuredPrompt(task: AgentTask, systemPrompt?: string): string {
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

  clearSession(): void {
    this.sessionManager.clearSession();
  }

  getSessionId(): string | null {
    return this.sessionManager.getSessionId();
  }
}

export class Agent {
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly serverUrl: string;
  private sessionId: string | null = null;
  private readonly conversationLogger: ConversationLogger;
  private transport: HttpTransport;

  constructor(config?: {
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    serverUrl?: string;
  }) {
    this.timeout = config?.timeout ?? 600000;
    this.maxRetries = config?.maxRetries ?? 3;
    this.retryDelay = config?.retryDelay ?? 1000;
    this.serverUrl = config?.serverUrl ?? 'http://localhost:4096';
    this.conversationLogger = new ConversationLogger('conversations');
    this.transport = new HttpTransport(this.serverUrl, this.timeout);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  async executeTask(
    message: string
  ): Promise<{ success: boolean; message?: string; sessionId?: string }> {
    const sessionId = this.conversationLogger.startConversation(
      { id: crypto.randomUUID(), title: message, description: message },
      'task_execution'
    );

    this.conversationLogger.addMessage('user', message);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(
          `Executing task (attempt ${attempt}/${this.maxRetries}): ${message.substring(0, 100)}...`
        );

        if (!this.transport.getSessionId()) {
          await this.transport.createSession();
        }

        const result = await this.transport.sendMessage(message);
        const artifacts = this.extractArtifacts(result);

        this.conversationLogger.addMessage('assistant', result);
        this.conversationLogger.endConversation({
          success: true,
          output: result,
          artifacts,
        });

        logger.info(`Task completed successfully`);

        return {
          success: true,
          message: result,
          sessionId: this.transport.getSessionId() || undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`Task execution error: ${lastError.message}`);

        if (lastError.name === 'AbortError') {
          this.transport.clearSession();
          return {
            success: false,
            message: `Task timed out after ${this.timeout}ms`,
            sessionId: undefined,
          };
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

    this.conversationLogger.endConversation({
      success: false,
      output: errorMessage,
      artifacts: [],
    });

    return {
      success: false,
      message: errorMessage,
      sessionId: undefined,
    };
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
}

export class CliAgent extends UnifiedAgent {
  constructor(config?: Omit<UnifiedAgentConfig, 'mode'>) {
    super({ ...config, mode: 'cli', enableLogging: true });
  }
}
