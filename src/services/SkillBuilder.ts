// SkillBuilder - AI-powered skill generation system
// Enables Nezha to build its own skills instead of just downloading

import { logger } from '../utils/logger.js';

export interface SkillSpec {
  name: string;
  description: string;
  instructions: string;
  trigger: string[];
  permissions: string[];
  version: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface SkillBuildInput {
  name: string;
  purpose: string;
  useCases?: string[];
  requiredCapabilities?: string[];
  suggestedPermissions?: string[];
}

export interface SkillBuildOutput {
  success: boolean;
  skill?: SkillSpec;
  skillId?: string;
  error?: string;
  qualityScore?: number;
}

export interface SkillMaintenance {
  skillId: string;
  maintainer: string;
  lastUpdated: Date;
  version: string;
  status: 'active' | 'deprecated' | 'archived';
  usageCount: number;
  successRate: number;
}

export class SkillBuilder {
  private dbClient: unknown = null;

  setDatabaseClient(client: unknown): void {
    this.dbClient = client;
  }

  async buildSkill(input: SkillBuildInput): Promise<SkillBuildOutput> {
    logger.info(`[SkillBuilder] Building skill: ${input.name}`);

    try {
      const skill = this.generateSkillSpec(input);

      const qualityScore = this.assessQuality(skill);

      if (qualityScore < 50) {
        return {
          success: false,
          error: `Skill quality score too low: ${qualityScore}/100`,
          qualityScore,
        };
      }

      if (this.dbClient) {
        const skillId = await this.saveSkillToDatabase(skill, {
          builder: 'nezha-ai',
          purpose: input.purpose,
        });
        return {
          success: true,
          skill,
          skillId,
          qualityScore,
        };
      }

      return {
        success: true,
        skill,
        qualityScore,
      };
    } catch (error) {
      logger.error('[SkillBuilder] Failed to build skill:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private generateSkillSpec(input: SkillBuildInput): SkillSpec {
    const name = this.sanitizeName(input.name);
    const trigger = this.generateTriggers(input.name, input.useCases);
    const instructions = this.generateInstructions(input);
    const permissions = this.determinePermissions(input.suggestedPermissions);

    return {
      name,
      description: this.generateDescription(input),
      instructions,
      trigger,
      permissions,
      version: '1.0.0',
      tags: this.generateTags(input),
      metadata: {
        builtBy: 'nezha-ai',
        builtAt: new Date().toISOString(),
        source: 'internally-built',
        purpose: input.purpose,
      },
    };
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private generateTriggers(name: string, useCases?: string[]): string[] {
    const triggers: string[] = [name.toLowerCase()];

    if (useCases) {
      for (const uc of useCases) {
        triggers.push(uc.toLowerCase());
      }
    }

    const keywords = ['help', 'do', 'create', 'fix', 'build', 'generate', 'analyze'];
    for (const kw of keywords) {
      if (name.toLowerCase().includes(kw)) {
        triggers.push(kw);
      }
    }

    return [...new Set(triggers)].slice(0, 10);
  }

  private generateInstructions(input: SkillBuildInput): string {
    const lines: string[] = [];

    lines.push(`# ${input.name} Skill`);
    lines.push('');
    lines.push(`## Purpose`);
    lines.push(input.purpose);
    lines.push('');

    if (input.useCases && input.useCases.length > 0) {
      lines.push('## Use Cases');
      for (const uc of input.useCases) {
        lines.push(`- ${uc}`);
      }
      lines.push('');
    }

    lines.push('## Instructions');
    lines.push('');
    lines.push('When this skill is triggered:');
    lines.push('');
    lines.push('1. Understand the user request');
    lines.push('2. Break down the task into steps');
    lines.push('3. Execute each step');
    lines.push('4. Verify the result');
    lines.push('5. Report back to user');
    lines.push('');

    if (input.requiredCapabilities) {
      lines.push('## Required Capabilities');
      for (const cap of input.requiredCapabilities) {
        lines.push(`- ${cap}`);
      }
      lines.push('');
    }

    lines.push('## Best Practices');
    lines.push('- Follow existing code patterns');
    lines.push('- Write tests for new functionality');
    lines.push('- Document complex decisions');
    lines.push('- Handle errors gracefully');
    lines.push('- Log important actions');

    return lines.join('\n');
  }

  private generateDescription(input: SkillBuildInput): string {
    const parts = [input.purpose];

    if (input.useCases && input.useCases.length > 0) {
      parts.push(`Use cases: ${input.useCases.slice(0, 3).join(', ')}`);
    }

    return parts.join('. ');
  }

  private determinePermissions(suggested?: string[]): string[] {
    const defaults = ['network'];
    if (!suggested) return defaults;
    return [...new Set([...defaults, ...suggested])];
  }

  private generateTags(input: SkillBuildInput): string[] {
    const tags: string[] = ['internally-built', 'nezha-native'];

    const nameLower = input.name.toLowerCase();
    if (nameLower.includes('git')) tags.push('git', 'version-control');
    if (nameLower.includes('test')) tags.push('testing', 'quality');
    if (nameLower.includes('code') || nameLower.includes('review')) tags.push('code-quality');
    if (nameLower.includes('deploy')) tags.push('deployment', 'devops');
    if (nameLower.includes('api')) tags.push('api', 'backend');
    if (nameLower.includes('db') || nameLower.includes('data')) tags.push('database', 'data');

    if (input.useCases) {
      for (const uc of input.useCases) {
        tags.push(uc.toLowerCase().replace(/\s+/g, '-'));
      }
    }

    return [...new Set(tags)].slice(0, 10);
  }

  private assessQuality(skill: SkillSpec): number {
    let score = 50;

    if (skill.instructions.length > 200) score += 15;
    if (skill.instructions.length > 500) score += 10;

    if (skill.trigger.length >= 3 && skill.trigger.length <= 10) score += 10;

    if (skill.description.length > 50) score += 10;

    if (skill.tags.length >= 3) score += 5;

    if (skill.metadata?.purpose) score += 10;

    return Math.min(100, score);
  }

  private async saveSkillToDatabase(
    skill: SkillSpec,
    builder: { builder: string; purpose: string }
  ): Promise<string> {
    if (!this.dbClient) throw new Error('No database client');

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: { id: string }[] }>;
    };

    const id = crypto.randomUUID();

    await client.query(
      `INSERT INTO skills (
        id, name, description, instructions, source, external_id,
        version, author, tags, safety_score, scan_status,
        status, permissions, manifest,
        installed_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        instructions = EXCLUDED.instructions,
        updated_at = NOW()`,
      [
        id,
        skill.name,
        skill.description,
        skill.instructions,
        'generated',
        `generated-${skill.name}`,
        skill.version,
        builder.builder,
        skill.tags,
        100,
        'reviewed',
        'pending',
        skill.permissions,
        JSON.stringify(skill.metadata),
        new Date(),
        new Date(),
        new Date(),
      ]
    );

    logger.info(`[SkillBuilder] Skill saved: ${skill.name} (${id})`);

    return id;
  }

  async listInternallyBuiltSkills(): Promise<SkillSpec[]> {
    if (!this.dbClient) return [];

    const client = this.dbClient as {
      query: (sql: string) => Promise<{ rows: { instructions: string; manifest: string }[] }>;
    };

    const result = await client.query(
      `SELECT instructions, manifest FROM skills WHERE source = 'generated' ORDER BY created_at DESC`
    );

    return result.rows.map(row => ({
      name: '',
      description: '',
      instructions: row.instructions,
      trigger: [],
      permissions: [],
      version: '',
      tags: [],
      metadata: JSON.parse(row.manifest || '{}'),
    }));
  }

  async updateSkillMaintainer(skillId: string, maintainer: string): Promise<boolean> {
    if (!this.dbClient) return false;

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    };

    await client.query(`UPDATE skills SET author = $1, updated_at = NOW() WHERE id = $2`, [
      maintainer,
      skillId,
    ]);

    logger.info(`[SkillBuilder] Updated maintainer for ${skillId}: ${maintainer}`);

    return true;
  }

