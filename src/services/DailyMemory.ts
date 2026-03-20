import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';

interface LearnInput {
  insight: string;
  context?: string;
}

interface SuggestPromptUpdateInput {
  current_prompt: string;
  suggested_prompt: string;
  reason: string;
}

const DEFAULT_MEMORY_DIR = '.tmp/nezha-memory';
const DEFAULT_MEMORY_FILE = 'MEMORY.md';

const DEFAULT_MEMORY_CONTENT = `# Nezha Long-term Memory

## Core Identity
- I'm Nezha, an autonomous AI agent
- I execute tasks from PostgreSQL queue via heartbeat
- I use opencode serve HTTP API for task execution

## How I Work
1. Heartbeat polls DB every 30s for PENDING tasks
2. Tasks are sent to opencode serve via HTTP
3. Results stored in DB with full response JSON
4. After each task, I reflect on what I learned

## Tools Available
- memory_save() - Save important learnings to memory
- memory_search() - Find relevant past experiences
- learn() - Save insights from task reflections
- suggest_prompt_update() - Propose system prompt improvements

## Key Learnings
- OpenClaw inspired this architecture
- File-based daily memory + DB for semantic search
- Circuit breaker prevents cascade failures

## Important Patterns
- Use exponential backoff for retries
- Check for stuck RUNNING tasks on each heartbeat
- Save task results to both DB and daily memory

Last updated: ${new Date().toISOString().split('T')[0]}
`;

export interface DailyMemoryConfig {
  memoryDir?: string;
}

export interface MemorySaveInput {
  task: string;
  result: string;
  errors?: string[];
  solution?: string;
  prompt?: string;
}

export interface DailyMemoryEntry {
  date: string;
  tasks: Array<{
    id?: string;
    title: string;
    prompt?: string;
    result?: string;
    errors?: string[];
    solution?: string;
  }>;
  learnings: string[];
  reflections: string[];
}

export class DailyMemoryService {
  private readonly memoryDir: string;

  constructor(config?: DailyMemoryConfig) {
    this.memoryDir = config?.memoryDir ?? DEFAULT_MEMORY_DIR;
  }

  async initialize(): Promise<void> {
    await this.ensureDirectory();
    await this.ensureMemoryFile();
  }

  private async ensureMemoryFile(): Promise<void> {
    const memoryFilePath = path.join(this.memoryDir, DEFAULT_MEMORY_FILE);
    try {
      await fs.access(memoryFilePath);
    } catch (err) {
      await fs.writeFile(memoryFilePath, DEFAULT_MEMORY_CONTENT, 'utf-8');
      logger.info(
        `Created default ${DEFAULT_MEMORY_FILE}: ${err instanceof Error ? err.message : 'File not found'}`
      );
    }
  }

  async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create memory directory:', error);
      throw error;
    }
  }

  private getTodayFilename(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}.md`;
  }

  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getFilePath(): string {
    return path.join(this.memoryDir, this.getTodayFilename());
  }

  async save(input: MemorySaveInput): Promise<void> {
    await this.ensureDirectory();

    const filePath = this.getFilePath();
    const timestamp = new Date().toISOString();

    let entry = `- **${timestamp}** | Task: ${input.task}\n`;

    if (input.result) {
      const truncatedResult =
        input.result.length > 200 ? input.result.substring(0, 200) + '...' : input.result;
      entry += `  - Result: ${truncatedResult}\n`;
    }

    if (input.errors && input.errors.length > 0) {
      const errorSummary = input.errors.join('; ').substring(0, 150);
      entry += `  - Errors: ${errorSummary}\n`;
    }

    if (input.solution) {
      const truncatedSolution =
        input.solution.length > 150 ? input.solution.substring(0, 150) + '...' : input.solution;
      entry += `  - Solution: ${truncatedSolution}\n`;
    }

    entry += '\n';

    try {
      const exists = await this.fileExists(filePath);

      if (exists) {
        await fs.appendFile(filePath, entry);
      } else {
        const header = `# Daily Memory - ${this.getTodayDate()}

## Tasks Executed

