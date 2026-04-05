import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';

export interface PiTaskResult {
  success: boolean;
  output: string;
  message: string;
  durationMs: number;
  toolsCreated?: string[];
}

export interface PiConfig {
  piPath?: string;
  model?: string;
  env?: Record<string, string>;
}

function execSafe(
  command: string,
  args: string[],
  options: { timeout: number; env: Record<string, string> },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      timeout: options.timeout,
      env: options.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Pi execution timeout after ${options.timeout}ms`));
    }, options.timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || code === null) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

function mergeEnv(overrides?: Record<string, string>): Record<string, string> {
  const base = { ...process.env };
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) base[k] = v;
    }
  }
  return base as Record<string, string>;
}

export class PiExecutor {
  private readonly piPath: string;
  private readonly defaultModel: string;
  private readonly env: Record<string, string>;

  constructor(config: PiConfig = {}) {
    this.piPath = config.piPath || 'pi';
    this.defaultModel = config.model || 'zhipu/glm-5';
    this.env = config.env || {};
  }

  async execute(taskDescription: string, timeoutMs: number = 600000): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PiExecutor] Executing task (model: ${this.defaultModel})`);

      const { stdout, stderr } = await execSafe(
        this.piPath,
        ['execute', '--model', this.defaultModel, '--print', taskDescription],
        { timeout: timeoutMs, env: mergeEnv(this.env) },
      );

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success =
        !output.toLowerCase().includes('error') && !output.toLowerCase().includes('failed');

      return {
        success,
        output,
        message: success ? 'Task completed successfully' : output.substring(0, 500),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`[PiExecutor] Failed: ${errorMessage}`);

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }

  async executeJson(taskDescription: string, timeoutMs: number = 600000): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PiExecutor] Executing JSON task (model: ${this.defaultModel})`);

      const { stdout, stderr } = await execSafe(
        this.piPath,
        ['execute', '--model', this.defaultModel, '--mode', 'json', taskDescription],
        { timeout: timeoutMs, env: mergeEnv(this.env) },
      );

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success = !output.toLowerCase().includes('error');

      const toolsCreated = this.extractToolsCreated(output);

      return {
        success,
        output,
        message: success ? 'Task completed' : 'Task failed',
        durationMs,
        toolsCreated,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }

  private extractToolsCreated(output: string): string[] {
    const tools: string[] = [];
    const toolPattern = /(?:created|registered|new tool):?\s*(\w+)/gi;
    let match;
    while ((match = toolPattern.exec(output)) !== null) {
      if (match[1]) tools.push(match[1]);
    }
    return tools;
  }

  async executeWithPrompt(
    systemPrompt: string,
    task: string,
    timeoutMs: number = 600000
  ): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PiExecutor] Executing with system prompt (model: ${this.defaultModel})`);

      const { stdout, stderr } = await execSafe(
        this.piPath,
        ['--system-prompt', systemPrompt, '--print', task],
        { timeout: timeoutMs, env: mergeEnv(this.env) },
      );

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success =
        !output.toLowerCase().includes('error') && !output.toLowerCase().includes('failed');

      return {
        success,
        output,
        message: success ? 'Task completed successfully with system prompt' : output.substring(0, 500),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`[PiExecutor] Failed with system prompt: ${errorMessage}`);

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }
}

let piExecutorInstance: PiExecutor | null = null;

export function getPiExecutor(config?: PiConfig): PiExecutor {
  if (!piExecutorInstance) {
    piExecutorInstance = new PiExecutor(config);
  }
  return piExecutorInstance;
}
