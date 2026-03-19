import { EmbeddingProvider, EmbeddingConfig } from './types.js';
import { logApiRequest, isVerboseMode } from '../../utils/verboseLogger.js';

interface ZhipuEmbeddingResponse {
  data: Array<{
    index: number;
    embedding: number[];
  }>;
}

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
    return results[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('ZHIPU_API_KEY is required for ZhipuEmbedding');
    }

    const startTime = isVerboseMode() ? Date.now() : undefined;
    const requestBody = { model: this.model, input: texts };

    const response = await fetch(`${this.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
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
      throw new Error(`Zhipu Embedding API error: ${response.status} ${responseText}`);
    }

    const data = JSON.parse(responseText) as ZhipuEmbeddingResponse;
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

    return data.data.sort((a, b) => a.index - b.index).map(item => item.embedding);
  }
}
