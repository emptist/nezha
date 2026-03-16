import { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types';

export class ZhipuEmbedding implements EmbeddingProvider {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey || process.env.ZHIPU_API_KEY || '';
    this.apiUrl = config.apiUrl || 'https://open.bigmodel.cn/api/paas/v4';
    this.model = config.model || 'embedding-2';
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('ZHIPU_API_KEY is required for ZhipuEmbedding');
    }

    const response = await fetch(`${this.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Zhipu Embedding API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    
    return data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);
  }
}
