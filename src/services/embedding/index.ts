import { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types.js';
export { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types.js';
export { ZhipuEmbedding } from './ZhipuEmbedding.js';
export { OllamaEmbedding } from './OllamaEmbedding.js';

import { ZhipuEmbedding } from './ZhipuEmbedding.js';
import { OllamaEmbedding } from './OllamaEmbedding.js';

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'zhipu':
      return new ZhipuEmbedding(config);
    
    case 'openai':
      throw new Error('OpenAI embedding provider not implemented yet');
    
    case 'ollama':
      return new OllamaEmbedding(config);
    
    default:
      throw new Error(`Unknown embedding provider: ${(config as any).provider}`);
  }
}
