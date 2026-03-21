import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthMiddleware, parseBasicAuth } from '../services/AuthMiddleware.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
  })),
}));

describe('AuthMiddleware', () => {
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      query: vi.fn(),
    };
  });

  describe('create instance', () => {
    it('should create middleware with defaults', () => {
      const middleware = new AuthMiddleware(mockDb as never);
      expect(middleware).toBeDefined();
    });

    it('should handle undefined db', () => {
      const middleware = new AuthMiddleware(undefined);
      expect(middleware).toBeDefined();
    });
  });

  describe('parseBasicAuth', () => {
    it('should parse valid Basic auth header', () => {
      const encoded = Buffer.from('user:pass').toString('base64');
      const result = parseBasicAuth(`Basic ${encoded}`);
      expect(result).toEqual({ username: 'user', password: 'pass' });
    });

    it('should return null for non-Basic auth', () => {
      expect(parseBasicAuth('Bearer token')).toBeNull();
      expect(parseBasicAuth(null)).toBeNull();
    });
  });
});
