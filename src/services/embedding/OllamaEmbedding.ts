import { EmbeddingProvider, EmbeddingConfig } from './types.js';
import { logApiRequest, isVerboseMode } from '../../utils/verboseLogger.js';

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaEmbedding implements EmbeddingProvider {
  private apiUrl: string;
  private model: string;
  private timeout: number;

  constructor(config: EmbeddingConfig) {
    this.apiUrl = config.apiUrl || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
    this.timeout = 30000;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const promises = texts.map((text, index) => this.embedSingle(text, index));
    const results = await Promise.all(promises);
    return results;
  }

  private async embedSingle(text: string, _index: number): Promise<number[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const startTime = isVerboseMode() ? Date.now() : undefined;

    try {
      const requestBody = { model: this.model, prompt: text };

      const response = await fetch(`${this.apiUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        logApiRequest(
          'embedSingle',
          'POST',
          `${this.apiUrl}/api/embeddings`,
          requestBody,
          response.status,
          responseText,
          new Error(`HTTP ${response.status}`),
          startTime
        );
        throw new Error(`Ollama Embedding API error (${response.status}): ${responseText}`);
      }

      const data = JSON.parse(responseText) as OllamaEmbeddingResponse;
      logApiRequest(
        'embedSingle',
        'POST',
        `${this.apiUrl}/api/embeddings`,
        requestBody,
        response.status,
        responseText,
        undefined,
        startTime
      );

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid response from Ollama: missing embedding array');
      }

      return data.embedding;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama embedding request timed out after ${this.timeout}ms`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
