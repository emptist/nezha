import { BaseAIProvider, AICompletionResponse, AIProviderConfig } from './AIProvider.js';

export class AnthropicProvider extends BaseAIProvider {
  constructor(config: AIProviderConfig) {
    super({ ...config, provider: 'anthropic' });
  }

  async complete(
    prompt: string,
    systemPrompt?: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AICompletionResponse> {
    const apiKey = config?.apiKey || this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    const model = config?.model || this.config.model || 'claude-sonnet-4-20250514';

    let content = prompt;
    if (systemPrompt) {
      content = `${systemPrompt}\n\n${prompt}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      content: Array<{ text: string }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    return {
      content: data.content[0]?.text || '',
      model,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    };
  }
}
