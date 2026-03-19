export type { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types.js';
export { ZhipuEmbedding } from './ZhipuEmbedding.js';
export { OllamaEmbedding } from './OllamaEmbedding.js';
export { OpenAIEmbedding } from './OpenAIEmbedding.js';

import { ZhipuEmbedding } from './ZhipuEmbedding.js';
import { OllamaEmbedding } from './OllamaEmbedding.js';
import { OpenAIEmbedding } from './OpenAIEmbedding.js';
import type { EmbeddingConfig, EmbeddingProvider } from './types.js';

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'zhipu':
      return new ZhipuEmbedding(config);

    case 'openai':
      return new OpenAIEmbedding(config);

    case 'ollama':
      return new OllamaEmbedding(config);
  }
}
