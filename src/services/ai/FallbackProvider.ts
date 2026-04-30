import { AIProvider, AIProviderConfig, AICompletionResponse } from './AIProvider.js';
import { AIProviderFactory } from '../ai/index.js';
import { logger } from '../../utils/logger.js';

const FALLBACK_PROVIDER = 'openrouter' as const;
const FALLBACK_MODEL = 'llama3.2:3b';

export class FallbackProvider implements AIProvider {
  private primary: AIProvider;
  private db: any;
  private isFallbackAttempted = false;

  constructor(primary: AIProvider, db: any) {
    this.primary = primary;
    this.db = db;
  }

  async complete(
    prompt: string,
    systemPrompt?: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AICompletionResponse> {
    try {
      return await this.primary.complete(prompt, systemPrompt, config);
    } catch (error) {
      if (!this.isRetryableError(error)) {
        throw error;
      }

      logger.warn(`[FallbackProvider] Primary provider failed (${this.primary.getProvider()}/${this.primary.getModel()}), trying fallback model '${FALLBACK_MODEL}'`);

      try {
        const fallbackProvider = await AIProviderFactory.createInnerProviderWithFallback(this.db, FALLBACK_PROVIDER, FALLBACK_MODEL);
        this.isFallbackAttempted = true;
        return await fallbackProvider.complete(prompt, systemPrompt, config);
      } catch (fallbackError) {
        logger.error(`[FallbackProvider] Fallback also failed: ${fallbackError}`);
        throw error;
      }
    }
  }

  async completeJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const response = await this.complete(prompt, systemPrompt);
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    throw new Error('No JSON found in response');
  }

  getModel(): string {
    return this.isFallbackAttempted ? FALLBACK_MODEL : this.primary.getModel();
  }

  getProvider(): string {
    return this.isFallbackAttempted ? FALLBACK_PROVIDER : this.primary.getProvider();
  }

  private isRetryableError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    const is429 = error?.status === 429 || message.includes('rate limit') || message.includes('too many requests');
    const isOutOfTokens = error?.status === 403 || message.includes('out of credits') || message.includes('quota') || message.includes('token limit') || message.includes('insufficient');
    const isModelUnavailable = error?.status === 404 || message.includes('model not found') || message.includes('not found');
    return is429 || isOutOfTokens || isModelUnavailable;
  }
}