`;
        await fs.writeFile(filePath, header + entry);
      }

      logger.info(`Memory saved to ${filePath}`);
    } catch (error) {
      logger.error('Failed to save memory:', error);
      throw error;
    }
  }

  async addLearning(learning: string): Promise<void> {
    await this.ensureDirectory();

    const filePath = this.getFilePath();
    const timestamp = new Date().toISOString();
    const entry = `- **${timestamp}** | Learnings: ${learning}\n\n`;

    try {
      const exists = await this.fileExists(filePath);

      if (exists) {
        const content = await fs.readFile(filePath, 'utf-8');
        const hasLearningsSection = content.includes('## Learnings');

        if (hasLearningsSection) {
          const parts = content.split('## Learnings');
          if (parts.length === 2) {
            const newContent = parts[0] + '## Learnings\n' + entry + parts[1];
            await fs.writeFile(filePath, newContent);
          } else {
            await fs.appendFile(filePath, '\n## Learnings\n' + entry);
          }
        } else {
          await fs.appendFile(filePath, '\n## Learnings\n' + entry);
        }
      } else {
        const header = `# Daily Memory - ${this.getTodayDate()}

## Tasks Executed

## Learnings

`;
        await fs.writeFile(filePath, header + entry);
      }

      logger.info(`Learning saved to ${filePath}`);
    } catch (error) {
      logger.error('Failed to save learning:', error);
      throw error;
    }
  }

  async addReflection(reflection: string): Promise<void> {
    await this.ensureDirectory();

    const filePath = this.getFilePath();
    const timestamp = new Date().toISOString();
    const entry = `- **${timestamp}** | Reflection: ${reflection}\n\n`;

    try {
      const exists = await this.fileExists(filePath);

      if (exists) {
        const content = await fs.readFile(filePath, 'utf-8');
        const hasReflectionsSection = content.includes('## Reflections');

        if (hasReflectionsSection) {
          const parts = content.split('## Reflections');
          if (parts.length === 2) {
            const newContent = parts[0] + '## Reflections\n' + entry + parts[1];
            await fs.writeFile(filePath, newContent);
          } else {
            await fs.appendFile(filePath, '\n## Reflections\n' + entry);
          }
        } else {
          await fs.appendFile(filePath, '\n## Reflections\n' + entry);
        }
      } else {
        const header = `# Daily Memory - ${this.getTodayDate()}

## Tasks Executed

## Learnings

## Reflections

`;
        await fs.writeFile(filePath, header + entry);
      }

      logger.info(`Reflection saved to ${filePath}`);
    } catch (error) {
      logger.error('Failed to save reflection:', error);
      throw error;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      logger.debug(`File does not exist: ${filePath}`);
      return false;
    }
  }

  async readToday(): Promise<string> {
    const filePath = this.getFilePath();

    try {
      const exists = await this.fileExists(filePath);
      if (!exists) {
        return '';
      }
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      logger.error('Failed to read memory:', error);
      return '';
    }
  }

  async readRecentDays(days: number = 7): Promise<string[]> {
    const memories: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const filename = `${year}-${month}-${day}.md`;

      const filePath = path.join(this.memoryDir, filename);

      try {
        const exists = await this.fileExists(filePath);
        if (exists) {
          const content = await fs.readFile(filePath, 'utf-8');
          memories.push(content);
        }
      } catch (err) {
        // File doesn't exist or read error, skip
        logger.debug(
          `Skipping file ${filePath}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    return memories;
  }
}

const dailyMemory = new DailyMemoryService();
const db = new DatabaseClient(Config.getInstance());

export async function memory_save(input: MemorySaveInput): Promise<string> {
  await dailyMemory.save(input);
  return `Memory saved: Task "${input.task}" - Result: ${input.result}`;
}

export async function learn(input: LearnInput): Promise<string> {
  await dailyMemory.addLearning(input.insight);

  await db.query(
    `INSERT INTO memory (content, tags, source, importance, metadata) 
     VALUES ($1, ARRAY['learning', 'reflection'], 'learn-function', $2, $3)`,
    [input.insight, input.context ? 5 : 3, JSON.stringify({ context: input.context })]
  );

  logger.info(`Learning saved via learn(): ${input.insight.substring(0, 50)}...`);
  return `Learning saved: "${input.insight.substring(0, 100)}..."`;
}

export async function suggest_prompt_update(input: SuggestPromptUpdateInput): Promise<string> {
  await db.query(
    `INSERT INTO prompt_suggestions (current_prompt, suggested_prompt, reason, status)
     VALUES ($1, $2, $3, 'pending')`,
    [input.current_prompt, input.suggested_prompt, input.reason]
  );

  logger.info(`Prompt update suggested: ${input.reason.substring(0, 50)}...`);
  return `Prompt update suggested and saved for review: ${input.reason.substring(0, 100)}...`;
}

export { dailyMemory };
