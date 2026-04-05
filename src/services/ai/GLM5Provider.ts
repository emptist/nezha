import { BaseAIProvider, AICompletionResponse, AIProviderConfig } from './AIProvider.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

export class GLM5Provider extends BaseAIProvider {
  constructor(config: AIProviderConfig = {}) {
    super({ ...config, provider: 'glm5', model: config.model || 'glm-5' });
  }

  async complete(
    prompt: string,
    systemPrompt?: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AICompletionResponse> {
    const apiKey = config?.apiKey || this.config.apiKey || process.env.ZHIPU_API_KEY;
    const model = config?.model || this.config.model || 'glm-5';
    const baseUrl = config?.baseUrl || this.config.baseUrl || DEFAULT_BASE_URL;

    if (!apiKey) {
      throw new Error('GLM-5 API key not set. Set ZHIPU_API_KEY environment variable.');
    }

    logger.info(`[GLM5] Chat completion (model: ${model})`);

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error(`[GLM5] API error ${response.status}: ${errorText.substring(0, 300)}`);
      throw new Error(`GLM-5 API error (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message?: { content: string | null };
        finish_reason: string | null;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model: string;
    };

    const choice = data.choices[0];
    if (!choice) {
      throw new Error('GLM-5 returned no choices');
    }

    return {
      content: choice.message?.content || '',
      model: data.model || model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}
