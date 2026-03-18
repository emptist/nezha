import { EmbeddingProvider, EmbeddingConfig } from './types.js';

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
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const promises = texts.map((text, index) => this.embedSingle(text, index));
    const results = await Promise.all(promises);
    return results;
  }

  private async embedSingle(text: string, index: number): Promise<number[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.apiUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama Embedding API error (${response.status}): ${error}`);
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid response from Ollama: missing embedding array');
      }

      return data.embedding;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama embedding request timed out after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
