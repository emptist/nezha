import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseClient } from '../db/DatabaseClient.js';

export class DocsImporter {
  private db: DatabaseClient | null = null;

  setDatabaseClient(db: DatabaseClient): void {
    this.db = db;
  }

  async scanDirectory(dir: string): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    const scan = async (currentDir: string) => {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scan(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          files.push({ path: fullPath, content });
        }
      }
    };

    await scan(dir);
    return files;
  }

  async importFile(filePath: string, content: string): Promise<void> {
    if (!this.db) return;

    await this.db.query(
      `INSERT INTO memory (content, tags, source, importance, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        content,
        ['documentation', 'imported'],
        'docs-import',
        5,
        JSON.stringify({ filepath: filePath }),
      ]
    );
  }

  async importAll(docsDir: string): Promise<{ imported: number; skipped: number }> {
    if (!this.db) {
      throw new Error('Database client not set');
    }

    const files = await this.scanDirectory(docsDir);
    let imported = 0;
    let skipped = 0;

    for (const file of files) {
      const existing = await this.db.query<{ id: string }>(
        `SELECT id FROM memory WHERE metadata->>'filepath' = $1`,
        [file.path]
      );

      if (existing.rows.length === 0) {
        await this.importFile(file.path, file.content);
        imported++;
      } else {
        skipped++;
      }
    }

    return { imported, skipped };
  }
}
