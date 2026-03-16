import { EmbeddingProvider, EmbeddingConfig } from './types.js';

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaEmbedding implements EmbeddingProvider {
  private apiUrl: string;
  private model: string;

  constructor(config: EmbeddingConfig) {
    this.apiUrl = config.apiUrl || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const response = await fetch(`${this.apiUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama Embedding API error: ${response.status} ${error}`);
      }

      const data = await response.json() as OllamaEmbeddingResponse;
      results.push(data.embedding);
    }

    return results;
  }
}
