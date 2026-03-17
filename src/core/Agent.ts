import { type AgentResponse } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface AgentConfig {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  serverUrl?: string;
}

export class Agent {
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly serverUrl: string;
  private sessionId: string | null = null;

  constructor(config?: AgentConfig) {
    this.timeout = config?.timeout ?? 300000;
    this.maxRetries = config?.maxRetries ?? 3;
    this.retryDelay = config?.retryDelay ?? 1000;
    this.serverUrl = config?.serverUrl ?? 'http://127.0.0.1:4096';
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    const response = await fetch(`${this.serverUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'nezha-daemon-session' }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { id: string };
    this.sessionId = data.id;
    logger.info(`Created session: ${this.sessionId}`);
    return this.sessionId!;
  }

  async executeTask(message: string): Promise<AgentResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(`Executing task (attempt ${attempt}/${this.maxRetries}): ${message.substring(0, 100)}...`);
        
        const result = await this.runOpenCode(message);
        
        if (result.success) {
          logger.info(`Task completed successfully`);
          return result;
        } else {
          logger.warn(`Task failed: ${result.message}`);
          lastError = new Error(result.message);
          
          if (attempt < this.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            logger.info(`Retrying after ${Math.round(delay)}ms...`);
            await this.sleep(delay);
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`Task execution error: ${lastError.message}`);
        
        if (attempt < this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info(`Retrying after ${Math.round(delay)}ms...`);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      message: `Task failed after ${this.maxRetries} attempts: ${lastError?.message ?? 'Unknown error'}`,
    };
  }

  private async runOpenCode(message: string): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const sessionId = await this.ensureSession();
      
      logger.debug(`Sending message to session ${sessionId}: ${message}`);
      
      const response = await fetch(`${this.serverUrl}/session/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [{ type: 'text', text: message }]
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

    const data = await response.json() as { id?: string; result?: { parts?: Array<{ type: string; text: string }> }; message?: { parts?: Array<{ type: string; text: string }> } };
      const elapsed = Date.now() - startTime;
      
      let responseText = '';
      if (data.result?.parts) {
        responseText = data.result.parts
          .filter((p: { type: string }) => p.type === 'text')
          .map((p: { text: string }) => p.text)
          .join('\n');
      } else if (data.message?.parts) {
        responseText = data.message.parts
          .filter((p: { type: string }) => p.type === 'text')
          .map((p: { text: string }) => p.text)
          .join('\n');
      } else {
        responseText = JSON.stringify(data);
      }

      logger.info(`Task completed in ${elapsed}ms: ${responseText.substring(0, 100)}...`);
      
      return {
        success: true,
        message: responseText,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Task failed after ${elapsed}ms: ${err.message}`);
      
      return {
        success: false,
        message: err.message,
      };
    }
  }
}
