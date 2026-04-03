import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const JWT_ALGORITHM = 'HS256';
const ACCESS_TOKEN_EXPIRY = 3600;
const REFRESH_TOKEN_EXPIRY = 604800;

export class JwtService {
  private secret: string;
  private static instance: JwtService | null = null;

  private constructor() {
    const envSecret = process.env.JWT_SECRET ?? process.env.NEZHA_SECRET;
    if (envSecret) {
      this.secret = envSecret;
    } else {
      this.secret = crypto.randomBytes(64).toString('hex');
      logger.warn(
        '[JwtService] No JWT_SECRET or NEZHA_SECRET env var set. ' +
        'Generated a random secret for this session only. ' +
        'Set JWT_SECRET for persistent tokens across restarts.'
      );
    }
  }

  static getInstance(): JwtService {
    if (!JwtService.instance) {
      JwtService.instance = new JwtService();
    }
    return JwtService.instance;
  }

  setSecret(secret: string): void {
    this.secret = secret;
  }

  createTokenPair(userId: string, email: string, role: string): TokenPair {
    const accessToken = this.createAccessToken(userId, email, role);
    const refreshToken = this.createRefreshToken();
    return { accessToken, refreshToken };
  }

  private createAccessToken(userId: string, email: string, role: string): string {
    const header = this.base64UrlEncode(JSON.stringify({ alg: JWT_ALGORITHM, typ: 'JWT' }));
    const payload = this.base64UrlEncode(
      JSON.stringify({
        sub: userId,
        email,
        role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRY,
      })
    );
    const signature = this.sign(`${header}.${payload}`);
    return `${header}.${payload}.${signature}`;
  }

  private createRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  verifyToken(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const header = parts[0] ?? '';
      const payload = parts[1] ?? '';
      const signature = parts[2] ?? '';
      const expectedSignature = this.sign(`${header}.${payload}`);

      if (signature !== expectedSignature) {
        return null;
      }

      const decoded = JSON.parse(this.base64UrlDecode(payload)) as JwtPayload;

      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return decoded;
    } catch (error) {
      logger.error('[JwtService] Token verification failed:', error);
      return null;
    }
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  verifyRefreshToken(refreshToken: string, storedHash: string): boolean {
    return this.hashToken(refreshToken) === storedHash;
  }

  private sign(data: string): string {
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(data);
    return Buffer.from(hmac.digest()).toString('base64url');
  }

  private base64UrlEncode(data: string): string {
    return Buffer.from(data).toString('base64url');
  }

  private base64UrlDecode(data: string): string {
    return Buffer.from(data, 'base64url').toString('utf-8');
  }

  getAccessTokenExpiry(): number {
    return ACCESS_TOKEN_EXPIRY;
  }

  getRefreshTokenExpiry(): number {
    return REFRESH_TOKEN_EXPIRY;
  }
}

export const jwtService = JwtService.getInstance();
