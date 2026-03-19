import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillSystem } from '../core/SkillSystem.js';
import { databaseSkillLoader } from '../services/DatabaseSkillLoader.js';

const mockDbClient = {
  query: vi.fn(),
};

describe('SkillSystem', () => {
  let skillSystem: SkillSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    skillSystem = new SkillSystem();
    skillSystem.setDatabaseClient(mockDbClient);
    databaseSkillLoader.setDatabaseClient(mockDbClient);
  });

  it('should create a skill system instance', () => {
    expect(skillSystem).toBeDefined();
  });

  it('should initialize with database client', async () => {
    mockDbClient.query.mockResolvedValue({ rows: [] });
    await skillSystem.initialize();
    expect(skillSystem).toBeDefined();
  });

  it('should get skill by name from database', async () => {
    const mockSkill = {
      id: 'skill-1',
      name: 'test-skill',
      description: 'A test skill',
      instructions: 'Test instructions',
      manifest: {},
      source: 'clawhub' as const,
      project_id: null,
      external_id: 'test-skill',
      version: '1.0.0',
      author: 'test',
      tags: ['test'],
      safety_score: 95,
      scan_status: 'clean' as const,
      verified: true,
      status: 'approved' as const,
      permissions: ['network'],
      is_enabled: true,
      use_count: 10,
      last_used_at: null,
      installed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockDbClient.query
      .mockResolvedValueOnce({ rows: [mockSkill] })
      .mockResolvedValueOnce({ rows: [] });

    const skill = await skillSystem.getSkill('test-skill');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('test-skill');
    expect(skill?.instructions).toBe('Test instructions');
  });

  it('should return null for non-existent skill', async () => {
    mockDbClient.query.mockResolvedValue({ rows: [] });

    const skill = await skillSystem.getSkill('non-existent');
    expect(skill).toBeNull();
  });

  it('should list all approved skills', async () => {
    const mockSkills = [
      {
        id: 'skill-1',
        name: 'skill-1',
        description: 'Skill 1',
        instructions: 'Instructions 1',
        manifest: {},
        source: 'clawhub' as const,
        project_id: null,
        external_id: 'skill-1',
        version: '1.0.0',
        author: 'test',
        tags: [],
        safety_score: 90,
        scan_status: 'clean' as const,
        verified: true,
        status: 'approved' as const,
        permissions: [],
        is_enabled: true,
        use_count: 0,
        last_used_at: null,
        installed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    mockDbClient.query.mockResolvedValue({ rows: mockSkills });

    const skills = await skillSystem.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('skill-1');
  });

  it('should search skills by query', async () => {
    const mockSkills = [
      {
        id: 'skill-1',
        name: 'git-master',
        description: 'Git operations',
        instructions: 'Git instructions',
        manifest: {},
        source: 'clawhub' as const,
        project_id: null,
        external_id: 'git-master',
        version: '1.0.0',
        author: 'test',
        tags: ['git', 'version-control'],
        safety_score: 95,
        scan_status: 'clean' as const,
        verified: true,
        status: 'approved' as const,
        permissions: [],
        is_enabled: true,
        use_count: 0,
        last_used_at: null,
        installed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    mockDbClient.query.mockResolvedValue({ rows: mockSkills });

    const results = await skillSystem.searchSkills('git');
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('git-master');
  });

  it('should execute skill and return result', async () => {
    const mockSkill = {
      id: 'skill-1',
      name: 'test-skill',
      description: 'A test skill',
      instructions: 'Test instructions',
      manifest: {},
      source: 'clawhub' as const,
      project_id: null,
      external_id: 'test-skill',
      version: '1.0.0',
      author: 'test',
      tags: [],
      safety_score: 95,
      scan_status: 'clean' as const,
      verified: true,
      status: 'approved' as const,
      permissions: [],
      is_enabled: true,
      use_count: 0,
      last_used_at: null,
      installed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockDbClient.query
      .mockResolvedValueOnce({ rows: [mockSkill] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await skillSystem.executeSkill('test-skill', { input: 'data' });

    expect(result.success).toBe(true);
    expect(result.skillName).toBe('test-skill');
    expect(result.output).toBeDefined();
  });

  it('should return error result for non-existent skill execution', async () => {
    mockDbClient.query.mockResolvedValue({ rows: [] });

    const result = await skillSystem.executeSkill('non-existent', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Skill not found: non-existent');
  });

  it('should get cache stats', () => {
    const stats = skillSystem.getCacheStats();
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('valid');
  });

  it('should refresh skills cache', async () => {
    mockDbClient.query.mockResolvedValue({ rows: [] });

    await skillSystem.refreshSkills();

    const stats = skillSystem.getCacheStats();
    expect(stats.size).toBe(0);
  });
});
