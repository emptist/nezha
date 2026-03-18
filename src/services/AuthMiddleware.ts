// API Authentication middleware for health endpoints

import * as crypto from 'crypto';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';

export interface AuthConfig {
  requireAuth: boolean;
  adminApiKey?: string;
}

export interface AuthResult {
  authorized: boolean;
  error?: string;
  apiKeyName?: string;
  role?: string;
  userId?: string;
}

export type UserRole = 'user' | 'admin' | 'superadmin' | 'readonly';

export class AuthMiddleware {
  private db?: DatabaseClient;
  private requireAuth: boolean;
  private adminApiKey?: string;

  constructor(db: DatabaseClient | undefined, config?: AuthConfig) {
    this.db = db;
    this.requireAuth = config?.requireAuth ?? false;
    this.adminApiKey = config?.adminApiKey;
  }

  setDatabase(db: DatabaseClient): void {
    this.db = db;
  }

  private extractRole(apiKey: string): UserRole {
    if (this.adminApiKey && apiKey === this.adminApiKey) {
      return 'superadmin';
    }
    return 'user';
  }

  canDecryptSensitiveData(role: UserRole): boolean {
    return role === 'admin' || role === 'superadmin';
  }

  async authenticate(request: Request): Promise<AuthResult> {
    // No auth required
    if (!this.requireAuth && !this.adminApiKey) {
      return { authorized: true };
    }

    // Check for API key in header
    const apiKey =
      request.headers.get('X-API-Key') ||
      request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return { authorized: false, error: 'Missing API key' };
    }

    // Check admin key first
    if (this.adminApiKey && apiKey === this.adminApiKey) {
      return { authorized: true, apiKeyName: 'admin', role: 'superadmin' };
    }

    // Check database for API key
    if (this.db) {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      try {
        const result = await this.db.query<{
          id: string;
          name: string;
          enabled: boolean;
          role: string;
        }>(`SELECT id, name, enabled, role FROM api_keys WHERE key_hash = $1`, [keyHash]);

        if (result.rows.length === 0) {
          return { authorized: false, error: 'Invalid API key' };
        }

        const key = result.rows[0];
        if (!key || !key.enabled) {
          return { authorized: false, error: key ? 'API key disabled' : 'Invalid API key' };
        }

        // Check rate limit
        const rateCheck = await this.db.query<{ allowed: boolean }>(
          `SELECT check_rate_limit($1, (SELECT rate_limit FROM api_keys WHERE key_hash = $1)) as allowed`,
          [keyHash]
        );

        if (!rateCheck.rows[0]?.allowed) {
          return { authorized: false, error: 'Rate limit exceeded' };
        }

        const role = (key.role as UserRole) || 'user';
        const userId = key.id ?? '';
        const apiKeyName = key.name ?? '';
        return { authorized: true, apiKeyName, role, userId };
      } catch (error) {
        logger.error('Auth middleware error:', error);
        return { authorized: false, error: 'Authentication error' };
      }
    }

    return { authorized: false, error: 'Authentication not configured' };
  }

  requireAuthForRoutes(pathname: string): boolean {
    // Health and metrics require auth
    return pathname === '/health' || pathname === '/metrics';
  }
}

// Basic Auth helper
export function parseBasicAuth(
  authHeader: string | null
): { username: string; password: string } | null {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString();
    const parts = decoded.split(':');
    const username = parts[0];
    const password = parts[1];
    if (!username || !password) {
      return null;
    }
    return { username, password };
  } catch {
    return null;
  }
}
