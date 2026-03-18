import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { ENV_KEYS, MEMORY_CONFIG } from '../config/constants.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export interface EncryptedData {
  iv: string;
  encryptedData: string;
  tag: string;
  salt: string;
}

export class EncryptionService {
  private key: Buffer | null = null;
  private static instance: EncryptionService | null = null;

  private constructor() {}

  static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  async initialize(secret?: string): Promise<void> {
    const encryptionSecret = secret ?? process.env.NEZHA_SECRET;
    
    if (!encryptionSecret) {
      logger.warn('NEZHA_SECRET not set, encryption disabled');
      return;
    }

    try {
      const salt = crypto.randomBytes(SALT_LENGTH);
      this.key = await this.deriveKey(encryptionSecret, salt);
      logger.info('Encryption service initialized');
    } catch (error) {
      logger.error('Failed to initialize encryption service:', error);
      throw error;
    }
  }

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: ITERATIONS,
        hash: 'SHA-256',
      },
      passwordKey,
      KEY_LENGTH * 8
    );

    return Buffer.from(bits);
  }

  isInitialized(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): EncryptedData {
    if (!this.key) {
      throw new Error('Encryption service not initialized');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintextBytes),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      encryptedData: encrypted.toString('base64'),
      tag: tag.toString('base64'),
      salt: salt.toString('base64'),
    };
  }

  decrypt(encryptedData: EncryptedData): string {
    if (!this.key) {
      throw new Error('Encryption service not initialized');
    }

    const iv = Buffer.from(encryptedData.iv, 'base64');
    const data = Buffer.from(encryptedData.encryptedData, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');
    const salt = Buffer.from(encryptedData.salt, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: TAG_LENGTH,
    });

    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]);

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  encryptString(plaintext: string): string {
    const encrypted = this.encrypt(plaintext);
    return JSON.stringify(encrypted);
  }

  decryptString(encryptedString: string): string {
    const encrypted = JSON.parse(encryptedString) as EncryptedData;
    return this.decrypt(encrypted);
  }
}

export const getEncryptionService = (): EncryptionService => {
  return EncryptionService.getInstance();
};

export const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /auth/i,
];

export interface SensitiveField {
  key: string;
  value: unknown;
  encrypted?: boolean;
}

export function containsSensitiveData(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
      return true;
    }
  }
  return false;
}

export function encryptSensitiveFields(obj: Record<string, unknown>, encryption: EncryptionService): Record<string, unknown> {
  if (!encryption.isInitialized()) {
    return obj;
  }

  const result: Record<string, unknown> = { ...obj };

  for (const key of Object.keys(result)) {
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key)) && typeof result[key] === 'string') {
      result[key] = encryption.encryptString(result[key] as string);
      (result as Record<string, unknown>)[`${key}_encrypted`] = true;
    }
  }

  return result;
}

export function decryptSensitiveFields(obj: Record<string, unknown>, encryption: EncryptionService): Record<string, unknown> {
  if (!encryption.isInitialized()) {
    return obj;
  }

  const result: Record<string, unknown> = { ...obj };

  for (const key of Object.keys(result)) {
    if ((result as Record<string, unknown>)[`${key}_encrypted`] === true && typeof result[key] === 'string') {
      try {
        result[key] = encryption.decryptString(result[key] as string);
        delete (result as Record<string, unknown>)[`${key}_encrypted`];
      } catch (error) {
        logger.warn(`Failed to decrypt field ${key}:`, error);
      }
    }
  }

  return result;
}

export function isEncryptedData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.iv === 'string' && 
         typeof obj.encryptedData === 'string' && 
         typeof obj.tag === 'string' && 
         typeof obj.salt === 'string';
}
