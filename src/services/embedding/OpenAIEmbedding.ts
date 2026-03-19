import { EmbeddingProvider, EmbeddingConfig } from './types.js';
import { logApiRequest, isVerboseMode } from '../../utils/verboseLogger.js';

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
    return results[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const startTime = isVerboseMode() ? Date.now() : undefined;

    try {
      const requestBody = {
        model: this.model,
        input: texts,
        ...(this.dimensions ? { dimensions: this.dimensions } : {}),
      };

      const response = await fetch(`${this.apiUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        logApiRequest(
          'embedBatch',
          'POST',
          `${this.apiUrl}/embeddings`,
          requestBody,
          response.status,
          responseText,
          new Error(`HTTP ${response.status}`),
          startTime
        );
        throw new Error(`OpenAI Embedding API error (${response.status}): ${responseText}`);
      }

      const data = JSON.parse(responseText) as OpenAIEmbeddingResponse;

      logApiRequest(
        'embedBatch',
        'POST',
        `${this.apiUrl}/embeddings`,
        requestBody,
        response.status,
        responseText,
        undefined,
        startTime
      );

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response from OpenAI: missing data array');
      }

      const sortedEmbeddings = data.data.sort((a, b) => a.index - b.index);
      return sortedEmbeddings.map(item => item.embedding);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI embedding request timed out after ${this.timeout}ms`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
