import { MemoryEntry } from './types.js';
import fs from 'fs-extra';
import path from 'path';

export class MemoryService {
  private readonly memoryDir: string;
  private index: Map<string, MemoryEntry[]> = new Map();
  private allEntries: MemoryEntry[] = [];
  private initialized = false;

  constructor(memoryDir: string = 'memory') {
    this.memoryDir = memoryDir;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.buildIndex();
    this.initialized = true;
  }

  private async buildIndex(): Promise<void> {
    this.index.clear();
    this.allEntries = [];

    if (!(await fs.pathExists(this.memoryDir))) {
      return;
    }

    const files = await fs.readdir(this.memoryDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filepath = path.join(this.memoryDir, file);
        const entry = await fs.readJson(filepath);
        this.allEntries.push(entry);
        this.indexEntry(entry);
      }
    }
  }

  private indexEntry(entry: MemoryEntry): void {
    const content = JSON.stringify(entry.content).toLowerCase();
    const words = content.split(/\s+/).filter(w => w.length > 2);
    
    for (const word of words) {
      const existing = this.index.get(word) || [];
      existing.push(entry);
      this.index.set(word, existing);
    }
  }

  async store(entry: MemoryEntry): Promise<void> {
    await fs.ensureDir(this.memoryDir);

    const filename = `${entry.type}-${Date.now()}.json`;
    const filepath = path.join(this.memoryDir, filename);

    await fs.writeJson(filepath, entry, { spaces: 2 });
    
    this.allEntries.push(entry);
    this.indexEntry(entry);
  }

  async retrieve(query: string): Promise<MemoryEntry[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    if (queryWords.length === 0) {
      return this.allEntries.slice(0, 20);
    }

    const candidateCounts = new Map<MemoryEntry, number>();
    
    for (const word of queryWords) {
      const matches = this.index.get(word) || [];
      for (const entry of matches) {
        candidateCounts.set(entry, (candidateCounts.get(entry) || 0) + 1);
      }
    }

    const results = Array.from(candidateCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([entry]) => entry);

    return results;
  }

  private matchesQuery(entry: MemoryEntry, query: string): boolean {
    const content = JSON.stringify(entry.content).toLowerCase();
    return content.includes(query.toLowerCase());
  }
}
