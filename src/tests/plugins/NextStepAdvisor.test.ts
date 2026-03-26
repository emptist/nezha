import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextStepAdvisor, type NextStepAdvisorConfig } from '../../plugins/NextStepAdvisor.js';

vi.mock('../../utils/git.js', () => ({
  getGitDiff: vi.fn(),
  getGitBranch: vi.fn(),
  isGitDirty: vi.fn(),
  getLastCommitMessage: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn(),
}));

describe('NextStepAdvisor', () => {
  let advisor: NextStepAdvisor;

  beforeEach(() => {
    advisor = new NextStepAdvisor({ enabled: true });
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const defaultAdvisor = new NextStepAdvisor();
      expect(defaultAdvisor.name).toBe('next-step-advisor');
      expect(defaultAdvisor.version).toBe('1.0.0');
      expect(defaultAdvisor.config.enabled).toBe(true);
      expect(defaultAdvisor.config.suggestOnCommit).toBe(true);
      expect(defaultAdvisor.config.suggestOnTask).toBe(true);
    });

    it('should accept custom config', () => {
      const config: NextStepAdvisorConfig = {
        enabled: false,
        minFilesChanged: 5,
        suggestOnCommit: false,
        suggestOnTask: false,
        broadcastSuggestions: false,
      };
      const customAdvisor = new NextStepAdvisor(config);
      expect(customAdvisor.config.enabled).toBe(false);
      expect(customAdvisor.config.minFilesChanged).toBe(5);
      expect(customAdvisor.config.suggestOnCommit).toBe(false);
    });

    it('should have proper description', () => {
      expect(advisor.description).toBe(
        'Analyzes changes and suggests next steps at key breakpoints'
      );
    });
  });

  describe('hooks', () => {
    it('should have afterTaskWithChanges hook', () => {
      expect(advisor.hooks.afterTaskWithChanges).toBeDefined();
      expect(typeof advisor.hooks.afterTaskWithChanges).toBe('function');
    });

    it('should have afterCommit hook', () => {
      expect(advisor.hooks.afterCommit).toBeDefined();
      expect(typeof advisor.hooks.afterCommit).toBe('function');
    });

    it('should have onStartup hook', () => {
      expect(advisor.hooks.onStartup).toBeDefined();
      expect(typeof advisor.hooks.onStartup).toBe('function');
    });

    it('afterTaskWithChanges should be async', async () => {
      const hook = advisor.hooks.afterTaskWithChanges;
      const result = await hook({ taskId: 'test', title: 'test', status: 'COMPLETED' }, []);
      expect(result).toBeUndefined();
    });

    it('afterCommit should be async', async () => {
      const hook = advisor.hooks.afterCommit;
      const result = await hook(
        { commitHash: 'abc123', message: 'test', files: [], author: 'test', timestamp: new Date() },
        []
      );
      expect(result).toBeUndefined();
    });
  });

  describe('config', () => {
    it('should set default minFilesChanged to 1', () => {
      const advisor = new NextStepAdvisor();
      expect(advisor.config.minFilesChanged).toBe(1);
    });

    it('should default broadcastSuggestions to true', () => {
      const advisor = new NextStepAdvisor();
      expect(advisor.config.broadcastSuggestions).toBe(true);
    });
  });
});
