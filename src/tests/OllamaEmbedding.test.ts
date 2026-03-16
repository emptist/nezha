import { describe, it, expect, beforeAll } from 'vitest';
import { OllamaEmbedding } from '../services/embedding/OllamaEmbedding.js';

describe('OllamaEmbedding', () => {
  let embedding: OllamaEmbedding;
  let ollamaAvailable = false;

  beforeAll(async () => {
    embedding = new OllamaEmbedding({
      provider: 'ollama',
      model: 'nomic-embed-text',
      apiUrl: 'http://localhost:11434'
    });

    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      ollamaAvailable = response.ok;
    } catch {
      console.log('⚠️ Ollama not available, skipping integration tests');
    }
  });

  it('should create instance with default config', () => {
    const emb = new OllamaEmbedding({ provider: 'ollama', model: 'test' });
    expect(emb).toBeDefined();
  });

  it('should embed a single text', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const text = 'Hello world';
    const result = await embedding.embed(text);

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(768);
    expect(result.every((n: number) => typeof n === 'number')).toBe(true);
  });

  it('should embed multiple texts in parallel', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const texts = ['Hello world', 'Goodbye world'];
    const results = await embedding.embedBatch(texts);

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(2);
    expect(results[0].length).toBe(768);
    expect(results[1].length).toBe(768);
  });

  it('should throw error on invalid API URL', async () => {
    const badEmbedding = new OllamaEmbedding({
      provider: 'ollama',
      model: 'nomic-embed-text',
      apiUrl: 'http://localhost:99999'
    });

    await expect(badEmbedding.embed('test')).rejects.toThrow();
  });

  it('should throw error on invalid model', async () => {
    if (!ollamaAvailable) {
      console.log('Skipping: Ollama not available');
      return;
    }

    const badEmbedding = new OllamaEmbedding({
      provider: 'ollama',
      model: 'non-existent-model',
      apiUrl: 'http://localhost:11434'
    });

    await expect(badEmbedding.embed('test')).rejects.toThrow();
  });
});
