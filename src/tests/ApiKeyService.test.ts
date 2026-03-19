import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { QueryResult } from '../config/types.js';

const mockDb = {
  query: vi.fn(),
  close: vi.fn(),
};

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => mockDb),
}));

describe('ApiKeyService', () => {
  let ApiKeyService: any;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mock('../services/EncryptionService.js', () => ({
      EncryptionService: vi.fn(),
      getEncryptionService: vi.fn().mockReturnValue({
        isInitialized: vi.fn().mockReturnValue(true),
        encrypt: vi.fn().mockReturnValue({
          encryptedData: 'encrypted-key',
          iv: 'iv-data',
          tag: 'tag-data',
          salt: 'salt-data',
        }),
        decrypt: vi.fn().mockReturnValue('decrypted-api-key'),
      }),
    }));
    const module = await import('../services/ApiKeyService.js');
    ApiKeyService = module.ApiKeyService;
    mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as QueryResult<unknown>);
    service = new ApiKeyService(mockDb as unknown as DatabaseClient, {
      isInitialized: vi.fn().mockReturnValue(true),
      encrypt: vi.fn().mockReturnValue({
        encryptedData: 'encrypted-key',
        iv: 'iv-data',
        tag: 'tag-data',
        salt: 'salt-data',
      }),
      decrypt: vi.fn().mockReturnValue('decrypted-api-key'),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('storeApiKey', () => {
    it('should store encrypted API key', async () => {
      await service.storeApiKey('openai', 'sk-secret123');
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should throw error when encryption not initialized', async () => {
      service.encryption.isInitialized.mockReturnValue(false);

      await expect(service.storeApiKey('openai', 'sk-secret123')).rejects.toThrow(
        'Encryption service not initialized'
      );
    });
  });

  describe('getApiKey', () => {
    it('should retrieve and decrypt API key', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [
          {
            encrypted_key: 'encrypted-key',
            encrypted_iv: 'iv-data',
            encrypted_tag: 'tag-data',
            encrypted_salt: 'salt-data',
          },
        ],
        rowCount: 1,
      } as QueryResult<any>);

      const result = await service.getApiKey('openai');
      expect(result).toBe('decrypted-api-key');
    });

    it('should return null when key not found', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await service.getApiKey('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deleteApiKey', () => {
    it('should delete API key', async () => {
      await service.deleteApiKey('openai');
      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM provider_api_keys WHERE provider = $1',
        ['openai']
      );
    });
  });

  describe('listProviders', () => {
    it('should return list of providers', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ provider: 'openai' }, { provider: 'anthropic' }],
        rowCount: 2,
      } as QueryResult<{ provider: string }>);

      const result = await service.listProviders();
      expect(result).toEqual(['openai', 'anthropic']);
    });

    it('should return empty array when no providers', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await service.listProviders();
      expect(result).toEqual([]);
    });
  });

  describe('hasApiKey', () => {
    it('should return true when provider has key', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ count: '1' }],
        rowCount: 1,
      } as QueryResult<{ count: string }>);

      const result = await service.hasApiKey('openai');
      expect(result).toBe(true);
    });

    it('should return false when provider has no key', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ count: '0' }],
        rowCount: 1,
      } as QueryResult<{ count: string }>);

      const result = await service.hasApiKey('nonexistent');
      expect(result).toBe(false);
    });
  });
});
