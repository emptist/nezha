import { MemoryEntry } from './types.js';
import fs from 'fs-extra';
import path from 'path';

export class MemoryService {
  private readonly memoryDir: string;

  constructor(memoryDir: string = 'memory') {
    this.memoryDir = memoryDir;
  }

  async store(entry: MemoryEntry): Promise<void> {
    await fs.ensureDir(this.memoryDir);

    const filename = `${entry.type}-${Date.now()}.json`;
    const filepath = path.join(this.memoryDir, filename);

    await fs.writeJson(filepath, entry, { spaces: 2 });
  }

  async retrieve(query: string): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];

    if (!(await fs.pathExists(this.memoryDir))) {
      return entries;
    }

    const files = await fs.readdir(this.memoryDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filepath = path.join(this.memoryDir, file);
        const entry = await fs.readJson(filepath);

        if (this.matchesQuery(entry, query)) {
          entries.push(entry);
        }
      }
    }

    return entries;
  }

  private matchesQuery(entry: MemoryEntry, query: string): boolean {
    const content = JSON.stringify(entry.content).toLowerCase();
    return content.includes(query.toLowerCase());
  }
}
