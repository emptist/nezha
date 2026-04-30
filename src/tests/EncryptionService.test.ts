import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EncryptionService,
  EncryptedData,
  getEncryptionService,
  containsSensitiveData,
  encryptSensitiveFields,
  decryptSensitiveFields,
  isEncryptedData,
} from '../../src/services/EncryptionService.js';

const TEST_SECRET = 'test-secret-12345';

const resetEncryptionService = () => {
  (EncryptionService as unknown as { instance: null }).instance = null;
};

describe('EncryptionService', () => {
  let service: EncryptionService;
  let originalSecret: string | undefined;

  beforeEach(() => {
    resetEncryptionService();
    service = EncryptionService.getInstance();
    originalSecret = process.env.NEZHA_SECRET;
    process.env.NEZHA_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret) {
      process.env.NEZHA_SECRET = originalSecret;
    } else {
      delete process.env.NEZHA_SECRET;
    }
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = EncryptionService.getInstance();
      const instance2 = EncryptionService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('encryptedData');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('salt');
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext each time', async () => {
      const plaintext = 'Same text';
      const encrypted1 = await service.encrypt(plaintext);
      const encrypted2 = await service.encrypt(plaintext);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
    });

    it('should handle empty string', async () => {
      const plaintext = '';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', async () => {
      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', async () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw when encrypting without NEZHA_SECRET', async () => {
      delete process.env.NEZHA_SECRET;
      const uninitService = EncryptionService.getInstance();
      await expect(uninitService.encrypt('test')).rejects.toThrow('NEZHA_SECRET not set');
    });

    it('should throw when decrypting without NEZHA_SECRET', async () => {
      delete process.env.NEZHA_SECRET;
      const uninitService = EncryptionService.getInstance();
      const mockData: EncryptedData = {
        iv: 'test',
        encryptedData: 'test',
        tag: 'test',
        salt: 'test',
      };
      await expect(uninitService.decrypt(mockData)).rejects.toThrow('NEZHA_SECRET not set');
    });

    it('should throw when decrypting with tampered data', async () => {
      const encrypted = await service.encrypt('test data');
      encrypted.encryptedData = Buffer.from('tampered').toString('base64');
      await expect(service.decrypt(encrypted)).rejects.toThrow();
    });

    it('should throw when decrypting with tampered tag', async () => {
      const encrypted = await service.encrypt('test data');
      encrypted.tag = Buffer.from('tampered').toString('base64');
      await expect(service.decrypt(encrypted)).rejects.toThrow();
    });

    it('should produce base64 encoded output', async () => {
      const encrypted = await service.encrypt('test');
      expect(() => Buffer.from(encrypted.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.encryptedData, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.tag, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.salt, 'base64')).not.toThrow();
    });
  });

  describe('encryptString and decryptString', () => {
    it('should encrypt and decrypt as JSON string', async () => {
      const plaintext = 'Secret API Key: 12345';
      const encrypted = await service.encryptString(plaintext);
      const decrypted = await service.decryptString(encrypted);

      expect(typeof encrypted).toBe('string');
      expect(decrypted).toBe(plaintext);
    });

    it('should be valid JSON', async () => {
      const encrypted = await service.encryptString('test');
      expect(() => JSON.parse(encrypted)).not.toThrow();
    });

    it('should roundtrip complex strings', async () => {
      const plaintext =
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const encrypted = await service.encryptString(plaintext);
      const decrypted = await service.decryptString(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });
});

describe('containsSensitiveData', () => {
  it('should detect api_key field', () => {
    expect(containsSensitiveData({ api_key: 'value' })).toBe(true);
  });

  it('should detect apiKey field', () => {
    expect(containsSensitiveData({ apiKey: 'value' })).toBe(true);
  });

  it('should detect secret field', () => {
    expect(containsSensitiveData({ secret: 'value' })).toBe(true);
  });

  it('should detect password field', () => {
    expect(containsSensitiveData({ password: 'value' })).toBe(true);
  });

  it('should detect token field', () => {
    expect(containsSensitiveData({ token: 'value' })).toBe(true);
  });

  it('should detect credential field', () => {
    expect(containsSensitiveData({ credential: 'value' })).toBe(true);
  });

  it('should detect private_key field', () => {
    expect(containsSensitiveData({ private_key: 'value' })).toBe(true);
  });

  it('should detect access_key field', () => {
    expect(containsSensitiveData({ access_key: 'value' })).toBe(true);
  });

  it('should detect auth field', () => {
    expect(containsSensitiveData({ auth: 'value' })).toBe(true);
  });

  it('should return false for safe fields', () => {
    expect(containsSensitiveData({ name: 'value' })).toBe(false);
    expect(containsSensitiveData({ email: 'test@example.com' })).toBe(false);
    expect(containsSensitiveData({ id: 123 })).toBe(false);
  });

  it('should handle empty object', () => {
    expect(containsSensitiveData({})).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(containsSensitiveData({ API_KEY: 'value' })).toBe(true);
    expect(containsSensitiveData({ SECRET: 'value' })).toBe(true);
    expect(containsSensitiveData({ PASSWORD: 'value' })).toBe(true);
  });
});

describe('encryptSensitiveFields', () => {
  let service: EncryptionService;
  let originalSecret: string | undefined;

  beforeEach(() => {
    resetEncryptionService();
    service = EncryptionService.getInstance();
    originalSecret = process.env.NEZHA_SECRET;
    process.env.NEZHA_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret) {
      process.env.NEZHA_SECRET = originalSecret;
    } else {
      delete process.env.NEZHA_SECRET;
    }
  });

  it('should encrypt sensitive string fields', () => {
    const obj = {
      username: 'john',
      api_key: 'secret-key-123',
    };

    const result = encryptSensitiveFields(obj, service);

    expect(result.username).toBe('john');
    expect(result.api_key).not.toBe('secret-key-123');
    expect(result.api_key_encrypted).toBe(true);
  });

  it('should not encrypt non-string values', () => {
    const obj = {
      password: 12345,
    };

    const result = encryptSensitiveFields(obj, service);
    expect(result.password).toBe(12345);
    expect(result.password_encrypted).toBeUndefined();
  });

  it('should not modify when NEZHA_SECRET not set', () => {
    delete process.env.NEZHA_SECRET;
    const uninitService = EncryptionService.getInstance();
    const obj = { secret: 'value' };

    const result = encryptSensitiveFields(obj, uninitService);
    expect(result).toEqual(obj);
  });

  it('should preserve other fields', () => {
    const obj = {
      name: 'John',
      password: 'secret',
      age: 30,
      active: true,
    };

    const result = encryptSensitiveFields(obj, service);

    expect(result.name).toBe('John');
    expect(result.age).toBe(30);
    expect(result.active).toBe(true);
    expect(result.password).not.toBe('secret');
  });

  it('should mark encrypted fields', () => {
    const obj = { token: 'abc123' };
    const result = encryptSensitiveFields(obj, service);
    expect(result.token_encrypted).toBe(true);
  });

  it('should encrypt multiple sensitive fields', () => {
    const obj = {
      username: 'admin',
      password: 'pass123',
      apiKey: 'key456',
    };

    const result = encryptSensitiveFields(obj, service);

    expect(result.username).toBe('admin');
    expect(result.password).not.toBe('pass123');
    expect(result.password_encrypted).toBe(true);
    expect(result.apiKey).not.toBe('key456');
    expect(result.apiKey_encrypted).toBe(true);
  });
});

