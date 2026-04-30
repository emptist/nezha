import { AIProvider, AIProviderConfig } from './AIProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { GLM5Provider } from './GLM5Provider.js';
import { OpenRouterProvider } from './OpenRouterProvider.js';

const DEFAULT_GLM5_URL = 'https://open.bigmodel.cn/api/paas/v4';

export class AIProviderFactory {
  private static instance: AIProvider | null = null;

  static createFromEnv(): AIProvider {
    if (this.instance) {
      return this.instance;
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const zhipuKey = process.env.ZHIPU_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const ollamaEnabled = process.env.OLLAMA_ENABLED === 'true' || process.env.OLLAMA_MODEL;

    let config: AIProviderConfig;

    if (openrouterKey) {
      config = {
        provider: 'openrouter',
        model: process.env.OPENROUTER_MODEL || 'tencent/hy3-preview:free',
        apiKey: openrouterKey,
      };
    } else if (ollamaEnabled && !openaiKey && !anthropicKey && !zhipuKey) {
      config = {
        provider: 'ollama',
        model: process.env.OLLAMA_MODEL || 'mistral:7b',
        baseUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
      };
    } else if (zhipuKey && !openaiKey && !anthropicKey) {
      config = {
        provider: 'glm5',
        model: process.env.ZHIPU_MODEL || 'glm-5',
        apiKey: zhipuKey,
        baseUrl: process.env.ZHIPU_BASE_URL || DEFAULT_GLM5_URL,
      };
    } else if (openaiKey?.startsWith('sk-')) {
      config = {
        provider: 'openai',
        model: process.env.OPENAI_MODEL || 'gpt-4',
        apiKey: openaiKey,
      };
    } else if (anthropicKey?.startsWith('sk-ant-')) {
      config = {
        provider: 'anthropic',
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        apiKey: anthropicKey,
      };
    } else {
      config = {
        provider: 'ollama',
        model: process.env.OLLAMA_MODEL || 'mistral:7b',
        baseUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
      };
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
      case 'ollama':
        return new OllamaProvider(config);
      case 'glm5':
        return new GLM5Provider(config);
      case 'openrouter':
        return new OpenRouterProvider(config);
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
export { OllamaProvider } from './OllamaProvider.js';
export { GLM5Provider } from './GLM5Provider.js';
export { OpenRouterProvider } from './OpenRouterProvider.js';
