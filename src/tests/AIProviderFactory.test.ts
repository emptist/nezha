import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIProviderFactory } from '../services/ai/index.js';

const mockGetCurrentInnerProvider = vi.hoisted(vi.fn);

vi.mock('../services/ApiKeyService.js', () => ({
  ApiKeyService: {
    getInstance: vi.fn().mockReturnValue({
      getCurrentInnerProvider: mockGetCurrentInnerProvider,
      hasApiKey: vi.fn(),
    }),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const ENV_KEYS = ['OPENROUTER_MODEL', 'ZHIPU_MODEL', 'ZHIPU_BASE_URL', 'OPENAI_MODEL', 'ANTHROPIC_MODEL'];

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

function clearAiEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('AIProviderFactory.createInnerProvider', () => {
  let mockDb: any;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    mockGetCurrentInnerProvider.mockReset();
    mockDb = {};
    savedEnv = saveEnv();
    clearAiEnv();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  it('should return OpenRouter provider when openrouter is current', async () => {
    mockGetCurrentInnerProvider.mockResolvedValue({
      provider: 'openrouter',
      apiKey: 'db-key-openrouter',
    });

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('openrouter');
    expect(provider.getModel()).toBe('tencent/hy3-preview:free');
  });

  it('should use model from DB when set', async () => {
    mockGetCurrentInnerProvider.mockResolvedValue({
      provider: 'openrouter',
      apiKey: 'db-key-openrouter',
      model: 'custom-model-v2',
    });

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider.getModel()).toBe('custom-model-v2');
  });

  it('should return GLM5 provider when glm5 is current', async () => {
    mockGetCurrentInnerProvider.mockResolvedValue({
      provider: 'glm5',
      apiKey: 'db-key-glm5',
    });

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('glm5');
  });

  it('should return GLM5 provider when zhipu is current (maps to glm5)', async () => {
    mockGetCurrentInnerProvider.mockResolvedValue({
      provider: 'zhipu',
      apiKey: 'db-key-zhipu',
    });

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('glm5');
  });

  it('should return OpenAI provider when openai is current', async () => {
    mockGetCurrentInnerProvider.mockResolvedValue({
      provider: 'openai',
      apiKey: 'db-key-openai',
    });

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('openai');
  });

  it('should return Anthropic provider when anthropic is current', async () => {
    mockGetCurrentInnerProvider.mockResolvedValue({
      provider: 'anthropic',
      apiKey: 'db-key-anthropic',
    });

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('anthropic');
  });

  it('should throw when no current provider is configured', async () => {
    mockGetCurrentInnerProvider.mockResolvedValue(null);

    await expect(AIProviderFactory.createInnerProvider(mockDb)).rejects.toThrow(
      'no current inner provider configured'
    );
  });

  it('should throw on DB query error', async () => {
    mockGetCurrentInnerProvider.mockRejectedValue(new Error('Connection refused'));

    await expect(AIProviderFactory.createInnerProvider(mockDb)).rejects.toThrow(
      'Connection refused'
    );
  });

  it('should not cache instance between calls', async () => {
    mockGetCurrentInnerProvider.mockResolvedValue({
      provider: 'openrouter',
      apiKey: 'db-key-openrouter',
    });
    const provider1 = await AIProviderFactory.createInnerProvider(mockDb);

    mockGetCurrentInnerProvider.mockReset();
    mockGetCurrentInnerProvider.mockResolvedValue({
      provider: 'openai',
      apiKey: 'db-key-openai',
    });
    const provider2 = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider1.getProvider()).toBe('openrouter');
    expect(provider2.getProvider()).toBe('openai');
    expect(provider1).not.toBe(provider2);
  });
});
