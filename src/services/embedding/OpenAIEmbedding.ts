import { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types.js';

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIEmbedding implements EmbeddingProvider {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private timeout: number;
  private dimensions?: number;

  constructor(config: EmbeddingConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'text-embedding-3-small';
    this.timeout = 30000;
    
    if (this.model === 'text-embedding-3-small' || this.model === 'text-embedding-3-large') {
      this.dimensions = 1536;
    }
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.apiUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          ...(this.dimensions ? { dimensions: this.dimensions } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI Embedding API error (${response.status}): ${error}`);
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response from OpenAI: missing data array');
      }

      const sortedEmbeddings = data.data.sort((a, b) => a.index - b.index);
      return sortedEmbeddings.map(item => item.embedding);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI embedding request timed out after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
