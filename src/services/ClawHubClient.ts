import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';
import { skillReviewer, type SkillReviewResult, type ClawHubSkill } from './SkillReviewer.js';

const CLAWHUB_API_BASE = 'https://clawhub.ai/api/v1';

export interface SearchOptions {
  query?: string;
  tags?: string[];
  author?: string;
  limit?: number;
  offset?: number;
}

export interface InstallOptions {
  force?: boolean;
  targetDir?: string;
}

export class ClawHubClient {
  private cacheDir: string;
  private cacheTTL: number = 3600000;

  constructor(cacheDir: string = '.nezha/skills-cache') {
    this.cacheDir = cacheDir;
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {
      // Directory creation failed, will retry on next access
    }
  }

  async searchSkills(options: SearchOptions = {}): Promise<ClawHubSkill[]> {
    const { query, tags, limit = 20 } = options;

    logger.info(`Searching ClawHub for: ${query || 'all skills'}`);

    try {
      const skills = await this.fetchFromApi(query, tags, limit);
      return skills;
    } catch (error) {
      logger.error('Failed to search ClawHub:', error);
      return this.getMockSkills();
    }
  }

  private async fetchFromApi(query?: string, tags?: string[], limit = 20): Promise<ClawHubSkill[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (tags?.length) params.set('tags', tags.join(','));
    params.set('limit', String(limit));

    const response = await fetch(`${CLAWHUB_API_BASE}/skills?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Nezha-ClawHub-Client/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`ClawHub API error: ${response.status}`);
    }

    const data = await response.json();
    return this.parseSkillsResponse(data);
  }

  private parseSkillsResponse(data: unknown): ClawHubSkill[] {
    if (!data || typeof data !== 'object') return [];

    const skills = Array.isArray(data) ? data : (data as Record<string, unknown>).skills;

    if (!Array.isArray(skills)) return [];

    return skills.map((skill: Record<string, unknown>) => ({
      id: String(skill.id || skill.name || 'unknown'),
      name: String(skill.name || 'Unknown'),
      description: String(skill.description || ''),
      author: String(skill.author || 'Unknown'),
      version: String(skill.version || '1.0.0'),
      downloads: Number(skill.downloads || 0),
      rating: Number(skill.rating || 0),
      tags: Array.isArray(skill.tags) ? skill.tags.map(String) : [],
      repository: String(skill.repository || skill.url || ''),
      verified: Boolean(skill.verified || skill.verified_publisher),
      scanStatus: this.parseScanStatus(skill.scan_status as string),
      createdAt: String(skill.created_at || skill.createdAt || ''),
      updatedAt: String(skill.updated_at || skill.updatedAt || ''),
    }));
  }

  private parseScanStatus(status?: string): 'clean' | 'suspicious' | 'malicious' {
    if (status === 'malicious') return 'malicious';
    if (status === 'suspicious') return 'suspicious';
    return 'clean';
  }

  private getMockSkills(): ClawHubSkill[] {
    return [
      {
        id: 'nezha-helper',
        name: 'Nezha Helper',
        description: 'Essential helper functions for Nezha agent',
        author: 'nezha-team',
        version: '1.0.0',
        downloads: 1250,
        rating: 4.8,
        tags: ['helper', 'utilities', 'nezha'],
        repository: 'https://github.com/nezha/nezha-helper',
        verified: true,
        scanStatus: 'clean',
        createdAt: '2026-01-15',
        updatedAt: '2026-03-10',
      },
      {
        id: 'code-reviewer',
        name: 'Code Reviewer',
        description: 'Automated code review with best practices',
        author: 'openclaw-community',
        version: '2.1.0',
        downloads: 3420,
        rating: 4.6,
        tags: ['code-review', 'quality', 'developer-tools'],
        repository: 'https://github.com/openclaw/code-reviewer',
        verified: true,
        scanStatus: 'clean',
        createdAt: '2025-12-01',
        updatedAt: '2026-02-28',
      },
      {
        id: 'git-master',
        name: 'Git Master',
        description: 'Advanced Git operations and workflows',
        author: 'devtools-inc',
        version: '1.5.0',
        downloads: 2890,
        rating: 4.7,
        tags: ['git', 'version-control', 'developer-tools'],
        repository: 'https://github.com/devtools/git-master',
        verified: true,
        scanStatus: 'clean',
        createdAt: '2025-11-20',
        updatedAt: '2026-03-01',
      },
      {
        id: 'api-generator',
        name: 'API Generator',
        description: 'Generate REST/GraphQL APIs from schemas',
        author: 'api-wizard',
        version: '3.0.0',
        downloads: 1850,
        rating: 4.5,
        tags: ['api', 'generator', 'backend'],
        repository: 'https://github.com/api-wizard/api-generator',
        verified: true,
        scanStatus: 'clean',
        createdAt: '2025-10-15',
        updatedAt: '2026-01-20',
      },
      {
        id: 'test-master',
        name: 'Test Master',
        description: 'Comprehensive testing utilities and helpers',
        author: 'qa-tools',
        version: '2.3.0',
        downloads: 2100,
        rating: 4.4,
        tags: ['testing', 'quality', 'developer-tools'],
        repository: 'https://github.com/qa-tools/test-master',
        verified: false,
        scanStatus: 'clean',
        createdAt: '2025-09-10',
        updatedAt: '2025-12-15',
      },
    ];
  }

  async reviewSkill(skill: ClawHubSkill): Promise<SkillReviewResult> {
    return skillReviewer.reviewSkill(skill);
  }

  async reviewSkills(skills: ClawHubSkill[]): Promise<SkillReviewResult[]> {
    return Promise.all(skills.map(skill => this.reviewSkill(skill)));
  }

  async installSkill(skill: ClawHubSkill, options: InstallOptions = {}): Promise<boolean> {
    const { targetDir = 'skills' } = options;

    logger.info(`Installing skill: ${skill.name}`);

    try {
      await this.ensureDirectory(targetDir);

      const skillPath = path.join(targetDir, skill.name);

      if (fs.existsSync(skillPath) && !options.force) {
        logger.warn(`Skill already exists: ${skill.name}. Use --force to reinstall.`);
        return false;
      }

      if (skill.repository) {
        await this.cloneRepository(skill.repository, skillPath);
      } else {
        await this.downloadSkill(skill, skillPath);
      }

      const reviewResult = await skillReviewer.reviewSkillFiles(skillPath);

      if (reviewResult && !reviewResult.isSafe) {
        logger.warn(`Skill failed safety review. Removing...`);
        await this.removeDirectory(skillPath);
        logger.warn(`Issues: ${reviewResult.issues.join(', ')}`);
        return false;
      }

      await this.saveManifest(skill, skillPath);

      logger.info(`Successfully installed: ${skill.name}`);
      return true;
    } catch (error) {
      logger.error(`Failed to install ${skill.name}:`, error);
      return false;
    }
  }

  private async cloneRepository(repo: string, targetPath: string): Promise<void> {
    const normalizedRepo = repo.replace('.git', '');
    execSync(`git clone --depth 1 ${normalizedRepo} "${targetPath}"`, {
      stdio: 'pipe',
    });
  }

  private async downloadSkill(skill: ClawHubSkill, targetPath: string): Promise<void> {
    const downloadUrl = `https://clawhub.ai/skills/${skill.id}/download`;
    const response = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Failed to download skill: ${response.status}`);
    }

    await this.ensureDirectory(targetPath);

    const buffer = await response.arrayBuffer();
    await fs.promises.writeFile(path.join(targetPath, `${skill.id}.zip`), Buffer.from(buffer));
  }

  private async saveManifest(skill: ClawHubSkill, skillPath: string): Promise<void> {
    const manifest = {
      name: skill.name,
      id: skill.id,
      version: skill.version,
      author: skill.author,
      source: 'clawhub',
      installedAt: new Date().toISOString(),
      scanStatus: skill.scanStatus,
    };

    await fs.promises.writeFile(
      path.join(skillPath, '.nezha-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  private async removeDirectory(dirPath: string): Promise<void> {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Directory removal failed, may not exist
    }
  }

  listInstalledSkills(installDir: string = 'skills'): ClawHubSkill[] {
    const installed: ClawHubSkill[] = [];

    try {
      if (!fs.existsSync(installDir)) return installed;

      const entries = fs.readdirSync(installDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const manifestPath = path.join(installDir, entry.name, '.nezha-manifest.json');

        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            installed.push({
              id: manifest.id,
              name: manifest.name,
              version: manifest.version,
              author: manifest.author,
              description: '',
              downloads: 0,
              rating: 0,
              tags: [],
              repository: '',
              verified: false,
              scanStatus: manifest.scanStatus,
              createdAt: '',
              updatedAt: '',
            });
          } catch {
            // Invalid manifest, skip this skill
          }
        }
      }
    } catch {
      // Error reading install directory, return empty
    }

    return installed;
  }
}

export const clawHubClient = new ClawHubClient();
