/**
 * @layer support
 * @description AI 提供者抽象层，支持 OpenAI、Anthropic、Ollama 等
 * 
 * 架构说明：
 * - 这是支持层服务，为核心层和集成层提供 AI 能力
 * - 不依赖特定 AI 系统，通过抽象接口支持多种 AI
 * - 可以被核心层和集成层使用
 * - 参考：docs/ARCHITECTURE.md
 */
export interface AIProviderConfig {
  provider?: 'openai' | 'anthropic' | 'ollama' | 'glm5' | 'openrouter';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface AICompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  complete(
    prompt: string,
    systemPrompt?: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AICompletionResponse>;
  completeJSON<T>(prompt: string, systemPrompt?: string): Promise<T>;
  getModel(): string;
  getProvider(): string;
}

export abstract class BaseAIProvider implements AIProvider {
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  abstract complete(
    prompt: string,
    systemPrompt?: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AICompletionResponse>;

  async completeJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const response = await this.complete(prompt, systemPrompt);
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    throw new Error('No JSON found in response');
  }

  getModel(): string {
    return this.config.model || 'unknown';
  }

  getProvider(): string {
    return this.config.provider || 'unknown';
  }
}
