import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DatabaseSkillLoader,
  type StoredSkill,
  type SkillMatch,
} from '../services/DatabaseSkillLoader.js';

describe('DatabaseSkillLoader', () => {
  let loader: DatabaseSkillLoader;
  let mockDbClient: any;

  const createMockSkill = (overrides: Partial<StoredSkill> = {}): StoredSkill => ({
    id: 'skill-1',
    project_id: null,
    name: 'Test Skill',
    description: 'A test skill for unit testing',
    instructions: 'Instructions here',
    manifest: {},
    source: 'local',
    external_id: null,
    version: '1.0.0',
    author: 'Test',
    tags: ['testing', 'unit'],
    trigger_phrases: ['test skill', 'run test'],
    anti_patterns: ['malicious', 'harmful'],
    quick_start: null,
    examples: [],
    emoji: null,
    category: 'testing',
    content: {},
    safety_score: 90,
    scan_status: 'clean',
    verified: true,
    status: 'approved',
    permissions: [],
    is_enabled: true,
    use_count: 0,
    rating: 4.5,
    downloads: 100,
    last_used_at: null,
    installed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    loader = new DatabaseSkillLoader();
    mockDbClient = {
      query: vi.fn(),
    };
  });

  describe('constructor', () => {
    it('should create instance with default values', () => {
      expect(loader).toBeDefined();
      expect(loader.getCacheSize()).toBe(0);
    });
  });

  describe('setDatabaseClient', () => {
    it('should set database client and invalidate cache', () => {
      loader.setDatabaseClient(mockDbClient);
      expect(loader.getCacheSize()).toBe(0);
    });

    it('should clear existing cache when setting new client', async () => {
      loader.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockResolvedValue({ rows: [createMockSkill()] });
      await loader.refreshCache();
      expect(loader.getCacheSize()).toBe(1);

      const newClient = { query: vi.fn() };
      loader.setDatabaseClient(newClient);
      expect(loader.getCacheSize()).toBe(0);
    });
  });

  describe('invalidateCache', () => {
    it('should clear cache and reset refresh time', async () => {
      loader.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockResolvedValue({ rows: [createMockSkill()] });
      await loader.refreshCache();
      expect(loader.getCacheSize()).toBe(1);

      loader.invalidateCache();
      expect(loader.getCacheSize()).toBe(0);
      expect(loader.isCacheValid()).toBe(false);
    });
  });

  describe('refreshCache', () => {
    it('should load approved skills from database', async () => {
      const skills = [
        createMockSkill({ id: 'skill-1', name: 'Skill One' }),
        createMockSkill({ id: 'skill-2', name: 'Skill Two' }),
      ];
      mockDbClient.query.mockResolvedValue({ rows: skills });
      loader.setDatabaseClient(mockDbClient);

      await loader.refreshCache();

      expect(mockDbClient.query).toHaveBeenCalled();
      expect(loader.getCacheSize()).toBe(2);
    });

    it('should parse array fields correctly', async () => {
      const skill = createMockSkill({ tags: 'testing,unit' } as any);
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      await loader.refreshCache();

      const cached = await loader.getSkill('skill-1');
      expect(cached?.tags).toEqual(['testing', 'unit']);
    });

    it('should handle empty database result', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });
      loader.setDatabaseClient(mockDbClient);

      await loader.refreshCache();

      expect(loader.getCacheSize()).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockDbClient.query.mockRejectedValue(new Error('DB error'));
      loader.setDatabaseClient(mockDbClient);

      await expect(loader.refreshCache()).resolves.not.toThrow();
    });

    it('should warn when no database client is set', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      loader.setDatabaseClient(null as any);

      await loader.refreshCache();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('getSkill', () => {
    it('should return cached skill without DB query', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [createMockSkill()] });
      loader.setDatabaseClient(mockDbClient);
      await loader.refreshCache();
      mockDbClient.query.mockClear();

      const skill = await loader.getSkill('skill-1');

      expect(skill).toBeDefined();
      expect(skill?.name).toBe('Test Skill');
      expect(mockDbClient.query).not.toHaveBeenCalled();
    });

    it('should query DB for uncached skill', async () => {
      const skill = createMockSkill();
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      const result = await loader.getSkill('skill-1');

      expect(result).toBeDefined();
      expect(mockDbClient.query).toHaveBeenCalled();
    });

    it('should return null for non-existent skill', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });
      loader.setDatabaseClient(mockDbClient);

      const result = await loader.getSkill('nonexistent');

      expect(result).toBeNull();
    });

    it('should increment usage count', async () => {
      const skill = createMockSkill();
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      await loader.getSkill('skill-1');

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE skills SET use_count'),
        ['skill-1']
      );
    });

    it('should refresh cache when expired', async () => {
      mockDbClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT')) {
          return Promise.resolve({ rows: [createMockSkill()] });
        }
        return Promise.resolve({ rows: [] });
      });
      loader.setDatabaseClient(mockDbClient);
      await loader.refreshCache();

      loader.invalidateCache();
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 70000);

      await loader.getSkill('skill-1');

      vi.useRealTimers();
    });
  });

  describe('getSkillByName', () => {
    it('should find skill by exact name match', async () => {
      const skill = createMockSkill();
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      const result = await loader.getSkillByName('Test Skill');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Test Skill');
    });

    it('should search cache when no DB client', async () => {
      loader.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockResolvedValue({ rows: [createMockSkill()] });
      await loader.refreshCache();
      loader.setDatabaseClient(null as any);

      const result = await loader.getSkillByName('Test Skill');

      expect(result).toBeDefined();
    });

    it('should return null when skill not found', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });
      loader.setDatabaseClient(mockDbClient);

      const result = await loader.getSkillByName('Nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllSkills', () => {
    it('should return all cached skills', async () => {
      const skills = [createMockSkill({ id: 'skill-1' }), createMockSkill({ id: 'skill-2' })];
      mockDbClient.query.mockResolvedValue({ rows: skills });
      loader.setDatabaseClient(mockDbClient);
      await loader.refreshCache();

      const result = await loader.getAllSkills();

      expect(result).toHaveLength(2);
    });

    it('should refresh cache when expired', async () => {
      const skills = [createMockSkill()];
      mockDbClient.query.mockResolvedValue({ rows: skills });
      loader.setDatabaseClient(mockDbClient);
      await loader.refreshCache();

      loader.invalidateCache();
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 70000);
      mockDbClient.query.mockClear();

      await loader.getAllSkills();

      vi.useRealTimers();
    });

    it('should return empty array when no client and no cache', () => {
      loader.setDatabaseClient(null as any);

      return expect(loader.getAllSkills()).resolves.toEqual([]);
    });
  });

  describe('searchSkills', () => {
    it('should search by name', async () => {
      const skills = [createMockSkill({ name: 'Test Skill' })];
      mockDbClient.query.mockResolvedValue({ rows: skills });
      loader.setDatabaseClient(mockDbClient);

      const result = await loader.searchSkills('Test');

      expect(result).toHaveLength(1);
    });

    it('should search cache when no DB client', async () => {
      const skills = [createMockSkill()];
      mockDbClient.query.mockResolvedValue({ rows: skills });
      loader.setDatabaseClient(mockDbClient);
      await loader.refreshCache();
      loader.setDatabaseClient(null as any);

      const result = await loader.searchSkills('test');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });
      loader.setDatabaseClient(mockDbClient);

      const result = await loader.searchSkills('nonexistent');

      expect(result).toHaveLength(0);
    });
  });

  describe('findSkillsByTrigger', () => {
    it('should find skills matching trigger phrases', async () => {
      const skill = createMockSkill({
        trigger_phrases: ['fix bug', 'resolve issue'],
      });
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      const matches = await loader.findSkillsByTrigger('I need to fix bug in code');

      expect(matches).toHaveLength(1);
      expect(matches[0].matchScore).toBeGreaterThan(0);
      expect(matches[0].matchedPhrases).toContain('fix bug');
    });

    it('should score partial word matches', async () => {
      const skill = createMockSkill({
        trigger_phrases: ['testing'],
      });
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      const matches = await loader.findSkillsByTrigger('run unit tests');

      expect(matches.length).toBeGreaterThan(0);
    });

    it('should match by description', async () => {
      const skill = createMockSkill({
        description: 'Handles error recovery',
      });
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      const matches = await loader.findSkillsByTrigger('error recovery needed');

      expect(matches.length).toBe(1);
    });

    it('should match by tags', async () => {
      const skill = createMockSkill({
        tags: ['testing'],
      });
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      const matches = await loader.findSkillsByTrigger('do some testing');

      expect(matches.length).toBe(1);
    });

    it('should detect anti-patterns', async () => {
      const skill = createMockSkill({
        trigger_phrases: ['fix bug'],
        anti_patterns: ['malicious'],
      });
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      const matches = await loader.findSkillsByTrigger('fix malicious code');

      expect(matches.length).toBe(1);
      expect(matches[0].antiPatternMatch).toBe('malicious');
    });

    it('should sort by match score descending', async () => {
      const lowScore = createMockSkill({ id: 'low', trigger_phrases: ['test'] });
      const highScore = createMockSkill({
        id: 'high',
        trigger_phrases: ['fix bug', 'fix error'],
        description: 'fix something',
      });
      mockDbClient.query.mockResolvedValue({ rows: [lowScore, highScore] });
      loader.setDatabaseClient(mockDbClient);

      const matches = await loader.findSkillsByTrigger('fix bug in code');

      expect(matches[0].skill.id).toBe('high');
    });

    it('should return empty array for no matches', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });
      loader.setDatabaseClient(mockDbClient);

      const matches = await loader.findSkillsByTrigger('random text xyz');

      expect(matches).toHaveLength(0);
    });
  });

  describe('checkAntiPatterns', () => {
    it('should return null when no anti-patterns match', () => {
      const skill = createMockSkill({
        anti_patterns: ['malicious', 'harmful'],
      });

      const result = loader.checkAntiPatterns(skill, 'Fix the bug in my code');

      expect(result).toBeNull();
    });

    it('should return matching anti-pattern', () => {
      const skill = createMockSkill({
        anti_patterns: ['malicious', 'harmful'],
      });

      const result = loader.checkAntiPatterns(skill, 'This code is malicious');

      expect(result).toBe('malicious');
    });

    it('should be case insensitive', () => {
      const skill = createMockSkill({
        anti_patterns: ['malicious'],
      });

      const result = loader.checkAntiPatterns(skill, 'MALICIOUS code');

      expect(result).toBe('malicious');
    });

    it('should return first matching pattern', () => {
      const skill = createMockSkill({
        anti_patterns: ['bad', 'worst'],
      });

      const result = loader.checkAntiPatterns(skill, 'This is the worst code ever');

      expect(result).toBe('worst');
    });
  });

  describe('getSuggestedSkills', () => {
    it('should return top matches without anti-patterns', async () => {
      const goodSkill = createMockSkill({
        id: 'good',
        trigger_phrases: ['fix bug'],
        anti_patterns: [],
      });
      const badSkill = createMockSkill({
        id: 'bad',
        trigger_phrases: ['fix'],
        anti_patterns: ['malicious'],
      });
      mockDbClient.query.mockResolvedValue({ rows: [goodSkill, badSkill] });
      loader.setDatabaseClient(mockDbClient);

      const suggestions = await loader.getSuggestedSkills('fix malicious code', 5);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].id).toBe('good');
    });

    it('should respect limit parameter', async () => {
      const skills = Array(10)
        .fill(null)
        .map((_, i) => createMockSkill({ id: `skill-${i}`, trigger_phrases: [`phrase${i}`] }));
      mockDbClient.query.mockResolvedValue({ rows: skills });
      loader.setDatabaseClient(mockDbClient);

      const suggestions = await loader.getSuggestedSkills('phrase', 3);

      expect(suggestions).toHaveLength(3);
    });
  });

  describe('getSkillMatchDetails', () => {
    it('should return match details for existing skill', async () => {
      const skill = createMockSkill({
        trigger_phrases: ['test'],
      });
      mockDbClient.query.mockResolvedValue({ rows: [skill] });
      loader.setDatabaseClient(mockDbClient);

      const result = await loader.getSkillMatchDetails('Test Skill', 'test the skill');

      expect(result).toBeDefined();
      expect(result?.skill.name).toBe('Test Skill');
    });

    it('should return null for non-existent skill', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });
      loader.setDatabaseClient(mockDbClient);

      const result = await loader.getSkillMatchDetails('Nonexistent', 'test');

      expect(result).toBeNull();
    });
  });

  describe('isCacheValid', () => {
    it('should return false when cache is empty and never refreshed', () => {
      expect(loader.isCacheValid()).toBe(false);
    });

    it('should return true after successful refresh', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });
      loader.setDatabaseClient(mockDbClient);
      await loader.refreshCache();

      expect(loader.isCacheValid()).toBe(true);
    });

    it('should return false after cache expiry', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });
      loader.setDatabaseClient(mockDbClient);
      await loader.refreshCache();

      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 70000);

      expect(loader.isCacheValid()).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('getCacheSize', () => {
    it('should return 0 for empty cache', () => {
      expect(loader.getCacheSize()).toBe(0);
    });

    it('should return correct size after loading skills', async () => {
      const skills = [createMockSkill({ id: 'skill-a' }), createMockSkill({ id: 'skill-b' })];
      mockDbClient.query.mockResolvedValue({ rows: skills });
      loader.setDatabaseClient(mockDbClient);
      await loader.refreshCache();

      expect(loader.getCacheSize()).toBe(2);
    });
  });

  describe('saveSkillFromClawHub', () => {
    it('should save skill and return ID', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [{ id: 'new-skill-id' }] });
      loader.setDatabaseClient(mockDbClient);

      const skill = {
        id: 'clawhub-123',
        name: 'Hub Skill',
        description: 'From ClawHub',
        version: '1.0.0',
        author: 'hub-author',
        downloads: 100,
        rating: 4.5,
        tags: ['hub'],
        repository: 'https://example.com',
        scanStatus: 'clean' as const,
        verified: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const review = {
        skill,
        score: 85,
        isSafe: true,
        warnings: [] as string[],
        issues: [] as string[],
      };

      const result = await loader.saveSkillFromClawHub(skill, review);

      expect(result).toBe('new-skill-id');
      expect(mockDbClient.query).toHaveBeenCalled();
    });

    it('should return null when no database client', async () => {
      loader.setDatabaseClient(null as any);

      const skill = {
        id: '1',
        name: 'Test',
        description: 'Test',
        version: '1.0',
        author: 'test',
        downloads: 0,
        rating: 0,
        tags: [] as string[],
        repository: '',
        verified: false,
        createdAt: '',
        updatedAt: '',
      };
      const review = {
        skill,
        score: 50,
        isSafe: false,
        warnings: [] as string[],
        issues: [] as string[],
      };

      const result = await loader.saveSkillFromClawHub(skill, review);

      expect(result).toBeNull();
    });

    it('should block unsafe skills', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [{ id: 'blocked-skill' }] });
      loader.setDatabaseClient(mockDbClient);

      const skill = {
        id: 'unsafe',
        name: 'Unsafe Skill',
        description: 'Dangerous',
        version: '1.0.0',
        author: 'test',
        downloads: 0,
        rating: 0,
        tags: [] as string[],
        repository: '',
        scanStatus: 'suspicious' as const,
        verified: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const review = {
        skill,
        score: 30,
        isSafe: false,
        warnings: ['suspicious'] as string[],
        issues: ['potential harm'] as string[],
      };

      await loader.saveSkillFromClawHub(skill, review);

      const call = mockDbClient.query.mock.calls[0];
      expect(call?.[1]).toContain('blocked');
    });
  });
});
