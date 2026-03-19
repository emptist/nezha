import { describe, it, expect, beforeEach } from 'vitest';
import { SkillReviewer, ClawHubSkill } from '../services/SkillReviewer.js';

describe('SkillReviewer', () => {
  let reviewer: SkillReviewer;

  beforeEach(() => {
    reviewer = new SkillReviewer();
  });

  describe('constructor', () => {
    it('should create a skill reviewer instance', () => {
      expect(reviewer).toBeDefined();
    });
  });

  describe('reviewSkill', () => {
    it('should review a clean skill', async () => {
      const mockSkill: ClawHubSkill = {
        id: 'skill-1',
        name: 'clean-skill',
        description: 'A clean skill',
        author: 'test',
        version: '1.0.0',
        downloads: 100,
        rating: 4.5,
        tags: ['test'],
        repository: 'https://github.com/test/clean-skill',
        verified: true,
        scanStatus: 'clean',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const result = await reviewer.reviewSkill(mockSkill, 'console.log("test");');
      expect(result).toBeDefined();
      expect(result.isSafe).toBe(true);
      expect(result.score).toBeGreaterThan(50);
    });

    it('should detect dangerous patterns in skill code', async () => {
      const mockSkill: ClawHubSkill = {
        id: 'skill-2',
        name: 'dangerous-skill',
        description: 'A dangerous skill',
        author: 'test',
        version: '1.0.0',
        downloads: 10,
        rating: 3.0,
        tags: ['test'],
        repository: 'https://github.com/test/dangerous-skill',
        verified: false,
        scanStatus: 'suspicious',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const dangerousCode = `
        const { exec } = require('child_process');
        eval(userInput);
        process.env.SECRET_KEY;
      `;

      const result = await reviewer.reviewSkill(mockSkill, dangerousCode);
      expect(result.isSafe).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should detect network operations', async () => {
      const mockSkill: ClawHubSkill = {
        id: 'skill-3',
        name: 'network-skill',
        description: 'A skill with network calls',
        author: 'test',
        version: '1.0.0',
        downloads: 50,
        rating: 4.0,
        tags: ['network'],
        repository: 'https://github.com/test/network-skill',
        verified: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const codeWithNetwork = `
        const https = require('https');
        const socket = new net.Socket();
        const response = await fetch('https://api.example.com');
      `;

      const result = await reviewer.reviewSkill(mockSkill, codeWithNetwork);
      expect(result.codeAnalysis?.hasNetworkCalls).toBe(true);
    });

    it('should detect file operations', async () => {
      const mockSkill: ClawHubSkill = {
        id: 'skill-4',
        name: 'file-skill',
        description: 'A skill with file operations',
        author: 'test',
        version: '1.0.0',
        downloads: 50,
        rating: 4.0,
        tags: ['filesystem'],
        repository: 'https://github.com/test/file-skill',
        verified: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const codeWithFileOps = `
        const fs = require('fs');
        fs.writeFileSync('output.txt', data);
        fs.readFileSync('input.txt', 'utf8');
      `;

      const result = await reviewer.reviewSkill(mockSkill, codeWithFileOps);
      expect(result.codeAnalysis?.hasFileOperations).toBe(true);
    });

    it('should detect system commands', async () => {
      const mockSkill: ClawHubSkill = {
        id: 'skill-5',
        name: 'system-skill',
        description: 'A skill with system commands',
        author: 'test',
        version: '1.0.0',
        downloads: 30,
        rating: 3.5,
        tags: ['system'],
        repository: 'https://github.com/test/system-skill',
        verified: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const codeWithSystem = `
        const { spawn } = require('child_process');
        spawn('rm', ['-rf', '/']);
        exec('sudo rm -rf /');
      `;

      const result = await reviewer.reviewSkill(mockSkill, codeWithSystem);
      expect(result.codeAnalysis?.hasSystemCommands).toBe(true);
      expect(result.isSafe).toBe(false);
    });

    it('should detect credential access patterns', async () => {
      const mockSkill: ClawHubSkill = {
        id: 'skill-6',
        name: 'credential-skill',
        description: 'A skill accessing credentials',
        author: 'test',
        version: '1.0.0',
        downloads: 20,
        rating: 3.0,
        tags: ['credentials'],
        repository: 'https://github.com/test/credential-skill',
        verified: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const codeWithCredentials = `
        const password = process.env.PASSWORD;
        const apiKey = config.api_key;
        const token = userData.token;
      `;

      const result = await reviewer.reviewSkill(mockSkill, codeWithCredentials);
      expect(result.issues.some(i => i.toLowerCase().includes('credential'))).toBe(true);
    });

    it('should calculate score based on safety factors', async () => {
      const mockSkill: ClawHubSkill = {
        id: 'skill-7',
        name: 'safe-skill',
        description: 'A safe skill',
        author: 'test',
        version: '1.0.0',
        downloads: 1000,
        rating: 4.8,
        tags: ['safe'],
        repository: 'https://github.com/test/safe-skill',
        verified: true,
        scanStatus: 'clean',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const safeCode = `
        function add(a, b) {
          return a + b;
        }
        console.log(add(1, 2));
      `;

      const result = await reviewer.reviewSkill(mockSkill, safeCode);
      expect(result.score).toBeGreaterThan(80);
    });

    it('should add warnings for suspicious patterns', async () => {
      const mockSkill: ClawHubSkill = {
        id: 'skill-8',
        name: 'suspicious-skill',
        description: 'A suspicious skill',
        author: 'test',
        version: '1.0.0',
        downloads: 5,
        rating: 2.0,
        tags: ['suspicious'],
        repository: 'https://github.com/test/suspicious-skill',
        verified: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const suspiciousCode = `
        setTimeout(() => { while(true) {} }, 1000);
      `;

      const result = await reviewer.reviewSkill(mockSkill, suspiciousCode);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('reviewBatch', () => {
    it('should review multiple skills', async () => {
      const mockSkills: ClawHubSkill[] = [
        {
          id: 'skill-1',
          name: 'skill-1',
          description: 'Skill 1',
          author: 'test',
          version: '1.0.0',
          downloads: 100,
          rating: 4.0,
          tags: [],
          repository: '',
          verified: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'skill-2',
          name: 'skill-2',
          description: 'Skill 2',
          author: 'test',
          version: '1.0.0',
          downloads: 50,
          rating: 3.0,
          tags: [],
          repository: '',
          verified: false,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      const results = await reviewer.reviewBatch(mockSkills, ['console.log("test");']);
      expect(results).toHaveLength(2);
    });
  });
});
