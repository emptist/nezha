import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIProviderFactory } from '../services/ai/index.js';

const mockGetApiKey = vi.hoisted(vi.fn);
const mockListProviders = vi.hoisted(vi.fn);

vi.mock('../services/ApiKeyService.js', () => ({
  ApiKeyService: {
    getInstance: vi.fn().mockReturnValue({
      getApiKey: mockGetApiKey,
      listProviders: mockListProviders,
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

const ENV_KEYS = [
  'OPENROUTER_MODEL',
  'ZHIPU_MODEL',
  'ZHIPU_BASE_URL',
  'OPENAI_MODEL',
  'ANTHROPIC_MODEL',
];

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

function setupDbKeys(providers: string[]) {
  mockListProviders.mockResolvedValue(providers);
  mockGetApiKey.mockImplementation((provider: string) => {
    if (providers.includes(provider)) return Promise.resolve(`db-key-for-${provider}`);
    return Promise.resolve(null);
  });
}

describe('AIProviderFactory.createInnerProvider', () => {
  let mockDb: any;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    mockGetApiKey.mockReset();
    mockListProviders.mockReset();
    mockDb = {};
    savedEnv = saveEnv();
    clearAiEnv();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  it('should return OpenRouter provider when openrouter key exists in DB', async () => {
    setupDbKeys(['openrouter']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('openrouter');
    expect(provider.getModel()).toBe('tencent/hy3-preview:free');
  });

  it('should use OPENROUTER_MODEL env var when set', async () => {
    process.env.OPENROUTER_MODEL = 'custom-model-v2';
    setupDbKeys(['openrouter']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider.getModel()).toBe('custom-model-v2');
  });

  it('should return GLM5 provider when glm5 key exists in DB', async () => {
    setupDbKeys(['glm5']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('glm5');
  });

  it('should return GLM5 provider when zhipu key exists in DB', async () => {
    setupDbKeys(['zhipu']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('glm5');
  });

  it('should prefer openrouter over glm5 when both exist', async () => {
    setupDbKeys(['glm5', 'openrouter']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider.getProvider()).toBe('openrouter');
  });

  it('should return OpenAI provider when openai key exists in DB', async () => {
    setupDbKeys(['openai']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('openai');
  });

  it('should return Anthropic provider when anthropic key exists in DB', async () => {
    setupDbKeys(['anthropic']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider).toBeDefined();
    expect(provider.getProvider()).toBe('anthropic');
  });

  it('should throw when no DB keys found', async () => {
    setupDbKeys([]);

    await expect(AIProviderFactory.createInnerProvider(mockDb)).rejects.toThrow(
      'no API keys found in database'
    );
  });

  it('should throw when getApiKey returns null', async () => {
    mockListProviders.mockResolvedValue(['openrouter']);
    mockGetApiKey.mockResolvedValue(null);

    await expect(AIProviderFactory.createInnerProvider(mockDb)).rejects.toThrow(
      'no API keys found in database'
    );
  });

  it('should throw when encryption is not initialized', async () => {
    mockListProviders.mockRejectedValue(new Error('Encryption service not initialized'));

    await expect(AIProviderFactory.createInnerProvider(mockDb)).rejects.toThrow(
      'Encryption service not initialized'
    );
  });

  it('should throw on DB query error', async () => {
    mockListProviders.mockRejectedValue(new Error('Connection refused'));

    await expect(AIProviderFactory.createInnerProvider(mockDb)).rejects.toThrow(
      'Connection refused'
    );
  });

  it('should not cache instance between calls', async () => {
    setupDbKeys(['openrouter']);
    const provider1 = await AIProviderFactory.createInnerProvider(mockDb);

    mockGetApiKey.mockReset();
    mockListProviders.mockReset();
    setupDbKeys(['openai']);
    const provider2 = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider1.getProvider()).toBe('openrouter');
    expect(provider2.getProvider()).toBe('openai');
    expect(provider1).not.toBe(provider2);
  });

  it('should use ZHIPU_MODEL env var for glm5 model name', async () => {
    process.env.ZHIPU_MODEL = 'glm-4-flash';
    setupDbKeys(['glm5']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider.getModel()).toBe('glm-4-flash');
  });

  it('should use OPENAI_MODEL env var for openai model name', async () => {
    process.env.OPENAI_MODEL = 'gpt-4o';
    setupDbKeys(['openai']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider.getModel()).toBe('gpt-4o');
  });

  it('should use ANTHROPIC_MODEL env var for anthropic model name', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-3-opus';
    setupDbKeys(['anthropic']);

    const provider = await AIProviderFactory.createInnerProvider(mockDb);

    expect(provider.getModel()).toBe('claude-3-opus');
  });
});
