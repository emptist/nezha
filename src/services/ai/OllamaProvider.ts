import { BaseAIProvider, AICompletionResponse, AIProviderConfig } from './AIProvider.js';

export class OllamaProvider extends BaseAIProvider {
  constructor(config: AIProviderConfig) {
    super({ ...config, provider: 'ollama' });
  }

  async complete(
    prompt: string,
    systemPrompt?: string,
    config?: Partial<AIProviderConfig>
  ): Promise<AICompletionResponse> {
    const model = config?.model || this.config.model || 'mistral:7b';
    const baseUrl = config?.baseUrl || this.config.baseUrl || 'http://localhost:11434';

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 4000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      message?: { content: string };
      model: string;
      eval_count?: number;
      prompt_eval_count?: number;
    };

    return {
      content: data.message?.content || '',
      model,
      usage: data.eval_count
        ? {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count,
            totalTokens: (data.prompt_eval_count || 0) + data.eval_count,
          }
        : undefined,
    };
  }
}
