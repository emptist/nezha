export { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types';
export { ZhipuEmbedding } from './ZhipuEmbedding';

import { EmbeddingProvider, EmbeddingConfig } from './types';
import { ZhipuEmbedding } from './ZhipuEmbedding';

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'zhipu':
      return new ZhipuEmbedding(config);
    
    case 'openai':
      throw new Error('OpenAI embedding provider not implemented yet');
    
    case 'ollama':
      throw new Error('Ollama embedding provider not implemented yet');
    
    default:
      throw new Error(`Unknown embedding provider: ${(config as any).provider}`);
  }
}