describe('decryptSensitiveFields', () => {
  let service: EncryptionService;
  let originalSecret: string | undefined;

  beforeEach(() => {
    resetEncryptionService();
    service = EncryptionService.getInstance();
    originalSecret = process.env.NEZHA_SECRET;
    process.env.NEZHA_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret) {
      process.env.NEZHA_SECRET = originalSecret;
    } else {
      delete process.env.NEZHA_SECRET;
    }
  });

  it('should decrypt encrypted fields', async () => {
    const encrypted = await service.encryptString('secret-password');
    const obj = {
      username: 'john',
      password: encrypted,
      password_encrypted: true,
    };

    const result = await decryptSensitiveFields(obj as Record<string, unknown>, service);

    expect(result.password).toBe('secret-password');
    expect(result.password_encrypted).toBeUndefined();
    expect(result.username).toBe('john');
  });

  it('should not modify non-encrypted fields', async () => {
    const obj = {
      name: 'John',
    };

    const result = await decryptSensitiveFields(obj, service);
    expect(result.name).toBe('John');
  });

  it('should not modify when NEZHA_SECRET not set', async () => {
    delete process.env.NEZHA_SECRET;
    const uninitService = EncryptionService.getInstance();
    const obj = {
      secret: 'encrypted-value',
      secret_encrypted: true,
    };

    const result = await decryptSensitiveFields(obj, uninitService);
    expect(result).toEqual(obj);
  });

  it('should handle decryption failure gracefully', async () => {
    const encrypted = await service.encryptString('test');
    const obj = {
      api_key: encrypted,
      api_key_encrypted: true,
    };

    // Tamper with the encrypted data
    const tamperedObj = { ...obj, api_key: 'invalid-encrypted-data' };
    const result = await decryptSensitiveFields(tamperedObj as Record<string, unknown>, service);
    expect(result.api_key).toBe('invalid-encrypted-data');
  });

  it('should decrypt multiple encrypted fields', async () => {
    const encryptedPass = await service.encryptString('pass123');
    const encryptedToken = await service.encryptString('tok456');
    const obj = {
      password: encryptedPass,
      password_encrypted: true,
      token: encryptedToken,
      token_encrypted: true,
    };

    const result = await decryptSensitiveFields(obj as Record<string, unknown>, service);

    expect(result.password).toBe('pass123');
    expect(result.token).toBe('tok456');
    expect(result.password_encrypted).toBeUndefined();
    expect(result.token_encrypted).toBeUndefined();
  });
});

