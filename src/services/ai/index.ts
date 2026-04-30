import { AIProvider, AIProviderConfig } from './AIProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { GLM5Provider } from './GLM5Provider.js';
import { OpenRouterProvider } from './OpenRouterProvider.js';
import { ApiKeyService } from '../ApiKeyService.js';
import type { DatabaseClient } from '../../db/DatabaseClient.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_GLM5_URL = 'https://open.bigmodel.cn/api/paas/v4';

type ProviderName = 'openrouter' | 'glm5' | 'zhipu' | 'openai' | 'anthropic';

const INNER_PROVIDER_PRIORITY: ProviderName[] = ['openrouter', 'glm5', 'zhipu', 'openai', 'anthropic'];

export class AIProviderFactory {
  static async createInnerProvider(db: DatabaseClient): Promise<AIProvider> {
    const apiKeyService = ApiKeyService.getInstance(db);
    const providers = await apiKeyService.listProviders();

    for (const provider of INNER_PROVIDER_PRIORITY) {
      if (!providers.includes(provider)) continue;

      const apiKey = await apiKeyService.getApiKey(provider);
      if (!apiKey) continue;

      const config = this.buildInnerConfig(provider, apiKey);
      if (config) {
        logger.info(`[AIProviderFactory] createInnerProvider: using provider '${config.provider}' from database`);
        return this.create(config);
      }
    }

    throw new Error('[AIProviderFactory] createInnerProvider: no API keys found in database');
  }

  private static buildInnerConfig(provider: ProviderName, apiKey: string): AIProviderConfig | null {
    switch (provider) {
      case 'openrouter':
        return {
          provider: 'openrouter',
          model: process.env.OPENROUTER_MODEL || 'tencent/hy3-preview:free',
          apiKey,
        };
      case 'glm5':
      case 'zhipu':
        return {
          provider: 'glm5',
          model: process.env.ZHIPU_MODEL || 'glm-5',
          apiKey,
          baseUrl: process.env.ZHIPU_BASE_URL || DEFAULT_GLM5_URL,
        };
      case 'openai':
        return {
          provider: 'openai',
          model: process.env.OPENAI_MODEL || 'gpt-4',
          apiKey,
        };
      case 'anthropic':
        return {
          provider: 'anthropic',
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          apiKey,
        };
      default:
        return null;
    }
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
}

export type { AIProvider, AIProviderConfig, AICompletionResponse } from './AIProvider.js';
export { OpenAIProvider } from './OpenAIProvider.js';
export { AnthropicProvider } from './AnthropicProvider.js';
export { OllamaProvider } from './OllamaProvider.js';
export { GLM5Provider } from './GLM5Provider.js';
export { OpenRouterProvider } from './OpenRouterProvider.js';
