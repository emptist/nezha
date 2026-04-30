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

export interface InnerProviderResult {
  provider: AIProvider;
  identityId: string;
}

export class AIProviderFactory {
  static async createInnerProvider(db: DatabaseClient): Promise<AIProvider> {
    const apiKeyService = ApiKeyService.getInstance(db);
    const current = await apiKeyService.getCurrentInnerProvider();

    if (!current) {
      throw new Error('[AIProviderFactory] createInnerProvider: no current inner provider configured');
    }

    const config = this.buildInnerConfig(current.provider as ProviderName, current.apiKey, current.model);
    if (!config) {
      throw new Error(`[AIProviderFactory] createInnerProvider: unsupported provider '${current.provider}'`);
    }

    logger.info(`[AIProviderFactory] createInnerProvider: using provider '${config.provider}', model '${config.model}'`);
    return this.create(config);
  }

  static async createInnerProviderWithIdentity(
    db: DatabaseClient,
    identityService: { resolve(inner: boolean, name: string): Promise<{ id: string }> }
  ): Promise<InnerProviderResult> {
    const apiKeyService = ApiKeyService.getInstance(db);
    const current = await apiKeyService.getCurrentInnerProvider();

    if (!current) {
      throw new Error('[AIProviderFactory] createInnerProviderWithIdentity: no current inner provider configured');
    }

    const config = this.buildInnerConfig(current.provider as ProviderName, current.apiKey, current.model);
    if (!config) {
      throw new Error(`[AIProviderFactory] createInnerProviderWithIdentity: unsupported provider '${current.provider}'`);
    }

    logger.info(`[AIProviderFactory] createInnerProviderWithIdentity: using provider '${config.provider}', model '${config.model}'`);
    const aiProvider = this.create(config);
    const identity = await identityService.resolve(true, config.model!);
    return { provider: aiProvider, identityId: identity.id };
  }

  static async createInnerProviderWithFallback(
    db: DatabaseClient,
    provider: ProviderName,
    model: string
  ): Promise<AIProvider> {
    const apiKeyService = ApiKeyService.getInstance(db);
    const current = await apiKeyService.getCurrentInnerProvider();
    const apiKey = current?.apiKey;
    if (!apiKey) {
      throw new Error('[AIProviderFactory] createInnerProviderWithFallback: no API key available');
    }
    const config = this.buildInnerConfig(provider, apiKey, model);
    if (!config) {
      throw new Error(`[AIProviderFactory] createInnerProviderWithFallback: unsupported provider '${provider}'`);
    }

    logger.info(`[AIProviderFactory] createInnerProviderWithFallback: using provider '${provider}', model '${model}'`);
    return this.create(config);
  }

  static buildInnerConfig(provider: ProviderName, apiKey: string, model?: string): AIProviderConfig | null {
    switch (provider) {
      case 'openrouter':
        return {
          provider: 'openrouter',
          model: model || 'tencent/hy3-preview:free',
          apiKey,
        };
      case 'glm5':
      case 'zhipu':
        return {
          provider: 'glm5',
          model: model || 'glm-5',
          apiKey,
          baseUrl: process.env.ZHIPU_BASE_URL || DEFAULT_GLM5_URL,
        };
      case 'openai':
        return {
          provider: 'openai',
          model: model || 'gpt-4',
          apiKey,
        };
      case 'anthropic':
        return {
          provider: 'anthropic',
          model: model || 'claude-sonnet-4-20250514',
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