describe('isEncryptedData', () => {
  it('should return true for valid EncryptedData', () => {
    const data = {
      iv: 'base64string',
      encryptedData: 'base64string',
      tag: 'base64string',
      salt: 'base64string',
    };

    expect(isEncryptedData(data)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isEncryptedData(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isEncryptedData(undefined)).toBe(false);
  });

  it('should return false for primitive', () => {
    expect(isEncryptedData('string')).toBe(false);
    expect(isEncryptedData(123)).toBe(false);
    expect(isEncryptedData(true)).toBe(false);
  });

  it('should return false for object missing required fields', () => {
    expect(isEncryptedData({ iv: 'test' })).toBe(false);
    expect(isEncryptedData({ iv: 'test', encryptedData: 'test' })).toBe(false);
    expect(isEncryptedData({ iv: 'test', encryptedData: 'test', tag: 'test' })).toBe(false);
  });

  it('should return false for non-string field values', () => {
    expect(isEncryptedData({ iv: 123, encryptedData: 'test', tag: 'test', salt: 'test' })).toBe(
      false
    );
    expect(isEncryptedData({ iv: 'test', encryptedData: 123, tag: 'test', salt: 'test' })).toBe(
      false
    );
  });

  it('should return false for empty string fields', () => {
    expect(isEncryptedData({ iv: '', encryptedData: 'test', tag: 'test', salt: 'test' })).toBe(
      true
    );
  });
});

describe('getEncryptionService', () => {
  it('should return an instance', () => {
    const service = getEncryptionService();
    expect(service).toBeDefined();
  });

  it('should return same instance as getInstance', () => {
    expect(getEncryptionService()).toBe(EncryptionService.getInstance());
  });
});
