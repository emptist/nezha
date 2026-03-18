import { execSync, exec } from 'child_process';
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
  private serverUrl: string;

  constructor(config?: AgentConfig) {
    this.timeout = config?.timeout ?? 300000;
    this.maxRetries = config?.maxRetries ?? 3;
    this.retryDelay = config?.retryDelay ?? 1000;
    this.serverUrl = config?.serverUrl ?? 'http://localhost:4096';
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
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

  private runOpenCode(message: string): Promise<AgentResponse> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      try {
        const cmd = `opencode run --attach ${this.serverUrl} --format json "${message.replace(/"/g, '\\"')}"`;
        
        logger.debug(`Running: ${cmd.substring(0, 100)}...`);
        
        const output = execSync(cmd, {
          timeout: 120000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
          shell: '/bin/bash',
        });

        const elapsed = Date.now() - startTime;
        const responseText = this.parseJsonOutput(output);
        
        logger.info(`Task completed in ${elapsed}ms: ${responseText.substring(0, 100)}...`);
        
        resolve({
          success: true,
          message: responseText,
        });
      } catch (error) {
        const elapsed = Date.now() - startTime;
        
        if (error instanceof Error && error.message.includes('timeout')) {
          logger.error(`Task timed out after ${elapsed}ms`);
          resolve({
            success: false,
            message: `Task timed out after 120000ms`,
          });
        } else {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error(`Task failed after ${elapsed}ms: ${errMsg}`);
          resolve({
            success: false,
            message: errMsg,
          });
        }
      }
    });
  }

  private parseJsonOutput(output: string): string {
    const lines = output.trim().split('\n');
    const textParts: string[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'text' && event.part?.text) {
          textParts.push(event.part.text);
        }
      } catch {
        continue;
      }
    }

    return textParts.join('');
  }
}
