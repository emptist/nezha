import { DatabaseClient } from '../db/DatabaseClient.js';
import {
  EncryptionService,
  getEncryptionService,
  type EncryptedData,
} from './EncryptionService.js';
import { logger } from '../utils/logger.js';

export interface StoredApiKey {
  id: string;
  provider: string;
  encryptedKey: string;
  encryptedIv: string;
  encryptedTag: string;
  encryptedSalt: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedApiKey {
  id: string;
  provider: string;
  apiKey: string;
}

export interface UserApiKey {
  id: string;
  name: string;
  keyHash: string;
  role: string;
  enabled: boolean;
  encryptedValue?: string;
  encryptedIv?: string;
  encryptedTag?: string;
  encryptedSalt?: string;
}

export class ApiKeyService {
  private readonly db: DatabaseClient;
  private readonly encryption: EncryptionService;
  private static instance: ApiKeyService | null = null;

  static resetInstance(): void {
    ApiKeyService.instance = null;
  }

  private constructor(db: DatabaseClient, encryption: EncryptionService) {
    this.db = db;
    this.encryption = encryption;
  }

  static getInstance(db: DatabaseClient): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService(db, getEncryptionService());
    }
    return ApiKeyService.instance;
  }

  async storeApiKey(provider: string, apiKey: string): Promise<void> {
    if (!process.env.NEZHA_SECRET) {
      throw new Error('NEZHA_SECRET not set. Encryption unavailable.');
    }

    const encrypted = await this.encryption.encrypt(apiKey);

    await this.db.query(
      `INSERT INTO provider_api_keys (provider, encrypted_key, encrypted_iv, encrypted_tag, encrypted_salt, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (provider) DO UPDATE SET 
         encrypted_key = $2,
         encrypted_iv = $3,
         encrypted_tag = $4,
         encrypted_salt = $5,
         updated_at = NOW()`,
      [provider, encrypted.encryptedData, encrypted.iv, encrypted.tag, encrypted.salt]
    );

    logger.info(`API key for provider '${provider}' stored encrypted`);
  }

  async getApiKey(provider: string): Promise<string | null> {
    if (!process.env.NEZHA_SECRET) {
      throw new Error('NEZHA_SECRET not set. Encryption unavailable.');
    }

    const result = await this.db.query<{
      encrypted_key: string;
      encrypted_iv: string;
      encrypted_tag: string;
      encrypted_salt: string;
    }>(
      `SELECT encrypted_key, encrypted_iv, encrypted_tag, encrypted_salt 
       FROM provider_api_keys WHERE provider = $1`,
      [provider]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) return null;

    const encryptedData: EncryptedData = {
      encryptedData: row.encrypted_key,
      iv: row.encrypted_iv,
      tag: row.encrypted_tag,
      salt: row.encrypted_salt,
    };

    return await this.encryption.decrypt(encryptedData);
  }

  async deleteApiKey(provider: string): Promise<void> {
    await this.db.query(`DELETE FROM provider_api_keys WHERE provider = $1`, [provider]);
    logger.info(`API key for provider '${provider}' deleted`);
  }

  async listProviders(): Promise<string[]> {
    const result = await this.db.query<{ provider: string }>(
      `SELECT provider FROM provider_api_keys ORDER BY provider`
    );
    return result.rows.map(r => r.provider);
  }

  async hasApiKey(provider: string): Promise<boolean> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM provider_api_keys WHERE provider = $1`,
      [provider]
    );
    return parseInt(result.rows[0]?.count || '0', 10) > 0;
  }

  async storeUserApiKeyEncrypted(apiKeyId: string, apiKey: string): Promise<void> {
    if (!process.env.NEZHA_SECRET) {
      throw new Error('NEZHA_SECRET not set. Encryption unavailable.');
    }

    const encrypted = await this.encryption.encrypt(apiKey);

    await this.db.query(
      `UPDATE api_keys SET 
        encrypted_value = $1,
        encrypted_iv = $2,
        encrypted_tag = $3,
        encrypted_salt = $4
       WHERE id = $5`,
      [encrypted.encryptedData, encrypted.iv, encrypted.tag, encrypted.salt, apiKeyId]
    );

    logger.info(`User API key '${apiKeyId}' stored encrypted`);
  }

  async getUserApiKeyDecrypted(apiKeyId: string, userRole: string): Promise<string | null> {
    if (!process.env.NEZHA_SECRET) {
      throw new Error('NEZHA_SECRET not set. Encryption unavailable.');
    }

    if (userRole !== 'admin' && userRole !== 'superadmin') {
      logger.warn(`User role '${userRole}' denied access to decrypt API key ${apiKeyId}`);
      return null;
    }

    const result = await this.db.query<{
      encrypted_value: string;
      encrypted_iv: string;
      encrypted_tag: string;
      encrypted_salt: string;
    }>(
      `SELECT encrypted_value, encrypted_iv, encrypted_tag, encrypted_salt 
       FROM api_keys WHERE id = $1 AND encrypted_value IS NOT NULL`,
      [apiKeyId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) return null;
    const rowData = row;

    const encryptedData: EncryptedData = {
      encryptedData: rowData.encrypted_value,
      iv: rowData.encrypted_iv,
      tag: rowData.encrypted_tag,
      salt: rowData.encrypted_salt,
    };

    return await this.encryption.decrypt(encryptedData);
  }

  async listUserApiKeys(
    _userRole: string
  ): Promise<
    Omit<UserApiKey, 'encryptedValue' | 'encryptedIv' | 'encryptedTag' | 'encryptedSalt'>[]
  > {
    const result = await this.db.query<{
      id: string;
      name: string;
      key_hash: string;
      role: string;
      enabled: boolean;
    }>(`SELECT id, name, key_hash, role, enabled FROM api_keys ORDER BY created_at DESC`);

    return result.rows.map(r => ({
      id: r.id,
      name: r.name,
      keyHash: r.key_hash,
      role: r.role,
      enabled: r.enabled,
    }));
  }

  async getCurrentInnerProvider(): Promise<{ provider: string; apiKey: string; model: string } | null> {
    const result = await this.db.query<{
      provider: string;
      encrypted_key: string;
      encrypted_iv: string;
      encrypted_tag: string;
      encrypted_salt: string;
      model: string | null;
    }>(`SELECT provider, encrypted_key, encrypted_iv, encrypted_tag, encrypted_salt, model
        FROM provider_api_keys WHERE status = 'in_use' LIMIT 1`);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0]!;
    return {
      provider: row.provider,
      model: row.model || 'llama3.2:3b',
      apiKey: await this.encryption.decrypt({
        encryptedData: row.encrypted_key,
        iv: row.encrypted_iv,
        tag: row.encrypted_tag,
        salt: row.encrypted_salt,
      }),
    };
  }

  async getCurrentInnerModel(): Promise<{ provider: string; model: string } | null> {
    const result = await this.db.query<{
      provider: string;
      model: string | null;
    }>(`SELECT provider, model FROM provider_api_keys WHERE status = 'in_use' LIMIT 1`);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0]!;
    return {
      provider: row.provider,
      model: row.model || 'llama3.2:3b',
    };
  }

  async getFallbackInnerProvider(): Promise<{ provider: string; apiKey: string; model: string } | null> {
    const result = await this.db.query<{
      provider: string;
      encrypted_key: string;
      encrypted_iv: string;
      encrypted_tag: string;
      encrypted_salt: string;
      model: string | null;
    }>(`SELECT provider, encrypted_key, encrypted_iv, encrypted_tag, encrypted_salt, model
        FROM provider_api_keys WHERE status = 'fallback' LIMIT 1`);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0]!;
    return {
      provider: row.provider,
      model: row.model || 'llama3.2:3b',
      apiKey: await this.encryption.decrypt({
        encryptedData: row.encrypted_key,
        iv: row.encrypted_iv,
        tag: row.encrypted_tag,
        salt: row.encrypted_salt,
      }),
    };
  }

  async setCurrentInnerProvider(provider: string, model?: string): Promise<void> {
    await this.db.query(`UPDATE provider_api_keys SET status = 'not_used'`);
    const updates: string[] = ["status = 'in_use'"];
    const values: any[] = [provider];

    if (model) {
      updates.push(`model = $2`);
      values.push(model);
    }

    await this.db.query(
      `UPDATE provider_api_keys SET ${updates.join(', ')} WHERE provider = $1`,
      values
    );
    logger.info(`Inner AI provider set to '${provider}'${model ? ` with model '${model}'` : ''}`);
  }

  async setCurrentModel(model: string): Promise<void> {
    await this.db.query(
      `UPDATE provider_api_keys SET model = $1 WHERE status = 'in_use'`,
      [model]
    );
    logger.info(`Current inner model set to '${model}'`);
  }

  async setFallbackProvider(provider: string, model?: string): Promise<void> {
    await this.db.query(`UPDATE provider_api_keys SET status = 'not_used' WHERE status = 'fallback'`);
    const updates: string[] = ["status = 'fallback'"];
    const values: any[] = [provider];

    if (model) {
      updates.push(`model = $2`);
      values.push(model);
    }

    await this.db.query(
      `UPDATE provider_api_keys SET ${updates.join(', ')} WHERE provider = $1`,
      values
    );
    logger.info(`Fallback provider set to '${provider}'${model ? ` with model '${model}'` : ''}`);
  }
}

export const getApiKeyService = (db: DatabaseClient): ApiKeyService => {
  return ApiKeyService.getInstance(db);
};
