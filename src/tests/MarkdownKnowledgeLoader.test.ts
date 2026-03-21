import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MarkdownKnowledgeLoader,
  KNOWLEDGE_FILE_TYPES,
  DEFAULT_KNOWLEDGE_DIRS,
} from '../services/MarkdownKnowledgeLoader.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MarkdownKnowledgeLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create instance', () => {
    it('should create loader', () => {
      const loader = new MarkdownKnowledgeLoader();
      expect(loader).toBeDefined();
    });
  });

  describe('exported constants', () => {
    it('should export KNOWLEDGE_FILE_TYPES', () => {
      expect(KNOWLEDGE_FILE_TYPES['SOUL.md']).toBe('soul');
      expect(KNOWLEDGE_FILE_TYPES['AGENTS.md']).toBe('agents');
      expect(KNOWLEDGE_FILE_TYPES['USER.md']).toBe('user');
    });

    it('should export DEFAULT_KNOWLEDGE_DIRS', () => {
      expect(DEFAULT_KNOWLEDGE_DIRS).toContain('.');
      expect(DEFAULT_KNOWLEDGE_DIRS).toContain('./knowledge');
      expect(DEFAULT_KNOWLEDGE_DIRS).toContain('./docs');
    });
  });
});
