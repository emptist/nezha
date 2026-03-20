// MarkdownKnowledgeLoader - Import knowledge from traditional markdown files
// Inspired by OpenClaw's SOUL.md, memory/*.md, AGENTS.md pattern
// Maps traditional file-based knowledge → PostgreSQL memory

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface KnowledgeFile {
  name: string;
  path: string;
  content: string;
  type: KnowledgeType;
}

export type KnowledgeType =
  | 'soul' // SOUL.md - Identity/persona
  | 'agents' // AGENTS.md - Operating instructions
  | 'user' // USER.md - User context
  | 'memory' // memory/YYYY-MM-DD.md - Daily memory
  | 'lore' // lore.md - Background knowledge
  | 'tools' // TOOLS.md - Tool definitions
  | 'bootstrap' // BOOTSTRAP.md - Startup config
  | 'custom'; // Other markdown files

export interface ParsedKnowledge {
  type: KnowledgeType;
  title?: string;
  content: string;
  sections: KnowledgeSection[];
  tags: string[];
  importance: number;
  metadata: Record<string, unknown>;
}

export interface KnowledgeSection {
  title: string;
  content: string;
  level: number;
  index: number;
}

export interface ImportResult {
  success: boolean;
  file: string;
  entries: number;
  errors: string[];
}

export const KNOWLEDGE_FILE_TYPES: Record<string, KnowledgeType> = {
  'SOUL.md': 'soul',
  'AGENTS.md': 'agents',
  'USER.md': 'user',
  'MEMORY.md': 'memory',
  'TOOLS.md': 'tools',
  'BOOTSTRAP.md': 'bootstrap',
  'lore.md': 'lore',
  'KNOWLEDGE.md': 'lore',
};

export const DEFAULT_KNOWLEDGE_DIRS = [
  '.',
  './knowledge',
  './docs',
  './workspace',
  './.nezha',
  './bootstrap',
];

export class MarkdownKnowledgeLoader {
  private dbClient: unknown = null;

  setDatabaseClient(client: unknown): void {
    this.dbClient = client;
  }

  async scanDirectory(dirPath: string): Promise<KnowledgeFile[]> {
    const files: KnowledgeFile[] = [];

    try {
      if (!fs.existsSync(dirPath)) {
        return files;
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile() && entry.name.endsWith('.md')) {
          const type = this.identifyFileType(entry.name);
          if (type) {
            const content = await this.readFile(fullPath);
            files.push({
              name: entry.name,
              path: fullPath,
              content,
              type,
            });
          }
        }

        if (entry.isDirectory() && entry.name === 'memory') {
          const memoryFiles = await this.scanMemoryDirectory(fullPath);
          files.push(...memoryFiles);
        }
      }
    } catch (error) {
      logger.error(`[KnowledgeLoader] Failed to scan ${dirPath}:`, error);
    }

