import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';

const DEFAULT_MEMORY_DIR = '.tmp/nezha-memory';

export interface DailyMemoryConfig {
  memoryDir?: string;
}

export interface MemorySaveInput {
  task: string;
  result: string;
}

export class DailyMemoryService {
  private readonly memoryDir: string;

  constructor(config?: DailyMemoryConfig) {
    this.memoryDir = config?.memoryDir ?? DEFAULT_MEMORY_DIR;
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
    const entry = `- ${timestamp} | Task: ${input.task} | Result: ${input.result}\n`;

    try {
      const exists = await this.fileExists(filePath);

      if (exists) {
        await fs.appendFile(filePath, entry);
      } else {
        const header = `# Daily Memory - ${this.getTodayDate()}\n\n`;
        await fs.writeFile(filePath, header + entry);
      }

      logger.info(`Memory saved to ${filePath}`);
    } catch (error) {
      logger.error('Failed to save memory:', error);
      throw error;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
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
}

const dailyMemory = new DailyMemoryService();

export async function memory_save(input: MemorySaveInput): Promise<string> {
  await dailyMemory.save(input);
  return `Memory saved: Task "${input.task}" - Result: ${input.result}`;
}

export { dailyMemory };
