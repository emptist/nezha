import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillSystem, type Skill } from '../core/SkillSystem.js';

describe('SkillSystem', () => {
  let skillSystem: SkillSystem;

  beforeEach(() => {
    skillSystem = new SkillSystem();
  });

  it('should create a skill system instance', () => {
    expect(skillSystem).toBeDefined();
  });

  it('should register a skill', () => {
    const skill: Skill = {
      name: 'test-skill',
      description: 'A test skill',
      execute: vi.fn().mockResolvedValue('result'),
    };
    skillSystem.registerSkill(skill);
    expect(skillSystem.getSkill('test-skill')).toBe(skill);
  });

  it('should list registered skills', () => {
    const skill1: Skill = {
      name: 'skill-1',
      description: 'Skill 1',
      execute: vi.fn(),
    };
    const skill2: Skill = {
      name: 'skill-2',
      description: 'Skill 2',
      execute: vi.fn(),
    };
    skillSystem.registerSkill(skill1);
    skillSystem.registerSkill(skill2);
    expect(skillSystem.listSkills()).toEqual(['skill-1', 'skill-2']);
  });

  it('should get undefined for non-existent skill', () => {
    expect(skillSystem.getSkill('non-existent')).toBeUndefined();
  });

  it('should execute a skill', async () => {
    const skill: Skill = {
      name: 'test-skill',
      description: 'A test skill',
      execute: vi.fn().mockResolvedValue('execution-result'),
    };
    skillSystem.registerSkill(skill);
    const result = await skillSystem.executeSkill('test-skill', { input: 'data' });
    expect(skill.execute).toHaveBeenCalledWith({ input: 'data' });
    expect(result).toBe('execution-result');
  });

  it('should throw error when executing non-existent skill', async () => {
    await expect(skillSystem.executeSkill('non-existent', {})).rejects.toThrow(
      'Skill not found: non-existent'
    );
  });

  it('should overwrite existing skill with same name', () => {
    const skill1: Skill = {
      name: 'test-skill',
      description: 'Original',
      execute: vi.fn(),
    };
    const skill2: Skill = {
      name: 'test-skill',
      description: 'Updated',
      execute: vi.fn(),
    };
    skillSystem.registerSkill(skill1);
    skillSystem.registerSkill(skill2);
    expect(skillSystem.getSkill('test-skill')?.description).toBe('Updated');
  });

  it('should pass various input types to skill', async () => {
    const skill: Skill = {
      name: 'test-skill',
      description: 'Test',
      execute: vi.fn().mockResolvedValue(true),
    };
    skillSystem.registerSkill(skill);

    await skillSystem.executeSkill('test-skill', 'string input');
    await skillSystem.executeSkill('test-skill', 123);
    await skillSystem.executeSkill('test-skill', { key: 'value' });
    await skillSystem.executeSkill('test-skill', [1, 2, 3]);

    expect(skill.execute).toHaveBeenCalledTimes(4);
  });

  it('should handle async skill execution', async () => {
    const skill: Skill = {
      name: 'async-skill',
      description: 'Async skill',
      execute: vi.fn().mockImplementation(() => Promise.resolve('async-result')),
    };
    skillSystem.registerSkill(skill);
    const result = await skillSystem.executeSkill('async-skill', {});
    expect(result).toBe('async-result');
  });

  it('should handle skill execution errors', async () => {
    const skill: Skill = {
      name: 'failing-skill',
      description: 'Failing skill',
      execute: vi.fn().mockRejectedValue(new Error('Skill failed')),
    };
    skillSystem.registerSkill(skill);
    await expect(skillSystem.executeSkill('failing-skill', {})).rejects.toThrow('Skill failed');
  });
});
