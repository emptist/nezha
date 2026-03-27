import { logger } from '../utils/logger.js';

export interface PiTaskResult {
  success: boolean;
  output: string;
  message: string;
  durationMs: number;
  toolsCreated?: string[];
}

export interface PiConfig {
  model?: string;
  cwd?: string;
}

export class PiSDKExecutor {
  private readonly defaultModel: string;
  private readonly cwd: string;

  constructor(config: PiConfig = {}) {
    this.defaultModel = config.model || 'zai:glm-4.5-flash';
    this.cwd = config.cwd || process.cwd();
  }

  async executeWithPrompt(
    systemPrompt: string,
    task: string,
    timeoutMs: number = 600000
  ): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PiSDKExecutor] Executing with system prompt (model: ${this.defaultModel})`);

      const { createAgentSession, DefaultResourceLoader, SessionManager } = await import(
        '@mariozechner/pi-coding-agent'
      );

      const loader = new DefaultResourceLoader({
        systemPromptOverride: () => systemPrompt,
        appendSystemPromptOverride: () => [],
      });
      await loader.reload();

      const { session } = await createAgentSession({
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(),
        cwd: this.cwd,
      });

      let output = '';
      session.subscribe((event: any) => {
        if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
          output += event.assistantMessageEvent.delta;
        }
      });

      await Promise.race([
        session.prompt(task),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      const durationMs = Date.now() - startTime;
      const success = output.length > 0 && !output.toLowerCase().includes('error');

      return {
        success,
        output,
        message: success ? 'Task completed successfully with system prompt' : output.substring(0, 500),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`[PiSDKExecutor] Failed with system prompt: ${errorMessage}`);

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }

  async execute(taskDescription: string, timeoutMs: number = 600000): Promise<PiTaskResult> {
    return this.executeWithPrompt(
      'You are a helpful AI coding assistant.',
      taskDescription,
      timeoutMs
    );
  }
}

let piSDKExecutorInstance: PiSDKExecutor | null = null;

export function getPiSDKExecutor(config?: PiConfig): PiSDKExecutor {
  if (!piSDKExecutorInstance) {
    piSDKExecutorInstance = new PiSDKExecutor(config);
  }
  return piSDKExecutorInstance;
}
