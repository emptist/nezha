export interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
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
    return this.config.provider;
  }
}
