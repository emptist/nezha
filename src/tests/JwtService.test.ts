import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JwtService, jwtService } from '../../src/services/JwtService.js';

const resetJwtService = () => {
  (JwtService as unknown as { instance: null }).instance = null;
};

describe('JwtService', () => {
  const TEST_SECRET = 'test-secret-key-for-jwt-testing-12345';

  beforeEach(() => {
    resetJwtService();
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    resetJwtService();
    delete process.env.JWT_SECRET;
    delete process.env.NEZHA_SECRET;
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = JwtService.getInstance();
      const instance2 = JwtService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('constructor', () => {
    it('should use JWT_SECRET env var when set', () => {
      const service = JwtService.getInstance();
      expect(service).toBeDefined();
    });

    it('should fallback to NEZHA_SECRET when JWT_SECRET not set', () => {
      delete process.env.JWT_SECRET;
      process.env.NEZHA_SECRET = 'nezha-secret';
      resetJwtService();
      const service = JwtService.getInstance();
      expect(service).toBeDefined();
    });

    it('should generate random secret when neither env var is set', () => {
      delete process.env.JWT_SECRET;
      delete process.env.NEZHA_SECRET;
      resetJwtService();
      const service = JwtService.getInstance();
      expect(service).toBeDefined();
    });
  });

  describe('createTokenPair', () => {
    it('should create access and refresh tokens', () => {
      const service = JwtService.getInstance();
      const tokens = service.createTokenPair('user-1', 'test@example.com', 'user');

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(tokens.accessToken.length).toBeGreaterThan(0);
      expect(tokens.refreshToken.length).toBeGreaterThan(0);
    });

    it('should create different tokens for each call', () => {
      const service = JwtService.getInstance();
      const tokens1 = service.createTokenPair('user-1', 'test@example.com', 'user');
      const tokens2 = service.createTokenPair('user-1', 'test@example.com', 'user');

      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const service = JwtService.getInstance();
      const { accessToken } = service.createTokenPair('user-1', 'test@example.com', 'admin');

      const payload = service.verifyToken(accessToken);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('user-1');
      expect(payload?.email).toBe('test@example.com');
      expect(payload?.role).toBe('admin');
    });

    it('should return null for invalid token format', () => {
      const service = JwtService.getInstance();
      const result = service.verifyToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for tampered token', () => {
      const service = JwtService.getInstance();
      const { accessToken } = service.createTokenPair('user-1', 'test@example.com', 'user');

      const parts = accessToken.split('.');
      parts[1] = 'tamperedpayload';
      const tamperedToken = parts.join('.');

      const result = service.verifyToken(tamperedToken);
      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      const service = JwtService.getInstance();

      const header = service['base64UrlEncode'](JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = service['base64UrlEncode'](
        JSON.stringify({
          sub: 'user-1',
          email: 'test@test.com',
          role: 'user',
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600,
        })
      );
      const signature = service['sign'](`${header}.${payload}`);
      const expiredToken = `${header}.${payload}.${signature}`;

      const result = service.verifyToken(expiredToken);
      expect(result).toBeNull();
    });
  });

  describe('token payload structure', () => {
    it('should include iat (issued at) timestamp', () => {
      const service = JwtService.getInstance();
      const { accessToken } = service.createTokenPair('user-1', 'test@example.com', 'user');
      const payload = service.verifyToken(accessToken);

      expect(payload?.iat).toBeDefined();
      expect(typeof payload?.iat).toBe('number');
    });

    it('should include exp (expiration) timestamp', () => {
      const service = JwtService.getInstance();
      const { accessToken } = service.createTokenPair('user-1', 'test@example.com', 'user');
      const payload = service.verifyToken(accessToken);

      expect(payload?.exp).toBeDefined();
      expect(payload?.exp).toBeGreaterThan(payload?.iat || 0);
    });
  });

  describe('hashToken and verifyRefreshToken', () => {
    it('should hash a refresh token consistently', () => {
      const service = JwtService.getInstance();
      const token = 'some-refresh-token-value';
      const hash1 = service.hashToken(token);
      const hash2 = service.hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(token);
      expect(hash1.length).toBe(64);
    });

    it('should verify refresh token against stored hash', () => {
      const service = JwtService.getInstance();
      const { refreshToken } = service.createTokenPair('user-1', 'test@example.com', 'user');
      const storedHash = service.hashToken(refreshToken);

      expect(service.verifyRefreshToken(refreshToken, storedHash)).toBe(true);
    });

    it('should reject wrong refresh token', () => {
      const service = JwtService.getInstance();
      const { refreshToken: token1 } = service.createTokenPair('user-1', 'test@example.com', 'user');
      const { refreshToken: token2 } = service.createTokenPair('user-2', 'other@test.com', 'user');
      const hash1 = service.hashToken(token1);

      expect(service.verifyRefreshToken(token2, hash1)).toBe(false);
    });
  });

  describe('setSecret', () => {
    it('should change the signing secret', () => {
      const service = JwtService.getInstance();
      const { accessToken: token1 } = service.createTokenPair('user-1', 'test@example.com', 'user');

      service.setSecret('new-secret-key');

      const result = service.verifyToken(token1);
      expect(result).toBeNull();
    });
  });

  describe('expiry constants', () => {
    it('should return correct access token expiry', () => {
      const service = JwtService.getInstance();
      expect(service.getAccessTokenExpiry()).toBe(3600);
    });

    it('should return correct refresh token expiry', () => {
      const service = JwtService.getInstance();
      expect(service.getRefreshTokenExpiry()).toBe(604800);
    });
  });

  describe('exported singleton', () => {
    it('should export a working singleton instance', () => {
      expect(jwtService).toBeDefined();
      expect(jwtService).toBeInstanceOf(JwtService);

      const tokens = jwtService.createTokenPair('test-user', 'test@test.com', 'user');
      const verified = jwtService.verifyToken(tokens.accessToken);
      expect(verified?.sub).toBe('test-user');
    });
  });
});