    return files;
  }

  private async scanMemoryDirectory(dirPath: string): Promise<KnowledgeFile[]> {
    const files: KnowledgeFile[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const fullPath = path.join(dirPath, entry.name);
          const content = await this.readFile(fullPath);

          files.push({
            name: entry.name,
            path: fullPath,
            content,
            type: 'memory',
          });
        }
      }
    } catch (error) {
      logger.error(`[KnowledgeLoader] Failed to scan memory dir ${dirPath}:`, error);
    }

    return files;
  }

  private identifyFileType(filename: string): KnowledgeType | null {
    if (KNOWLEDGE_FILE_TYPES[filename]) {
      return KNOWLEDGE_FILE_TYPES[filename];
    }

    if (filename.startsWith('SOUL')) return 'soul';
    if (filename.startsWith('AGENTS')) return 'agents';
    if (filename.startsWith('USER')) return 'user';
    if (filename.startsWith('TOOLS')) return 'tools';
    if (filename.includes('memory')) return 'memory';

    return 'custom';
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      logger.error(`[KnowledgeLoader] Failed to read ${filePath}:`, error);
      return '';
    }
  }

  parseMarkdown(content: string): ParsedKnowledge {
    const sections = this.extractSections(content);
    const title = this.extractTitle(content);
    const tags = this.extractTags(content);
    const importance = this.calculateImportance(content);

    return {
      type: 'custom',
      title,
      content,
      sections,
      tags,
      importance,
      metadata: {
        sectionCount: sections.length,
        contentLength: content.length,
        hasCodeBlocks: content.includes('```'),
        hasLinks: content.includes('[') && content.includes(']('),
      },
    };
  }

  private extractTitle(content: string): string | undefined {
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim();
  }

  private extractSections(content: string): KnowledgeSection[] {
    const sections: KnowledgeSection[] = [];
    const lines = content.split('\n');

    let currentSection: KnowledgeSection | null = null;
    let sectionIndex = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch?.[1] && headingMatch?.[2]) {
        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          level: headingMatch[1].length,
          title: headingMatch[2].trim(),
          content: '',
          index: sectionIndex++,
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];

    const tagMatch = content.match(/tags?:\s*\[([^\]]+)\]/i);
    if (tagMatch?.[1]) {
      const tagList = tagMatch[1].split(',').map(t => t.trim().toLowerCase());
      tags.push(...tagList);
    }

    const hashTags = content.match(/#[a-zA-Z0-9-_]+/g);
    if (hashTags) {
      tags.push(...hashTags.map(t => t.substring(1).toLowerCase()));
    }

    return [...new Set(tags)].slice(0, 20);
  }

  private calculateImportance(content: string): number {
    let score = 5;

    if (content.length > 5000) score += 2;
    if (content.includes('IMPORTANT') || content.includes('CRITICAL')) score += 2;
    if (content.includes('TODO') || content.includes('FIXME')) score += 1;
    if (content.includes('```')) score += 1;
    if (content.match(/^#+\s+.+$/m)) score += 1;

    return Math.min(10, score);
  }

  async importFile(file: KnowledgeFile): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      file: file.path,
      entries: 0,
      errors: [],
    };

    if (!this.dbClient) {
      result.errors.push('No database client configured');
      return result;
    }

    try {
      const parsed = this.parseMarkdown(file.content);
      parsed.type = file.type;

      const id = crypto.randomUUID();
      const metadata = {
        filename: file.name,
        filepath: file.path,
        type: file.type,
        title: parsed.title,
        sectionCount: parsed.sections.length,
        importedAt: new Date().toISOString(),
        ...parsed.metadata,
      };

      const contentId = await this.saveToMemory({
        id,
        content: parsed.content,
        source: `markdown:${file.type}`,
        tags: [...parsed.tags, file.type, 'imported'],
        importance: parsed.importance,
        metadata,
      });

      if (contentId) {
        result.entries++;
      }

      for (const section of parsed.sections) {
        if (section.content.trim().length > 100) {
          const sectionId = await this.saveToMemory({
            id: crypto.randomUUID(),
            content: `## ${section.title}\n\n${section.content.trim()}`,
            source: `markdown:${file.type}:section`,
            tags: [file.type, 'section', 'imported'],
            importance: Math.max(1, parsed.importance - 1),
            metadata: {
              parentId: id,
              sectionTitle: section.title,
              sectionLevel: section.level,
              importedAt: new Date().toISOString(),
            },
          });

          if (sectionId) {
            result.entries++;
          }
        }
      }

      result.success = true;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      logger.error(`[KnowledgeLoader] Failed to import ${file.path}:`, error);
    }

    return result;
  }

  private async saveToMemory(input: {
    id: string;
    content: string;
    source?: string;
    tags?: string[];
    importance?: number;
    metadata?: Record<string, unknown>;
    projectId?: string;
  }): Promise<string | null> {
    if (!this.dbClient) return null;

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: { id: string }[] }>;
    };

    try {
      const result = await client.query(
        `INSERT INTO memory (id, project_id, content, metadata, tags, importance, source, embedding, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           content = $3,
           metadata = $4,
           tags = $5,
           importance = $6,
           source = $7,
           updated_at = NOW()
         RETURNING id`,
        [
          input.id,
          input.projectId || null,
          input.content,
          JSON.stringify(input.metadata || {}),
          input.tags || [],
          input.importance || 5,
          input.source || 'markdown',
        ]
      );

      return result.rows[0]?.id || null;
    } catch (error) {
      logger.error('[KnowledgeLoader] Failed to save to memory:', error);
      return null;
    }
  }

  async importDirectory(dirPath: string): Promise<ImportResult[]> {
    logger.info(`[KnowledgeLoader] Importing knowledge from ${dirPath}`);

    const files = await this.scanDirectory(dirPath);
    const results: ImportResult[] = [];

    for (const file of files) {
      const result = await this.importFile(file);
      results.push(result);

      if (result.success) {
        logger.info(`[KnowledgeLoader] Imported ${file.name}: ${result.entries} entries`);
      }
    }

    return results;
  }

  async importStandardLocations(): Promise<ImportResult[]> {
    const allResults: ImportResult[] = [];

    for (const dir of DEFAULT_KNOWLEDGE_DIRS) {
      if (fs.existsSync(dir)) {
        const results = await this.importDirectory(dir);
        allResults.push(...results);
      }
    }

    return allResults;
  }

  async exportToMarkdown(type: KnowledgeType, projectId?: string): Promise<string> {
    if (!this.dbClient) return '';

    const client = this.dbClient as {
      query: (
        sql: string,
        params?: unknown[]
      ) => Promise<{ rows: { content: string; metadata: string }[] }>;
    };

    const result = await client.query(
      `SELECT content, metadata FROM memory 
       WHERE source LIKE $1 
         AND ($2::uuid IS NULL OR project_id = $2)
       ORDER BY importance DESC, created_at DESC
       LIMIT 100`,
      [`markdown:${type}%`, projectId || null]
    );

    const sections: string[] = [`# ${type.toUpperCase()}\n`];

    for (const row of result.rows) {
      sections.push(row.content);
      sections.push('\n---\n');
    }

    return sections.join('\n');
  }

  linkToSkill(memoryId: string, skillId: string): Promise<boolean> {
    if (!this.dbClient) return Promise.resolve(false);

    const client = this.dbClient as {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    };

    return client
      .query(
        `INSERT INTO knowledge_links (memory_id, skill_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT DO NOTHING`,
        [memoryId, skillId]
      )
      .then(() => true)
      .catch(() => false);
  }
}

export const markdownKnowledgeLoader = new MarkdownKnowledgeLoader();
