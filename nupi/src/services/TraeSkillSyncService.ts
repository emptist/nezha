import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

const TRAE_SKILLS_DIR = '.trae/skills';

interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  manifest: Record<string, unknown> | null;
  source: string | null;
  version: string | null;
  author: string | null;
  tags: string[] | null;
}

export class TraeSkillSyncService {
  private dbClient: unknown = null;

  setDatabaseClient(client: unknown): void {
    this.dbClient = client;
  }

  async syncToTrae(): Promise<{ synced: number; errors: string[] }> {
    if (!this.dbClient) {
      return { synced: 0, errors: ['No database client configured'] };
    }

    const errors: string[] = [];
    let synced = 0;

    try {
      await this.ensureDirectoryExists();
      const skills = await this.loadApprovedSkills();

      logger.info(`[TraeSync] Syncing ${skills.length} skills to ${TRAE_SKILLS_DIR}`);

      for (const skill of skills) {
        try {
          await this.syncSkill(skill);
          synced++;
        } catch (err) {
          const msg = `Failed to sync skill ${skill.name}: ${err instanceof Error ? err.message : String(err)}`;
          logger.error(`[TraeSync] ${msg}`);
          errors.push(msg);
        }
      }

      await this.cleanupDeletedSkills(skills);

      logger.info(`[TraeSync] Sync complete: ${synced} synced, ${errors.length} errors`);
      return { synced, errors };
    } catch (err) {
      const msg = `Sync failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(`[TraeSync] ${msg}`);
      errors.push(msg);
      return { synced, errors };
    }
  }

  private async loadApprovedSkills(): Promise<SkillRow[]> {
    const client = this.dbClient as {
      query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
    };

    const result = await client.query<SkillRow>(
      `SELECT id, name, description, instructions, manifest, source, version, author, tags
       FROM skills 
       WHERE name IS NOT NULL AND name != ''
       ORDER BY name`
    );

    return result.rows;
  }

  private async syncSkill(skill: SkillRow): Promise<void> {
    const filename = this.sanitizeFilename(skill.name) + '.md';
    const filepath = path.join(TRAE_SKILLS_DIR, filename);
    const content = this.skillToMarkdown(skill);

    const existingContent = await this.readFileSafe(filepath);
    if (existingContent === content) {
      logger.debug(`[TraeSync] No changes for ${skill.name}`);
      return;
    }

    await this.writeFile(filepath, content);
    logger.info(`[TraeSync] Synced: ${skill.name} → ${filepath}`);
  }

  private skillToMarkdown(skill: SkillRow): string {
    const instructions = this.extractInstructions(skill);
    const tags = Array.isArray(skill.tags) ? skill.tags : [];

    const lines: string[] = [
      `# ${skill.name}`,
      '',
      `> ${skill.description || 'No description provided'}`,
      '',
      '## Skill Information',
      '',
      `- **Name**: ${skill.name}`,
      `- **Version**: ${skill.version || '1.0.0'}`,
      `- **Description**: ${skill.description || 'N/A'}`,
      `- **Author**: ${skill.author || 'Nezha AI'}`,
      `- **Source**: ${skill.source || 'nezha'}`,
      `- **Tags**: ${tags.join(', ') || 'none'}`,
      '',
      '## Instructions',
      '',
    ];

    if (instructions) {
      lines.push(instructions);
    } else {
      lines.push(`This skill provides: ${skill.description || 'No detailed instructions available.'}`);
      lines.push('');
      lines.push('Use `skill_execute` to invoke this skill with custom input.');
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Synced from Nezha on ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  private extractInstructions(skill: SkillRow): string | null {
    if (skill.instructions && typeof skill.instructions === 'string' && skill.instructions.trim()) {
      return skill.instructions;
    }

    if (!skill.manifest || typeof skill.manifest !== 'object') {
      return null;
    }

    const manifest = skill.manifest as Record<string, unknown>;
    if (manifest.prompt && typeof manifest.prompt === 'string') {
      return manifest.prompt;
    }
    if (manifest.description && typeof manifest.description === 'string') {
      return manifest.description;
    }

    return null;
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async ensureDirectoryExists(): Promise<void> {
    if (!fs.existsSync(TRAE_SKILLS_DIR)) {
      fs.mkdirSync(TRAE_SKILLS_DIR, { recursive: true });
      logger.info(`[TraeSync] Created directory: ${TRAE_SKILLS_DIR}`);
    }
  }

  private async readFileSafe(filepath: string): Promise<string | null> {
    try {
      if (fs.existsSync(filepath)) {
        return fs.readFileSync(filepath, 'utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }

  private async writeFile(filepath: string, content: string): Promise<void> {
    fs.writeFileSync(filepath, content, 'utf-8');
  }

  private async cleanupDeletedSkills(activeSkills: SkillRow[]): Promise<void> {
    if (!fs.existsSync(TRAE_SKILLS_DIR)) return;

    const activeFilenames = new Set(
      activeSkills.map(s => this.sanitizeFilename(s.name) + '.md')
    );

    const files = fs.readdirSync(TRAE_SKILLS_DIR);
    let cleaned = 0;

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      if (!activeFilenames.has(file)) {
        const filepath = path.join(TRAE_SKILLS_DIR, file);
        const content = await this.readFileSafe(filepath);
        if (content && content.includes('*Synced from Nezha on')) {
          fs.unlinkSync(filepath);
          logger.info(`[TraeSync] Removed deleted skill: ${file}`);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      logger.info(`[TraeSync] Cleaned up ${cleaned} deleted skills`);
    }
  }
}

export const traeSkillSyncService = new TraeSkillSyncService();
