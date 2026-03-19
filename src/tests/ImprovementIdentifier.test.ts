import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImprovementIdentifier, type Improvement, type SystemStatus } from '../core/ImprovementIdentifier.js';

vi.mock('fs-extra', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue(''),
    readdir: vi.fn().mockResolvedValue([]),
    pathExists: vi.fn().mockResolvedValue(true),
    readJson: vi.fn().mockResolvedValue({}),
    stat: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../db/DatabaseClient.js', () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    close: vi.fn(),
  })),
}));

vi.mock('../config/Config.js', () => ({
  Config: {
    getInstance: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ host: 'localhost', port: 5432, database: 'test' }),
    }),
  },
}));

describe('ImprovementIdentifier', () => {
  let identifier: ImprovementIdentifier;
  const mockProjectRoot = '/mock/project';

  beforeEach(() => {
    identifier = new ImprovementIdentifier(mockProjectRoot);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create with default project root', () => {
      const defaultIdentifier = new ImprovementIdentifier();
      expect(defaultIdentifier).toBeDefined();
    });

    it('should create with custom project root', () => {
      expect(identifier).toBeDefined();
    });
  });

  describe('identify', () => {
    it('should return improvements array', async () => {
      const improvements = await identifier.identify();
      
      expect(Array.isArray(improvements)).toBe(true);
    });
  });
  });

  describe('prioritizeImprovements', () => {
    it('should sort by priority descending', () => {
      const improvements: Improvement[] = [
        { type: 'improvement', title: 'Low', description: 'Low', priority: 1, category: 'code', autoFixable: false },
        { type: 'critical', title: 'High', description: 'High', priority: 10, category: 'code', autoFixable: false },
        { type: 'optimization', title: 'Medium', description: 'Medium', priority: 5, category: 'code', autoFixable: true },
      ];

      const prioritized = (identifier as any).prioritizeImprovements(improvements);
      
      expect(prioritized[0].priority).toBe(10);
      expect(prioritized[2].priority).toBe(1);
    });

    it('should return empty array for empty input', () => {
      const prioritized = (identifier as any).prioritizeImprovements([]);
      
      expect(prioritized).toHaveLength(0);
    });
  });

  describe('analyzeSystemStatus', () => {
    it('should return empty array for healthy system', () => {
      const status: SystemStatus = {
        database: { connected: true },
        codeQuality: { hasIssues: false, issues: [] },
        documentation: { complete: true, missing: [] },
        testCoverage: { percentage: 80, missing: [] },
        git: { hasUncommittedChanges: false, hasUnpushedCommits: false },
      };

      const improvements = (identifier as any).analyzeSystemStatus(status);
      
      expect(Array.isArray(improvements)).toBe(true);
    });

    it('should flag disconnected database', () => {
      const status: SystemStatus = {
        database: { connected: false, error: 'Connection refused' },
        codeQuality: { hasIssues: false, issues: [] },
        documentation: { complete: true, missing: [] },
        testCoverage: { percentage: 80, missing: [] },
        git: { hasUncommittedChanges: false, hasUnpushedCommits: false },
      };

      const improvements = (identifier as any).analyzeSystemStatus(status);
      const dbImprovements = improvements.filter((i: Improvement) => i.category === 'infrastructure');
      
      expect(dbImprovements.length).toBeGreaterThan(0);
    });

    it('should flag code quality issues', () => {
      const status: SystemStatus = {
        database: { connected: true },
        codeQuality: { hasIssues: true, issues: ['Memory leak in service'] },
        documentation: { complete: true, missing: [] },
        testCoverage: { percentage: 80, missing: [] },
        git: { hasUncommittedChanges: false, hasUnpushedCommits: false },
      };

      const improvements = (identifier as any).analyzeSystemStatus(status);
      const codeImprovements = improvements.filter((i: Improvement) => i.category === 'code');
      
      expect(codeImprovements.length).toBeGreaterThan(0);
    });

    it('should flag incomplete documentation', () => {
      const status: SystemStatus = {
        database: { connected: true },
        codeQuality: { hasIssues: false, issues: [] },
        documentation: { complete: false, missing: ['API docs', 'README'] },
        testCoverage: { percentage: 80, missing: [] },
        git: { hasUncommittedChanges: false, hasUnpushedCommits: false },
      };

      const improvements = (identifier as any).analyzeSystemStatus(status);
      const docImprovements = improvements.filter((i: Improvement) => i.category === 'documentation');
      
      expect(docImprovements.length).toBeGreaterThan(0);
    });

    it('should flag low test coverage', () => {
      const status: SystemStatus = {
        database: { connected: true },
        codeQuality: { hasIssues: false, issues: [] },
        documentation: { complete: true, missing: [] },
        testCoverage: { percentage: 30, missing: ['src/core/File.ts'] },
        git: { hasUncommittedChanges: false, hasUnpushedCommits: false },
      };

      const improvements = (identifier as any).analyzeSystemStatus(status);
      const coverageImprovements = improvements.filter((i: Improvement) => i.category === 'testing');
      
      expect(coverageImprovements.length).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', () => {
      const improvements: Improvement[] = [
        { type: 'critical', title: 'Fix bug', description: 'Fix critical bug', priority: 10, category: 'code', autoFixable: true },
      ];

      const report = (identifier as any).generateReport(improvements);
      
      expect(report).toContain('#');
      expect(report).toContain('Fix bug');
    });

    it('should handle empty improvements', () => {
      const report = (identifier as any).generateReport([]);
      
      expect(report).toContain('No improvements');
    });
  });
});