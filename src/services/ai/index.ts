import { AIProvider, AIProviderConfig } from './AIProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';

export class AIProviderFactory {
  private static instance: AIProvider | null = null;

  static createFromEnv(): AIProvider {
    if (this.instance) {
      return this.instance;
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

    let config: AIProviderConfig;

    if (apiKey.startsWith('sk-')) {
      config = {
        provider: 'openai',
        model: process.env.OPENAI_MODEL || 'gpt-4',
        apiKey,
      };
    } else if (apiKey.startsWith('sk-ant-')) {
      config = {
        provider: 'anthropic',
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        apiKey,
      };
    } else {
      throw new Error('No valid AI API key found in environment');
    }

    this.instance = this.create(config);
    return this.instance;
  }

  static create(config: AIProviderConfig): AIProvider {
    switch (config.provider) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  static reset(): void {
    this.instance = null;
  }
}

export type { AIProvider, AIProviderConfig, AICompletionResponse } from './AIProvider.js';
export { OpenAIProvider } from './OpenAIProvider.js';
export { AnthropicProvider } from './AnthropicProvider.js';
