import { describe, it, expect, beforeAll } from 'vitest';
import { ZhipuEmbedding } from '../services/embedding/ZhipuEmbedding';

describe('ZhipuEmbedding', () => {
  let embedding: ZhipuEmbedding;

  beforeAll(() => {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey || apiKey === 'your_zhipu_api_key_here') {
      console.log('⚠️ ZHIPU_API_KEY not set, skipping tests');
      return;
    }

    embedding = new ZhipuEmbedding({
      provider: 'zhipu',
      model: 'embedding-2',
      apiKey
    });
  });

  it('should embed a single text', async () => {
    if (!embedding) {
      console.log('Skipping test: ZHIPU_API_KEY not set');
      return;
    }

    const text = '持续运行机制很重要';
    const result = await embedding.embed(text);

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(1024);
    expect(result.every(n => typeof n === 'number')).toBe(true);
  });

  it('should embed multiple texts', async () => {
    if (!embedding) {
      console.log('Skipping test: ZHIPU_API_KEY not set');
      return;
    }

    const texts = [
      '持续运行机制很重要',
      'OpenCode 使用 while(true) 实现持续运行'
    ];
    const results = await embedding.embedBatch(texts);

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(2);
    expect(results[0].length).toBe(1024);
    expect(results[1].length).toBe(1024);
  });

  it('should throw error without API key', async () => {
    const noKeyEmbedding = new ZhipuEmbedding({
      provider: 'zhipu',
      model: 'embedding-2'
    });

    await expect(noKeyEmbedding.embed('test')).rejects.toThrow(
      'ZHIPU_API_KEY is required'
    );
  });
});
