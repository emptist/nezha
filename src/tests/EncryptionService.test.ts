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

const resetEncryptionService = () => {
  (EncryptionService as unknown as { instance: null }).instance = null;
};

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    resetEncryptionService();
    service = EncryptionService.getInstance();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = EncryptionService.getInstance();
      const instance2 = EncryptionService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should initialize with a secret', async () => {
      await service.initialize('test-secret-12345');
      expect(service.isInitialized()).toBe(true);
    });

    it('should use NEZHA_SECRET from env when no secret provided', async () => {
      const originalSecret = process.env.NEZHA_SECRET;
      process.env.NEZHA_SECRET = 'env-secret-12345';
      try {
        resetEncryptionService();
        const newService = EncryptionService.getInstance();
        await newService.initialize();
        expect(newService.isInitialized()).toBe(true);
      } finally {
        if (originalSecret) {
          process.env.NEZHA_SECRET = originalSecret;
        } else {
          delete process.env.NEZHA_SECRET;
        }
      }
    });

    it('should not initialize without secret', async () => {
      const originalSecret = process.env.NEZHA_SECRET;
      delete process.env.NEZHA_SECRET;
      try {
        resetEncryptionService();
        const newService = EncryptionService.getInstance();
        await newService.initialize();
        expect(newService.isInitialized()).toBe(false);
      } finally {
        if (originalSecret) {
          process.env.NEZHA_SECRET = originalSecret;
        }
      }
    });

    it('should handle empty string gracefully (returns without error)', async () => {
      const originalSecret = process.env.NEZHA_SECRET;
      delete process.env.NEZHA_SECRET;
      try {
        await service.initialize('');
        expect(service.isInitialized()).toBe(false);
      } finally {
        if (originalSecret) process.env.NEZHA_SECRET = originalSecret;
      }
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      resetEncryptionService();
      const newService = EncryptionService.getInstance();
      expect(newService.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await service.initialize('test-secret');
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('encrypt and decrypt', () => {
    beforeEach(async () => {
      await service.initialize('test-secret');
    });

    it('should encrypt and decrypt a string', () => {
      const plaintext = 'Hello, World!';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('encryptedData');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('salt');
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext each time', () => {
      const plaintext = 'Same text';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw when encrypting without initialization', () => {
      resetEncryptionService();
      const uninitService = EncryptionService.getInstance();
      expect(() => uninitService.encrypt('test')).toThrow('Encryption service not initialized');
    });

    it('should throw when decrypting without initialization', () => {
      resetEncryptionService();
      const uninitService = EncryptionService.getInstance();
      const mockData: EncryptedData = {
        iv: 'test',
        encryptedData: 'test',
        tag: 'test',
        salt: 'test',
      };
      expect(() => uninitService.decrypt(mockData)).toThrow('Encryption service not initialized');
    });

    it('should throw when decrypting with tampered data', () => {
      const encrypted = service.encrypt('test data');
      encrypted.encryptedData = Buffer.from('tampered').toString('base64');
      expect(() => service.decrypt(encrypted)).toThrow();
    });

    it('should throw when decrypting with tampered tag', () => {
      const encrypted = service.encrypt('test data');
      encrypted.tag = Buffer.from('tampered').toString('base64');
      expect(() => service.decrypt(encrypted)).toThrow();
    });

    it('should produce base64 encoded output', () => {
      const encrypted = service.encrypt('test');
      expect(() => Buffer.from(encrypted.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.encryptedData, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.tag, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.salt, 'base64')).not.toThrow();
    });
  });

  describe('encryptString and decryptString', () => {
    beforeEach(async () => {
      await service.initialize('test-secret');
    });

    it('should encrypt and decrypt as JSON string', () => {
      const plaintext = 'Secret API Key: 12345';
      const encrypted = service.encryptString(plaintext);
      const decrypted = service.decryptString(encrypted);

      expect(typeof encrypted).toBe('string');
      expect(decrypted).toBe(plaintext);
    });

    it('should be valid JSON', () => {
      const encrypted = service.encryptString('test');
      expect(() => JSON.parse(encrypted)).not.toThrow();
    });

    it('should roundtrip complex strings', () => {
      const plaintext =
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const encrypted = service.encryptString(plaintext);
      const decrypted = service.decryptString(encrypted);
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

  beforeEach(async () => {
    resetEncryptionService();
    service = EncryptionService.getInstance();
    await service.initialize('test-secret');
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

  it('should not modify when service not initialized', () => {
    resetEncryptionService();
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

  beforeEach(async () => {
    resetEncryptionService();
    service = EncryptionService.getInstance();
    await service.initialize('test-secret');
  });

  it('should decrypt encrypted fields', () => {
    const obj = {
      username: 'john',
      password: service.encryptString('secret-password'),
      password_encrypted: true,
    };

    const result = decryptSensitiveFields(obj as Record<string, unknown>, service);

    expect(result.password).toBe('secret-password');
    expect(result.password_encrypted).toBeUndefined();
    expect(result.username).toBe('john');
  });

  it('should not modify non-encrypted fields', () => {
    const obj = {
      name: 'John',
    };

    const result = decryptSensitiveFields(obj, service);
    expect(result.name).toBe('John');
  });

  it('should not modify when service not initialized', () => {
    resetEncryptionService();
    const uninitService = EncryptionService.getInstance();
    const obj = {
      secret: 'encrypted-value',
      secret_encrypted: true,
    };

    const result = decryptSensitiveFields(obj, uninitService);
    expect(result).toEqual(obj);
  });

  it('should handle decryption failure gracefully', () => {
    const obj = {
      api_key: 'invalid-encrypted-data',
      api_key_encrypted: true,
    };

    const result = decryptSensitiveFields(obj, service);
    expect(result.api_key).toBe('invalid-encrypted-data');
  });

  it('should decrypt multiple encrypted fields', () => {
    const obj = {
      password: service.encryptString('pass123'),
      password_encrypted: true,
      token: service.encryptString('tok456'),
      token_encrypted: true,
    };

    const result = decryptSensitiveFields(obj as Record<string, unknown>, service);

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
