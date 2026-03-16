export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingConfig {
  provider: 'zhipu' | 'openai' | 'ollama';
  model: string;
  apiKey?: string;
  apiUrl?: string;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}
