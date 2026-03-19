import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraeSkillSyncService } from '../services/TraeSkillSyncService.js';

const mockDbClient = {
  query: vi.fn(),
};

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue(['skill1.md', 'skill2.md']),
    unlinkSync: vi.fn(),
  },
}));

describe('TraeSkillSyncService', () => {
  let service: TraeSkillSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TraeSkillSyncService();
  });

  describe('constructor', () => {
    it('should create a trae skill sync service instance', () => {
      expect(service).toBeDefined();
    });
  });

  describe('setDatabaseClient', () => {
    it('should set database client', () => {
      service.setDatabaseClient(mockDbClient);
      expect(service).toBeDefined();
    });
  });

  describe('syncToTrae', () => {
    it('should return error when no database client is set', async () => {
      const result = await service.syncToTrae();
      expect(result.synced).toBe(0);
      expect(result.errors).toContain('No database client configured');
    });

    it('should sync skills when database client is set', async () => {
      service.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockResolvedValue({
        rows: [
          {
            id: 'skill-1',
            name: 'test-skill',
            description: 'Test skill',
            instructions: 'Test instructions',
            manifest: {},
            source: 'clawhub',
            version: '1.0.0',
            author: 'test',
            tags: ['test'],
          },
        ],
      });

      const result = await service.syncToTrae();
      expect(result.synced).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple skills', async () => {
      service.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockResolvedValue({
        rows: [
          {
            id: 'skill-1',
            name: 'skill-one',
            description: 'Skill One',
            instructions: 'Instructions One',
            manifest: {},
            source: 'clawhub',
            version: '1.0.0',
            author: 'test',
            tags: ['tag1'],
          },
          {
            id: 'skill-2',
            name: 'skill-two',
            description: 'Skill Two',
            instructions: 'Instructions Two',
            manifest: {},
            source: 'clawhub',
            version: '1.0.0',
            author: 'test',
            tags: ['tag2'],
          },
        ],
      });

      const result = await service.syncToTrae();
      expect(result.synced).toBe(2);
    });

    it('should handle empty skills list', async () => {
      service.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockResolvedValue({ rows: [] });

      const result = await service.syncToTrae();
      expect(result.synced).toBe(0);
    });

    it('should handle database errors', async () => {
      service.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockRejectedValue(new Error('Database error'));

      const result = await service.syncToTrae();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});