  async deprecateSkill(skillId: string, reason: string): Promise<boolean> {
    if (!this.dbClient) return false;

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    };

    await client.query(
      `UPDATE skills 
       SET status = 'blocked', 
           rejection_reason = $1,
           updated_at = NOW() 
       WHERE id = $2`,
      [reason, skillId]
    );

    logger.info(`[SkillBuilder] Deprecated skill ${skillId}: ${reason}`);

    return true;
  }

  async improveSkill(skillId: string, improvement: string): Promise<SkillBuildOutput> {
    if (!this.dbClient) {
      return { success: false, error: 'No database client' };
    }

    const client = this.dbClient as {
      query: (
        sql: string,
        params?: unknown[]
      ) => Promise<{
        rows: { name: string; description: string; instructions: string; version: string }[];
      }>;
    };

    const result = await client.query(
      `SELECT name, description, instructions, version FROM skills WHERE id = $1`,
      [skillId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Skill not found' };
    }

    const existing = result.rows[0];
    if (!existing) {
      return { success: false, error: 'Skill not found' };
    }

    const improvedInstructions = this.mergeImprovement(existing.instructions, improvement);

    const versionParts = existing.version.split('.');
    const newVersion = `${versionParts[0] || '1'}.${(parseInt(versionParts[1] || '0') + 1).toString()}.0`;

    await client.query(
      `UPDATE skills 
       SET instructions = $1, 
           version = $2,
           updated_at = NOW() 
       WHERE id = $3`,
      [improvedInstructions, newVersion, skillId]
    );

    logger.info(`[SkillBuilder] Improved skill ${skillId} to version ${newVersion}`);

    return {
      success: true,
      qualityScore: 90,
    };
  }

  private mergeImprovement(existing: string, improvement: string): string {
    const lines = existing.split('\n');
    const insertIndex = lines.findIndex(l => l.startsWith('## '));

    if (insertIndex === -1) {
      return existing + '\n\n## Improvements\n\n' + improvement;
    }

    lines.splice(insertIndex, 0, '', '## Improvements', '', improvement, '');

    return lines.join('\n');
  }
}

export const skillBuilder = new SkillBuilder();
