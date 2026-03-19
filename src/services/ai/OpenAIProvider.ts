import { BaseAIProvider, AICompletionResponse, AIProviderConfig } from './AIProvider.js';

export class OpenAIProvider extends BaseAIProvider {
  constructor(config: AIProviderConfig) {
    super({ ...config, provider: 'openai' });
  }

  async complete(
    prompt: string,
    systemPrompt?: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AICompletionResponse> {
    const apiKey = config?.apiKey || this.config.apiKey || process.env.OPENAI_API_KEY;
    const model = config?.model || this.config.model || 'gpt-4';
    const baseUrl = config?.baseUrl || this.config.baseUrl || 'https://api.openai.com/v1';

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
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    return {
      content: data.choices[0]?.message?.content || '',
      model,
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
