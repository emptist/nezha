import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentIdentityService } from '../services/AgentIdentityService.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import type { AgentContext } from '../services/AgentIdentityService.js';

const mockDb: Partial<DatabaseClient> = {
  query: vi.fn(),
  close: vi.fn(),
  getPool: vi.fn(),
};

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => mockDb),
}));

vi.mock('../services/ApiKeyService.js', () => ({
  ApiKeyService: {
    getInstance: vi.fn().mockReturnValue({
      getCurrentInnerProvider: vi.fn().mockResolvedValue(null),
      setCurrentInnerProvider: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('../services/AgentSessionService.js', () => ({
  getAgentSessionService: vi.fn().mockReturnValue({
    registerSession: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('AgentIdentityService', () => {
  let service: AgentIdentityService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentIdentityService(mockDb as DatabaseClient);
  });

  describe('generateSemanticId', () => {
    const baseContext: AgentContext = {
      project: 'myproject',
      gitHash: 'abc1234',
      machineFingerprint: 'fingerprint123',
      cwd: '/Users/test/myproject',
      source: 'nezha',
      branch: 'main',
    };

    it('should generate S- prefix for outer (non-inner) agents', () => {
      const context: AgentContext = { ...baseContext };
      const id = service.generateSemanticId(context);
      expect(id).toBe('S-nezha-myproject');
    });

    it('should generate I- prefix for inner agents', () => {
      const context: AgentContext = { ...baseContext, inner: true };
      const id = service.generateSemanticId(context);
      expect(id).toBe('I-nezha-myproject');
    });

    it('should include model name in inner agent ID when provided', () => {
      const context: AgentContext = { ...baseContext, inner: true, model: 'tencent/hy3-preview:free' };
      const id = service.generateSemanticId(context);
      expect(id).toBe('I-tencent/hy3-preview:free-myproject');
    });

    it('should include sessionId in inner agent ID', () => {
      const context: AgentContext = {
        ...baseContext,
        inner: true,
        model: 'llama3.2:3b',
        sessionId: '20250430T123456',
      };
      const id = service.generateSemanticId(context);
      expect(id).toBe('I-llama3.2:3b-myproject-20250430T123456');
    });

    it('should not include branch in inner agent ID', () => {
      const context: AgentContext = {
        ...baseContext,
        inner: true,
        model: 'glm-5',
      };
      const id = service.generateSemanticId(context);
      expect(id).toBe('I-glm-5-myproject');
      expect(id).not.toContain('main');
    });

    it('should generate global G- ID when no project', () => {
      const context: AgentContext = {
        project: null,
        gitHash: null,
        machineFingerprint: 'fingerprint123',
        cwd: '/Users/test/nongitproject',
        source: 'nezha',
        branch: undefined,
      };
      const id = service.generateSemanticId(context);
      expect(id).toMatch(/^G-nezha-nongitproject-/);
    });

    it('should include model name in global inner ID', () => {
      const context: AgentContext = {
        project: null,
        gitHash: null,
        machineFingerprint: 'fingerprint123',
        cwd: '/Users/test/nongitproject',
        source: 'nezha',
        inner: true,
        model: 'claude-sonnet-4',
      };
      const id = service.generateSemanticId(context);
      expect(id).toBe('I-claude-sonnet-4');
    });

    it('should use TRAE as source when TRAE detected', () => {
      const context: AgentContext = {
        ...baseContext,
        source: 'TRAE',
        inner: true,
        model: 'hy3-preview',
      };
      const id = service.generateSemanticId(context);
      expect(id).toBe('I-hy3-preview-myproject');
    });

    it('should use "unknown" as default source', () => {
      const context: AgentContext = { ...baseContext, source: undefined };
      const id = service.generateSemanticId(context);
      expect(id).toBe('S-unknown-myproject');
    });

    it('should distinguish hy3-preview from llama3.2 by model name in ID', () => {
      const hy3Id = service.generateSemanticId({ ...baseContext, inner: true, model: 'tencent/hy3-preview:free' });
      const llamaId = service.generateSemanticId({ ...baseContext, inner: true, model: 'llama3.2:3b' });
      expect(hy3Id).toBe('I-tencent/hy3-preview:free-myproject');
      expect(llamaId).toBe('I-llama3.2:3b-myproject');
      expect(hy3Id).not.toBe(llamaId);
    });
  });

  describe('getResolvedIdentity', () => {
    it('should use fallback model when no current provider is configured', async () => {
      const { ApiKeyService } = await import('../services/ApiKeyService.js');
      vi.mocked(ApiKeyService.getInstance).mockReturnValue({
        getCurrentInnerProvider: vi.fn().mockResolvedValue(null),
      } as any);

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const identity = await AgentIdentityService.getResolvedIdentity(true);
      expect(identity.id).toContain('llama3.2');
    });

    it('should use current provider model when configured', async () => {
      const { ApiKeyService } = await import('../services/ApiKeyService.js');
      vi.mocked(ApiKeyService.getInstance).mockReturnValue({
        getCurrentInnerModel: vi.fn().mockResolvedValue({
          provider: 'openrouter',
          model: 'tencent/hy3-preview:free',
        }),
      } as any);

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const identity = await AgentIdentityService.getResolvedIdentity(true);
      expect(identity.id).toContain('hy3-preview');
    });
  });
});
