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

  describe('storeUserApiKeyEncrypted', () => {
    it('should store encrypted user API key', async () => {
      await service.storeUserApiKeyEncrypted('user-key-1', 'sk-user123');
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should throw error when encryption not initialized', async () => {
      service.encryption.isInitialized.mockReturnValue(false);

      await expect(service.storeUserApiKeyEncrypted('user-key-1', 'sk-user123')).rejects.toThrow(
        'Encryption service not initialized'
      );
    });
  });

  describe('getUserApiKeyDecrypted', () => {
    it('should decrypt API key for admin', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [
          {
            encrypted_value: 'encrypted-user-key',
            encrypted_iv: 'iv-data',
            encrypted_tag: 'tag-data',
            encrypted_salt: 'salt-data',
          },
        ],
        rowCount: 1,
      } as QueryResult<any>);

      const result = await service.getUserApiKeyDecrypted('user-key-1', 'admin');
      expect(result).toBe('decrypted-api-key');
    });

    it('should decrypt API key for superadmin', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [
          {
            encrypted_value: 'encrypted-user-key',
            encrypted_iv: 'iv-data',
            encrypted_tag: 'tag-data',
            encrypted_salt: 'salt-data',
          },
        ],
        rowCount: 1,
      } as QueryResult<any>);

      const result = await service.getUserApiKeyDecrypted('user-key-1', 'superadmin');
      expect(result).toBe('decrypted-api-key');
    });

    it('should return null for non-admin roles', async () => {
      const result = await service.getUserApiKeyDecrypted('user-key-1', 'user');
      expect(result).toBeNull();
    });

    it('should return null when user API key not found', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await service.getUserApiKeyDecrypted('nonexistent', 'admin');
      expect(result).toBeNull();
    });

    it('should throw error when encryption not initialized', async () => {
      service.encryption.isInitialized.mockReturnValue(false);

      await expect(service.getUserApiKeyDecrypted('user-key-1', 'admin')).rejects.toThrow(
        'Encryption service not initialized'
      );
    });
  });

  describe('listUserApiKeys', () => {
    it('should list user API keys for admin', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [
          { id: 'key-1', name: 'OpenAI Key', key_hash: 'hash1', role: 'user', enabled: true },
          { id: 'key-2', name: 'Anthropic Key', key_hash: 'hash2', role: 'admin', enabled: true },
        ],
        rowCount: 2,
      } as QueryResult<any>);

      const result = await service.listUserApiKeys('admin');
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('keyHash');
      expect(result[0]).toHaveProperty('role');
      expect(result[0]).toHaveProperty('enabled');
    });

    it('should list user API keys for superadmin', async () => {
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ id: 'key-1', name: 'Test Key', key_hash: 'hash1', role: 'user', enabled: false }],
        rowCount: 1,
      } as QueryResult<any>);

      const result = await service.listUserApiKeys('superadmin');
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no keys', async () => {
      mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await service.listUserApiKeys('admin');
      expect(result).toEqual([]);
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', async () => {
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
      const { ApiKeyService } = module;

      const instance1 = ApiKeyService.getInstance(mockDb as unknown as DatabaseClient);
      const instance2 = ApiKeyService.getInstance(mockDb as unknown as DatabaseClient);

      expect(instance1).toBe(instance2);
    });
  });
});
