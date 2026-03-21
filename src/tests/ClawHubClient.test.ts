import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClawHubClient } from '../services/ClawHubClient.js';
import { ClawHubSkill } from '../services/SkillReviewer.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ClawHubClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create instance', () => {
    it('should create client with default cache dir', () => {
      const client = new ClawHubClient();
      expect(client).toBeDefined();
    });

    it('should create client with custom cache dir', () => {
      const client = new ClawHubClient('.test-cache');
      expect(client).toBeDefined();
    });
  });

  describe('ClawHubSkill interface', () => {
    it('should define skill structure', () => {
      const skill: ClawHubSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        description: 'A test skill',
        author: 'test-author',
        version: '1.0.0',
        downloads: 100,
        rating: 4.5,
        tags: ['test'],
        repository: 'https://github.com/test/skill',
        verified: true,
        scanStatus: 'clean',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      expect(skill.id).toBe('skill-1');
      expect(skill.scanStatus).toBe('clean');
    });
  });
});
