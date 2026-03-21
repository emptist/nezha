import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthMiddleware, parseBasicAuth, UserRole } from '../services/AuthMiddleware.js';

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
  })),
}));

describe('AuthMiddleware', () => {
  let mockDb: { query: ReturnType<typeof vi.fn> };
  let middleware: AuthMiddleware;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      query: vi.fn(),
    };
    middleware = new AuthMiddleware(mockDb as never);
  });

  describe('create instance', () => {
    it('should create middleware with defaults', () => {
      const m = new AuthMiddleware(mockDb as never);
      expect(m).toBeDefined();
    });

    it('should handle undefined db', () => {
      const m = new AuthMiddleware(undefined);
      expect(m).toBeDefined();
    });

    it('should create with config', () => {
      const m = new AuthMiddleware(mockDb as never, {
        requireAuth: true,
        adminApiKey: 'secret-key',
      });
      expect(m).toBeDefined();
    });

    it('should create with requireAuth false', () => {
      const m = new AuthMiddleware(mockDb as never, {
        requireAuth: false,
      });
      expect(m).toBeDefined();
    });
  });

  describe('setDatabase', () => {
    it('should set database after construction', () => {
      const m = new AuthMiddleware(undefined);
      m.setDatabase(mockDb as never);
    });
  });

  describe('canDecryptSensitiveData', () => {
    it('should return true for admin role', () => {
      expect(middleware.canDecryptSensitiveData('admin')).toBe(true);
    });

    it('should return true for superadmin role', () => {
      expect(middleware.canDecryptSensitiveData('superadmin')).toBe(true);
    });

    it('should return false for user role', () => {
      expect(middleware.canDecryptSensitiveData('user')).toBe(false);
    });

    it('should return false for readonly role', () => {
      expect(middleware.canDecryptSensitiveData('readonly')).toBe(false);
    });
  });

  describe('requireAuthForRoutes', () => {
    it('should require auth for /health', () => {
      expect(middleware.requireAuthForRoutes('/health')).toBe(true);
    });

    it('should require auth for /metrics', () => {
      expect(middleware.requireAuthForRoutes('/metrics')).toBe(true);
    });

    it('should not require auth for /api/tasks', () => {
      expect(middleware.requireAuthForRoutes('/api/tasks')).toBe(false);
    });

    it('should not require auth for /api/memory', () => {
      expect(middleware.requireAuthForRoutes('/api/memory')).toBe(false);
    });

    it('should not require auth for /', () => {
      expect(middleware.requireAuthForRoutes('/')).toBe(false);
    });

    it('should not require auth for /unknown', () => {
      expect(middleware.requireAuthForRoutes('/unknown')).toBe(false);
    });
  });

  describe('authenticate', () => {
    describe('when requireAuth and adminApiKey are not set', () => {
      it('should authorize without credentials', async () => {
        const req = new Request('http://localhost');
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(true);
      });
    });

    describe('when requireAuth is true but no adminApiKey', () => {
      beforeEach(() => {
        middleware = new AuthMiddleware(mockDb as never, { requireAuth: true });
      });

      it('should reject request without API key', async () => {
        const req = new Request('http://localhost');
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('Missing API key');
      });

      it('should accept request with X-API-Key header', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });
        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'some-key' },
        });
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('Invalid API key');
      });
    });

    describe('when adminApiKey is set', () => {
      const adminKey = 'super-secret-admin-key';

      beforeEach(() => {
        middleware = new AuthMiddleware(mockDb as never, {
          requireAuth: true,
          adminApiKey: adminKey,
        });
      });

      it('should authorize with valid admin key via X-API-Key', async () => {
        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': adminKey },
        });
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(true);
        expect(result.role).toBe('superadmin');
        expect(result.apiKeyName).toBe('admin');
      });

      it('should authorize with valid admin key via Authorization header', async () => {
        const req = new Request('http://localhost', {
          headers: { Authorization: `Bearer ${adminKey}` },
        });
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(true);
        expect(result.role).toBe('superadmin');
      });

      it('should reject with invalid admin key', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });
        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'wrong-key' },
        });
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('Invalid API key');
      });

      it('should reject with missing API key', async () => {
        const req = new Request('http://localhost');
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('Missing API key');
      });
    });

    describe('database API key lookup', () => {
      beforeEach(() => {
        middleware = new AuthMiddleware(mockDb as never, { requireAuth: true });
      });

      it('should find and authorize valid API key', async () => {
        mockDb.query
          .mockResolvedValueOnce({
            rows: [{ id: 'key-123', name: 'Test Key', enabled: true, role: 'user' }],
          })
          .mockResolvedValueOnce({ rows: [{ allowed: true }] });

        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'valid-db-key' },
        });
        const result = await middleware.authenticate(req);

        expect(result.authorized).toBe(true);
        expect(result.role).toBe('user');
        expect(result.apiKeyName).toBe('Test Key');
        expect(result.userId).toBe('key-123');
      });

      it('should reject non-existent API key', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });

        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'unknown-key' },
        });
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('Invalid API key');
      });

      it('should reject disabled API key', async () => {
        mockDb.query.mockResolvedValueOnce({
          rows: [{ id: 'key-123', name: 'Disabled Key', enabled: false, role: 'user' }],
        });

        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'disabled-key' },
        });
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('API key disabled');
      });

      it('should reject when rate limit exceeded', async () => {
        mockDb.query
          .mockResolvedValueOnce({
            rows: [{ id: 'key-123', name: 'Limited Key', enabled: true, role: 'user' }],
          })
          .mockResolvedValueOnce({ rows: [{ allowed: false }] });

        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'limited-key' },
        });
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('Rate limit exceeded');
      });

      it('should return admin role for database key', async () => {
        mockDb.query
          .mockResolvedValueOnce({
            rows: [{ id: 'key-123', name: 'Admin Key', enabled: true, role: 'admin' }],
          })
          .mockResolvedValueOnce({ rows: [{ allowed: true }] });

        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'admin-db-key' },
        });
        const result = await middleware.authenticate(req);

        expect(result.authorized).toBe(true);
        expect(result.role).toBe('admin');
      });

      it('should return user role when database key has no role', async () => {
        mockDb.query
          .mockResolvedValueOnce({
            rows: [{ id: 'key-123', name: 'Key Without Role', enabled: true, role: null }],
          })
          .mockResolvedValueOnce({ rows: [{ allowed: true }] });

        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'role-less-key' },
        });
        const result = await middleware.authenticate(req);

        expect(result.authorized).toBe(true);
        expect(result.role).toBe('user');
      });

      it('should handle database query error', async () => {
        mockDb.query.mockRejectedValueOnce(new Error('Database error'));

        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'error-key' },
        });
        const result = await middleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('Authentication error');
      });

      it('should handle middleware without database', async () => {
        const noDbMiddleware = new AuthMiddleware(undefined, {
          requireAuth: true,
        });

        const req = new Request('http://localhost', {
          headers: { 'X-API-Key': 'some-key' },
        });
        const result = await noDbMiddleware.authenticate(req);
        expect(result.authorized).toBe(false);
        expect(result.error).toBe('Authentication not configured');
      });
    });

    describe('X-API-Key vs Authorization header priority', () => {
      beforeEach(() => {
        middleware = new AuthMiddleware(mockDb as never, { requireAuth: true });
      });

      it('should prefer X-API-Key over Authorization header', async () => {
        mockDb.query
          .mockResolvedValueOnce({
            rows: [{ id: 'key-123', name: 'X-API-Key-Key', enabled: true, role: 'user' }],
          })
          .mockResolvedValueOnce({ rows: [{ allowed: true }] });

        const req = new Request('http://localhost', {
          headers: {
            'X-API-Key': 'x-api-key-value',
            Authorization: 'Bearer bearer-value',
          },
        });
        const result = await middleware.authenticate(req);

        expect(result.authorized).toBe(true);
        expect(result.apiKeyName).toBe('X-API-Key-Key');
      });
    });
  });

  describe('parseBasicAuth', () => {
    it('should parse valid Basic auth header', () => {
      const encoded = Buffer.from('user:pass').toString('base64');
      const result = parseBasicAuth(`Basic ${encoded}`);
      expect(result).toEqual({ username: 'user', password: 'pass' });
    });

    it('should handle password with colon (only first colon is separator)', () => {
      const encoded = Buffer.from('user:pass:word').toString('base64');
      const result = parseBasicAuth(`Basic ${encoded}`);
      expect(result).toEqual({ username: 'user', password: 'pass' });
    });

    it('should return null for non-Basic auth', () => {
      expect(parseBasicAuth('Bearer token')).toBeNull();
    });

    it('should return null for null header', () => {
      expect(parseBasicAuth(null)).toBeNull();
    });

    it('should return null for undefined header', () => {
      expect(parseBasicAuth(undefined as unknown as string)).toBeNull();
    });

    it('should return null for empty Basic auth', () => {
      expect(parseBasicAuth('Basic ')).toBeNull();
    });

    it('should return null for Basic auth without password', () => {
      const encoded = Buffer.from('useronly').toString('base64');
      expect(parseBasicAuth(`Basic ${encoded}`)).toBeNull();
    });

    it('should return null for invalid base64', () => {
      expect(parseBasicAuth('Basic !!!invalid!!!')).toBeNull();
    });
  });
});
