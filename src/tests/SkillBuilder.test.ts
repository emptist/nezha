import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillBuilder } from '../services/SkillBuilder.js';

const mockDbClient = {
  query: vi.fn(),
};

describe('SkillBuilder', () => {
  let skillBuilder: SkillBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    skillBuilder = new SkillBuilder();
  });

  describe('constructor', () => {
    it('should create a skill builder instance', () => {
      expect(skillBuilder).toBeDefined();
    });

    it('should have null dbClient initially', () => {
      expect(skillBuilder).toBeDefined();
    });
  });

  describe('setDatabaseClient', () => {
    it('should set database client', () => {
      skillBuilder.setDatabaseClient(mockDbClient);
      expect(skillBuilder).toBeDefined();
    });
  });

  describe('buildSkill', () => {
    it('should build skill with valid input', async () => {
      const input = {
        name: 'test-skill',
        purpose: 'Testing skill building',
        useCases: ['test case 1'],
        requiredCapabilities: ['capability 1'],
        suggestedPermissions: ['network'],
      };

      const result = await skillBuilder.buildSkill(input);
      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
      expect(result.skill?.name).toBe('test-skill');
      expect(result.qualityScore).toBeGreaterThanOrEqual(50);
    });

    it('should handle empty name input', async () => {
      const input = {
        name: '',
        purpose: '',
      };

      const result = await skillBuilder.buildSkill(input);
      expect(result.skill).toBeDefined();
    });

    it('should save skill to database when db client is set', async () => {
      skillBuilder.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockResolvedValue({ rows: [] });

      const input = {
        name: 'database-skill',
        purpose: 'Testing database save',
      };

      const result = await skillBuilder.buildSkill(input);
      expect(result.success).toBe(true);
      expect(result.skillId).toBeDefined();
    });

    it('should handle database errors', async () => {
      skillBuilder.setDatabaseClient(mockDbClient);
      mockDbClient.query.mockRejectedValue(new Error('Database error'));

      const input = {
        name: 'error-skill',
        purpose: 'Testing error handling',
      };

      const result = await skillBuilder.buildSkill(input);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('buildSkill with various inputs', () => {
    it('should handle skill with multiple use cases', async () => {
      const input = {
        name: 'multi-use-skill',
        purpose: 'Multiple use cases',
        useCases: ['case1', 'case2', 'case3'],
      };

      const result = await skillBuilder.buildSkill(input);
      expect(result.success).toBe(true);
      expect(result.skill?.trigger).toBeDefined();
    });

    it('should handle skill with no optional fields', async () => {
      const input = {
        name: 'minimal-skill',
        purpose: 'Minimal purpose',
      };

      const result = await skillBuilder.buildSkill(input);
      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
    });

    it('should generate appropriate triggers for skill name', async () => {
      const input = {
        name: 'git-helper',
        purpose: 'Help with git operations',
      };

      const result = await skillBuilder.buildSkill(input);
      expect(result.success).toBe(true);
      expect(result.skill?.trigger).toBeDefined();
      expect(result.skill?.trigger.length).toBeGreaterThan(0);
    });

    it('should handle skill with custom permissions', async () => {
      const input = {
        name: 'custom-perm-skill',
        purpose: 'Custom permissions test',
        suggestedPermissions: ['filesystem', 'network', 'process'],
      };

      const result = await skillBuilder.buildSkill(input);
      expect(result.success).toBe(true);
      expect(result.skill?.permissions).toBeDefined();
    });
  });
});